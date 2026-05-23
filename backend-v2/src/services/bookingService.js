'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, conflict, notFound, forbidden } = require('../utils/errors');
const availability = require('./availabilityService');
const email = require('./emailService');
const { buildICS } = require('./icsService');
const notify = require('./notificationService');

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const LATE_CANCEL_PENALTY_PAISE = 5000; // ₹50

// --- Helpers ---------------------------------------------------------------

async function loadBookingByUuid(client, uuid) {
  const exec = client ? client.query.bind(client) : query;
  const r = await exec(
    `SELECT b.*,
            mu.email AS mentor_email, mu.full_name AS mentor_name,
            cu.email AS mentee_email, cu.full_name AS mentee_name,
            cu.date_of_birth   AS mentee_dob,
            cu.gender          AS mentee_gender,
            cu.marital_status  AS mentee_marital_status,
            cu.location_city   AS mentee_city,
            cu.preferences     AS mentee_preferences,
            mp.timezone AS mentor_timezone, mp.uuid AS mentor_profile_uuid
       FROM bookings b
       JOIN users mu ON mu.id = b.mentor_user_id
       JOIN users cu ON cu.id = b.mentee_user_id
       JOIN mentor_profiles mp ON mp.user_id = b.mentor_user_id
      WHERE b.uuid = $1`,
    [uuid]
  );
  return r.rows[0] || null;
}

function ensureParty(booking, user_id) {
  if (booking.mentor_user_id !== user_id && booking.mentee_user_id !== user_id) {
    throw forbidden('not_a_party', 'You are not part of this booking');
  }
  return booking.mentor_user_id === user_id ? 'mentor' : 'mentee';
}

async function getWalletId(client, user_id, kind) {
  const exec = client ? client.query.bind(client) : query;
  const r = await exec(
    `SELECT id FROM wallets WHERE user_id = $1 AND kind = $2`,
    [user_id, kind]
  );
  return r.rows[0]?.id || null;
}

let _platformWalletIdCache = null;
async function getPlatformWalletId(client) {
  if (_platformWalletIdCache) return _platformWalletIdCache;
  const exec = client ? client.query.bind(client) : query;
  const r = await exec(`SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1`);
  if (!r.rows[0]) throw new Error('No platform wallet seeded — run npm run seed');
  _platformWalletIdCache = r.rows[0].id;
  return _platformWalletIdCache;
}

function publicBooking(b) {
  // Mentee demographic fields are included on the booking response, but each
  // field is gated by the mentee's `preferences.share_with_mentor.<field>`
  // flag. Default = SHOW (so existing data isn't suddenly hidden). The
  // mentee can flip individual flags from /me/profile to redact a field.
  //
  // Privacy model: the /api/bookings/:uuid route is auth'd and only returns
  // to the two parties of the booking. The mentee always sees their own data.
  const share = b.mentee_preferences?.share_with_mentor || {};
  const visible = (field) => share[field] !== false; // undefined → show
  return {
    uuid: b.uuid,
    mentor: { id: b.mentor_user_id, full_name: b.mentor_name, email: b.mentor_email, profile_uuid: b.mentor_profile_uuid, timezone: b.mentor_timezone },
    mentee: {
      id: b.mentee_user_id,
      full_name: b.mentee_name,
      email: b.mentee_email,
      date_of_birth:  visible('age')            ? (b.mentee_dob            || null) : null,
      gender:         visible('gender')         ? (b.mentee_gender         || null) : null,
      marital_status: visible('marital_status') ? (b.mentee_marital_status || null) : null,
      location_city:  visible('city')           ? (b.mentee_city           || null) : null,
    },
    slot_start_at: b.slot_start_at,
    slot_end_at: b.slot_end_at,
    per_minute_paise_snapshot: b.per_minute_paise_snapshot,
    mentee_title: b.mentee_title,
    mentee_topic: b.mentee_topic,
    status: b.status,
    cancelled_at: b.cancelled_at,
    cancel_reason: b.cancel_reason,
    reschedule_to_at: b.reschedule_to_at,
    reschedule_proposed_by_user_id: b.reschedule_proposed_by_user_id,
    reschedule_proposed_at: b.reschedule_proposed_at,
    created_at: b.created_at,
  };
}

async function isSlotAvailable({ mentor_user_id, mentor_uuid, slot_start_at }) {
  // Use the availability computer with a tight 2-min window
  const from = new Date(new Date(slot_start_at).getTime() - 60_000).toISOString();
  const to = new Date(new Date(slot_start_at).getTime() + 60_000).toISOString();
  const result = await availability.computeSlots({ mentor_uuid, from, to });
  return result.slots.some((s) => new Date(s).getTime() === new Date(slot_start_at).getTime());
}

// --- Create ----------------------------------------------------------------

async function createBooking({ mentee_user_id, mentor_uuid, slot_start_at, mentee_title, mentee_topic }) {
  if (!mentor_uuid || !slot_start_at) {
    throw bad('missing_fields', 'mentor_uuid and slot_start_at are required');
  }
  const start = new Date(slot_start_at);
  if (Number.isNaN(start.getTime())) throw bad('invalid_slot_at');

  // Resolve mentor + price tier
  const m = await query(
    `SELECT mp.user_id, mp.uuid AS profile_uuid, mp.verification_status,
            mp.pricing_tier_id, pt.per_minute_paise
       FROM mentor_profiles mp
       JOIN pricing_tiers pt ON pt.id = mp.pricing_tier_id
      WHERE mp.uuid = $1`,
    [mentor_uuid]
  );
  if (!m.rows[0]) throw notFound('mentor_not_found');
  if (m.rows[0].verification_status !== 'approved') throw notFound('mentor_not_found');
  if (m.rows[0].user_id === mentee_user_id) throw bad('cannot_book_self');

  // Verify the slot is actually open
  const ok = await isSlotAvailable({
    mentor_user_id: m.rows[0].user_id,
    mentor_uuid,
    slot_start_at: start.toISOString(),
  });
  if (!ok) throw conflict('slot_unavailable', 'That slot is not bookable (already booked, blocked, or outside availability)');

  const end = new Date(start.getTime() + 60 * 60_000);

  let booking;
  try {
    const r = await query(
      `INSERT INTO bookings
         (mentor_user_id, mentee_user_id, slot_start_at, slot_end_at,
          per_minute_paise_snapshot, mentee_title, mentee_topic, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled')
       RETURNING *`,
      [
        m.rows[0].user_id,
        mentee_user_id,
        start.toISOString(),
        end.toISOString(),
        m.rows[0].per_minute_paise,
        mentee_title || null,
        mentee_topic || null,
      ]
    );
    booking = r.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      // Lost the race; surface as conflict
      throw conflict('slot_unavailable', 'That slot was just taken by someone else');
    }
    throw err;
  }

  // Fire-and-forget confirmation emails + in-app notifications
  try {
    const full = await loadBookingByUuid(null, booking.uuid);
    await sendBookingConfirmationEmails(full);
    await notifyParties(full, {
      kind: 'booking_confirmed',
      title_for_mentor: `Booking from ${full.mentee_name}`,
      title_for_mentee: `Booking confirmed with ${full.mentor_name}`,
      body: new Date(full.slot_start_at).toISOString(),
      link_url: `/bookings/${full.uuid}`,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[booking] notify failed:', e.message);
  }

  const full = await loadBookingByUuid(null, booking.uuid);
  return publicBooking(full);
}

async function notifyParties(b, { kind, title_for_mentor, title_for_mentee, body, link_url }) {
  await notify.notify({
    user_id: b.mentor_user_id, kind, title: title_for_mentor, body, link_url,
    reference_table: 'bookings', reference_id: b.id,
  });
  await notify.notify({
    user_id: b.mentee_user_id, kind, title: title_for_mentee, body, link_url,
    reference_table: 'bookings', reference_id: b.id,
  });
}

async function sendBookingConfirmationEmails(b) {
  const ics = buildICS({
    uid: `booking-${b.uuid}@unmute`,
    start_at: b.slot_start_at,
    end_at: b.slot_end_at,
    summary: `unmute session with ${b.mentor_name}`,
    description: b.mentee_title || 'Mentoring session',
    organizer_email: b.mentor_email,
    attendee_emails: [b.mentee_email],
  });
  await email.sendEmail(email.bookingConfirmedEmail({
    to: b.mentee_email,
    full_name: b.mentee_name,
    other_name: b.mentor_name,
    slot_start_at: b.slot_start_at,
    slot_end_at: b.slot_end_at,
    mentee_title: b.mentee_title,
    ics_string: ics,
    viewer_tz: b.mentor_timezone,
  }));
  await email.sendEmail(email.bookingConfirmedEmail({
    to: b.mentor_email,
    full_name: b.mentor_name,
    other_name: b.mentee_name,
    slot_start_at: b.slot_start_at,
    slot_end_at: b.slot_end_at,
    mentee_title: b.mentee_title,
    ics_string: ics,
    viewer_tz: b.mentor_timezone,
  }));
}

// --- List + detail ---------------------------------------------------------

async function listForUser({ user_id, role, status, from, to, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const params = [user_id];
  const where = [];
  if (role === 'mentor') {
    where.push(`b.mentor_user_id = $1`);
  } else if (role === 'mentee') {
    where.push(`b.mentee_user_id = $1`);
  } else {
    where.push(`(b.mentor_user_id = $1 OR b.mentee_user_id = $1)`);
  }
  if (status) {
    params.push(status);
    where.push(`b.status = $${params.length}`);
  }
  if (from) {
    params.push(from);
    where.push(`b.slot_start_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`b.slot_start_at < $${params.length}`);
  }

  const sql = `
    SELECT b.*,
           mu.email AS mentor_email, mu.full_name AS mentor_name,
           cu.email AS mentee_email, cu.full_name AS mentee_name,
           mp.timezone AS mentor_timezone, mp.uuid AS mentor_profile_uuid
      FROM bookings b
      JOIN users mu ON mu.id = b.mentor_user_id
      JOIN users cu ON cu.id = b.mentee_user_id
      JOIN mentor_profiles mp ON mp.user_id = b.mentor_user_id
     WHERE ${where.join(' AND ')}
     ORDER BY b.slot_start_at DESC
     LIMIT ${limitN} OFFSET ${offsetN}`;
  const r = await query(sql, params);
  return { items: r.rows.map(publicBooking), limit: limitN, offset: offsetN };
}

async function getByUuidForUser({ user_id, uuid }) {
  const b = await loadBookingByUuid(null, uuid);
  if (!b) throw notFound('booking_not_found');
  ensureParty(b, user_id);
  return publicBooking(b);
}

// --- Cancel ----------------------------------------------------------------

const CANCELLABLE_STATUSES = new Set(['scheduled']);

async function cancelBooking({ user_id, uuid, reason }) {
  return withTransaction(async (client) => {
    const b = await loadBookingByUuid(client, uuid);
    if (!b) throw notFound('booking_not_found');
    const role = ensureParty(b, user_id);
    if (!CANCELLABLE_STATUSES.has(b.status)) {
      throw bad('not_cancellable', `Booking is ${b.status}; can only cancel 'scheduled' bookings`);
    }

    const msToStart = new Date(b.slot_start_at).getTime() - Date.now();
    const isLate = msToStart < FOUR_HOURS_MS;
    const newStatus = role === 'mentee' ? 'cancelled_by_mentee' : 'cancelled_by_mentor';

    await client.query(
      `UPDATE bookings
          SET status = $1, cancelled_at = NOW(), cancel_reason = $2
        WHERE id = $3`,
      [newStatus, reason || null, b.id]
    );

    // Bump no_show_count? No — that's reserved for true no-shows (didn't join).
    // Bump late_cancel_count if late.
    if (isLate) {
      await client.query(
        `UPDATE users SET late_cancel_count = late_cancel_count + 1 WHERE id = $1`,
        [user_id]
      );
      await applyLatePenalty(client, { canceller_id: user_id, canceller_role: role, booking: b });
    }

    // Email both parties + in-app notify
    try {
      const updated = await loadBookingByUuid(client, uuid);
      await notifyParties(updated, {
        kind: 'booking_cancelled',
        title_for_mentor: `Booking cancelled by ${role === 'mentee' ? 'mentee' : 'you'}`,
        title_for_mentee: `Booking cancelled by ${role === 'mentor' ? 'mentor' : 'you'}`,
        body: new Date(updated.slot_start_at).toISOString(),
        link_url: `/bookings/${updated.uuid}`,
      });
      const byLabel = role === 'mentee' ? 'mentee' : 'mentor';
      const other_to = role === 'mentee' ? updated.mentor_email : updated.mentee_email;
      const other_name = role === 'mentee' ? updated.mentor_name : updated.mentee_name;
      const self_to = role === 'mentee' ? updated.mentee_email : updated.mentor_email;
      const self_name = role === 'mentee' ? updated.mentee_name : updated.mentor_name;
      const other_party_name = role === 'mentee' ? updated.mentee_name : updated.mentor_name;
      const self_party_name = role === 'mentee' ? updated.mentor_name : updated.mentee_name;

      await email.sendEmail(email.bookingCancelledEmail({
        to: other_to, full_name: other_name,
        other_name: other_party_name, slot_start_at: updated.slot_start_at,
        by: byLabel, reason, viewer_tz: updated.mentor_timezone,
      }));
      await email.sendEmail(email.bookingCancelledEmail({
        to: self_to, full_name: self_name,
        other_name: self_party_name, slot_start_at: updated.slot_start_at,
        by: byLabel, reason, viewer_tz: updated.mentor_timezone,
      }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[booking] cancel email failed:', e.message);
    }

    const refreshed = await loadBookingByUuid(client, uuid);
    return { booking: publicBooking(refreshed), late: isLate, penalty_paise: isLate ? LATE_CANCEL_PENALTY_PAISE : 0 };
  });
}

// Late-cancel penalty: ALWAYS compensate the other party the full ₹50. Debit
// the canceller up to balance; deficit (if any) is recorded as a debt on
// users.pending_penalty_paise, and the platform wallet fronts the difference.
// When the canceller next tops up their wallet (phase 5), the topup flow
// will clear the debt first.
async function applyLatePenalty(client, { canceller_id, canceller_role, booking }) {
  const cancellerWalletKind = canceller_role === 'mentee' ? 'mentee' : 'mentor';
  const otherWalletKind = canceller_role === 'mentee' ? 'mentor' : 'mentee';
  const other_user_id = canceller_role === 'mentee' ? booking.mentor_user_id : booking.mentee_user_id;

  const canceller_wallet_id = await getWalletId(client, canceller_id, cancellerWalletKind);
  const other_wallet_id = await getWalletId(client, other_user_id, otherWalletKind);
  const platform_wallet_id = await getPlatformWalletId(client);

  // Read canceller balance
  let actuallyDebited = 0;
  if (canceller_wallet_id) {
    const w = await client.query(`SELECT balance_paise FROM wallets WHERE id = $1 FOR UPDATE`, [canceller_wallet_id]);
    const bal = w.rows[0].balance_paise;
    actuallyDebited = Math.min(bal, LATE_CANCEL_PENALTY_PAISE);
    if (actuallyDebited > 0) {
      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason, reference_table, reference_id, description, balance_after_paise)
         VALUES ($1, 'debit', $2, 'late_cancel_penalty', 'bookings', $3, $4, 0)`,
        [canceller_wallet_id, actuallyDebited, booking.id, `Late cancellation penalty for booking ${booking.uuid}`]
      );
    }
  }
  const deficit = LATE_CANCEL_PENALTY_PAISE - actuallyDebited;

  // Record deficit as debt on canceller
  if (deficit > 0) {
    await client.query(
      `UPDATE users SET pending_penalty_paise = pending_penalty_paise + $1 WHERE id = $2`,
      [deficit, canceller_id]
    );
    // Platform fronts the deficit. The platform wallet may go through a debit
    // larger than its balance — but the wallet has CHECK >= 0 so this needs
    // funding. For simplicity, we credit the platform first up to deficit so
    // it can immediately debit the same amount out. In MVP we just track the
    // deficit owed to platform: a "platform IOU" credit + debit pair.
    // For now, just credit the platform with what we debited (so platform
    // P&L is correct: it received `actuallyDebited` from canceller).
  }

  // Credit "other party" the full LATE_CANCEL_PENALTY_PAISE.
  // To balance the books: actuallyDebited came from canceller, deficit comes
  // from platform wallet. The platform wallet must therefore be funded; in
  // MVP we trust the seeded platform wallet to absorb this. If it can't
  // (CHECK >= 0), we fall back to only crediting actuallyDebited so the
  // ledger always balances.
  let creditAmount = LATE_CANCEL_PENALTY_PAISE;
  if (deficit > 0) {
    const p = await client.query(`SELECT balance_paise FROM wallets WHERE id = $1 FOR UPDATE`, [platform_wallet_id]);
    if (p.rows[0].balance_paise < deficit) {
      // Platform can't front the gap. Credit other party only what we actually debited.
      creditAmount = actuallyDebited;
    } else {
      // Platform fronts the gap to "other party"
      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason, reference_table, reference_id, description, balance_after_paise)
         VALUES ($1, 'debit', $2, 'late_cancel_compensation', 'bookings', $3, $4, 0)`,
        [platform_wallet_id, deficit, booking.id, `Platform-fronted gap on booking ${booking.uuid}`]
      );
    }
  }

  if (other_wallet_id && creditAmount > 0) {
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, reference_table, reference_id, description, balance_after_paise)
       VALUES ($1, 'credit', $2, 'late_cancel_compensation', 'bookings', $3, $4, 0)`,
      [other_wallet_id, creditAmount, booking.id, `Compensation for late cancellation of booking ${booking.uuid}`]
    );
  }
  // Also credit the platform wallet with what canceller actually paid in
  // (so platform balance reflects the inflow).
  if (actuallyDebited > 0) {
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, reference_table, reference_id, description, balance_after_paise)
       VALUES ($1, 'credit', $2, 'late_cancel_penalty', 'bookings', $3, $4, 0)`,
      [platform_wallet_id, actuallyDebited, booking.id, `Late cancel penalty received from user ${canceller_id}`]
    );
  }
}

// --- Reschedule ------------------------------------------------------------

async function proposeReschedule({ user_id, uuid, new_slot_start_at }) {
  if (!new_slot_start_at) throw bad('missing_new_slot_at');
  const newStart = new Date(new_slot_start_at);
  if (Number.isNaN(newStart.getTime())) throw bad('invalid_new_slot_at');

  return withTransaction(async (client) => {
    const b = await loadBookingByUuid(client, uuid);
    if (!b) throw notFound('booking_not_found');
    ensureParty(b, user_id);
    if (b.status !== 'scheduled') throw bad('not_reschedulable', `Booking is ${b.status}`);

    const msToOldStart = new Date(b.slot_start_at).getTime() - Date.now();
    if (msToOldStart < FOUR_HOURS_MS) throw bad('too_late_to_reschedule', 'Original slot is less than 4 hours away');
    const msToNewStart = newStart.getTime() - Date.now();
    if (msToNewStart < FOUR_HOURS_MS) throw bad('too_late_to_reschedule', 'New slot must be at least 4 hours from now');

    // The new slot must be currently bookable (subject to mentor availability + not yet booked)
    const ok = await isSlotAvailable({
      mentor_user_id: b.mentor_user_id,
      mentor_uuid: b.mentor_profile_uuid,
      slot_start_at: newStart.toISOString(),
    });
    if (!ok) throw conflict('new_slot_unavailable');

    await client.query(
      `UPDATE bookings
          SET reschedule_to_at = $1,
              reschedule_proposed_by_user_id = $2,
              reschedule_proposed_at = NOW()
        WHERE id = $3`,
      [newStart.toISOString(), user_id, b.id]
    );

    // Email the other party
    try {
      const updated = await loadBookingByUuid(client, uuid);
      const proposer_is_mentee = user_id === updated.mentee_user_id;
      const to = proposer_is_mentee ? updated.mentor_email : updated.mentee_email;
      const to_name = proposer_is_mentee ? updated.mentor_name : updated.mentee_name;
      const from_name = proposer_is_mentee ? updated.mentee_name : updated.mentor_name;
      await email.sendEmail(email.rescheduleProposedEmail({
        to, full_name: to_name, other_name: from_name,
        old_slot: updated.slot_start_at, new_slot: updated.reschedule_to_at,
        viewer_tz: updated.mentor_timezone,
      }));
    } catch (e) { /* swallow */ }

    const refreshed = await loadBookingByUuid(client, uuid);
    return publicBooking(refreshed);
  });
}

async function acceptReschedule({ user_id, uuid }) {
  return withTransaction(async (client) => {
    const b = await loadBookingByUuid(client, uuid);
    if (!b) throw notFound('booking_not_found');
    ensureParty(b, user_id);
    if (!b.reschedule_to_at) throw bad('no_pending_reschedule');
    if (b.reschedule_proposed_by_user_id === user_id) {
      throw bad('cannot_accept_own_proposal', 'The other party must accept the proposal');
    }

    const newStart = new Date(b.reschedule_to_at);
    const newEnd = new Date(newStart.getTime() + 60 * 60_000);

    // Verify still bookable (could have been taken by someone else)
    const ok = await isSlotAvailable({
      mentor_user_id: b.mentor_user_id,
      mentor_uuid: b.mentor_profile_uuid,
      slot_start_at: newStart.toISOString(),
    });
    if (!ok) {
      // Clear the stale proposal
      await client.query(
        `UPDATE bookings
            SET reschedule_to_at = NULL, reschedule_proposed_by_user_id = NULL, reschedule_proposed_at = NULL
          WHERE id = $1`,
        [b.id]
      );
      throw conflict('new_slot_unavailable', 'That slot is no longer available — the proposal has been cleared');
    }

    try {
      await client.query(
        `UPDATE bookings
            SET slot_start_at = $1,
                slot_end_at = $2,
                reschedule_to_at = NULL,
                reschedule_proposed_by_user_id = NULL,
                reschedule_proposed_at = NULL
          WHERE id = $3`,
        [newStart.toISOString(), newEnd.toISOString(), b.id]
      );
    } catch (err) {
      if (err.code === '23505') throw conflict('new_slot_unavailable');
      throw err;
    }

    // Email both parties with updated invite
    try {
      const updated = await loadBookingByUuid(client, uuid);
      const ics = buildICS({
        uid: `booking-${updated.uuid}@unmute`,
        start_at: updated.slot_start_at,
        end_at: updated.slot_end_at,
        summary: `unmute session with ${updated.mentor_name}`,
        description: updated.mentee_title || 'Mentoring session',
        organizer_email: updated.mentor_email,
        attendee_emails: [updated.mentee_email],
        sequence: 1,
      });
      await email.sendEmail(email.rescheduleAcceptedEmail({
        to: updated.mentee_email, full_name: updated.mentee_name,
        other_name: updated.mentor_name, new_slot: updated.slot_start_at, ics_string: ics,
        viewer_tz: updated.mentor_timezone,
      }));
      await email.sendEmail(email.rescheduleAcceptedEmail({
        to: updated.mentor_email, full_name: updated.mentor_name,
        other_name: updated.mentee_name, new_slot: updated.slot_start_at, ics_string: ics,
        viewer_tz: updated.mentor_timezone,
      }));
    } catch (e) { /* swallow */ }

    const refreshed = await loadBookingByUuid(client, uuid);
    return publicBooking(refreshed);
  });
}

async function declineReschedule({ user_id, uuid }) {
  return withTransaction(async (client) => {
    const b = await loadBookingByUuid(client, uuid);
    if (!b) throw notFound('booking_not_found');
    ensureParty(b, user_id);
    if (!b.reschedule_to_at) throw bad('no_pending_reschedule');
    if (b.reschedule_proposed_by_user_id === user_id) {
      throw bad('cannot_decline_own_proposal');
    }

    await client.query(
      `UPDATE bookings
          SET reschedule_to_at = NULL,
              reschedule_proposed_by_user_id = NULL,
              reschedule_proposed_at = NULL
        WHERE id = $1`,
      [b.id]
    );

    try {
      const refreshed = await loadBookingByUuid(client, uuid);
      const proposer_is_mentee = b.reschedule_proposed_by_user_id === refreshed.mentee_user_id;
      const to = proposer_is_mentee ? refreshed.mentee_email : refreshed.mentor_email;
      const to_name = proposer_is_mentee ? refreshed.mentee_name : refreshed.mentor_name;
      const other_name = proposer_is_mentee ? refreshed.mentor_name : refreshed.mentee_name;
      await email.sendEmail(email.rescheduleDeclinedEmail({
        to, full_name: to_name, other_name,
        original_slot: refreshed.slot_start_at,
        viewer_tz: refreshed.mentor_timezone,
      }));
    } catch (e) { /* swallow */ }

    const refreshed = await loadBookingByUuid(client, uuid);
    return publicBooking(refreshed);
  });
}

module.exports = {
  createBooking,
  listForUser,
  getByUuidForUser,
  cancelBooking,
  proposeReschedule,
  acceptReschedule,
  declineReschedule,
  // exposed for tests
  LATE_CANCEL_PENALTY_PAISE,
  FOUR_HOURS_MS,
};
