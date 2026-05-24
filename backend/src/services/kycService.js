'use strict';

const { query, withTransaction } = require('../config/db');
const { bad, conflict, notFound, forbidden } = require('../utils/errors');
const notify = require('./notificationService');

// Aadhaar: exactly 12 digits. This is the only required identity proof.
const AADHAAR_RE = /^[0-9]{12}$/;
// PAN: 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F). Optional.
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
// IFSC: 4 letters + '0' + 6 alphanumeric (e.g. HDFC0001234). Optional.
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Bank account: 9–18 digits. Optional at submit time, required before withdrawal.
const ACCOUNT_RE = /^[0-9]{9,18}$/;

function maskAadhaar(aadhaar) {
  if (!aadhaar || aadhaar.length < 4) return aadhaar;
  return 'X'.repeat(aadhaar.length - 4) + aadhaar.slice(-4);
}
function maskPan(pan) {
  if (!pan) return null;
  if (pan.length < 10) return pan;
  return pan.slice(0, 2) + 'XXXX' + pan.slice(6);
}
function maskAccount(acc) {
  if (!acc) return null;
  if (acc.length < 4) return acc;
  return 'X'.repeat(acc.length - 4) + acc.slice(-4);
}

// --- Mentor: submit / resubmit ---------------------------------------------

async function submit({ user_id, payload }) {
  // Aadhaar is the only required field. PAN + bank info are accepted at
  // submit time if the mentor wants to fill them, but they can also be added
  // later (before the first withdrawal).
  const aadhaar    = (payload?.aadhaar_number    || '').replace(/\s+/g, '');
  const pan        = (payload?.pan_number        || '').toUpperCase().trim();
  const ifsc       = (payload?.bank_ifsc         || '').toUpperCase().trim();
  const account    = (payload?.bank_account_number || '').trim();
  const full_name  = (payload?.full_name_as_per_pan || '').trim();
  const holder     = (payload?.bank_account_holder || '').trim();

  if (!AADHAAR_RE.test(aadhaar)) {
    throw bad('invalid_aadhaar', 'Aadhaar must be exactly 12 digits');
  }
  // Each optional field: validate format only if supplied.
  if (pan     && !PAN_RE.test(pan))         throw bad('invalid_pan',     'PAN must match ABCDE1234F format');
  if (ifsc    && !IFSC_RE.test(ifsc))       throw bad('invalid_ifsc',    'IFSC must match HDFC0001234 format');
  if (account && !ACCOUNT_RE.test(account)) throw bad('invalid_account', 'Bank account must be 9–18 digits');

  // Caller must be a mentor.
  const u = await query(`SELECT role FROM users WHERE id = $1`, [user_id]);
  if (!u.rows[0] || u.rows[0].role !== 'mentor') {
    throw forbidden('mentor_only', 'Only mentors can submit KYC');
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id, status FROM mentor_kyc WHERE mentor_user_id = $1 FOR UPDATE`,
      [user_id]
    );
    if (existing.rows[0]) {
      if (existing.rows[0].status === 'pending') {
        throw conflict('kyc_pending', 'You already have a pending KYC submission');
      }
      if (existing.rows[0].status === 'approved') {
        throw conflict('kyc_approved', 'KYC already approved');
      }
      // 'rejected' → allow resubmit (UPDATE)
      const r = await client.query(
        `UPDATE mentor_kyc
            SET aadhaar_number = $1,
                pan_number = NULLIF($2, ''),
                full_name_as_per_pan = NULLIF($3, ''),
                bank_account_number = NULLIF($4, ''),
                bank_ifsc = NULLIF($5, ''),
                bank_account_holder = NULLIF($6, ''),
                status = 'pending',
                reviewer_user_id = NULL,
                reviewer_notes = NULL,
                submitted_at = NOW(),
                reviewed_at = NULL
          WHERE id = $7
          RETURNING *`,
        [aadhaar, pan, full_name, account, ifsc, holder, existing.rows[0].id]
      );
      return publicKyc(r.rows[0]);
    }
    const r = await client.query(
      `INSERT INTO mentor_kyc
         (mentor_user_id, aadhaar_number, pan_number, full_name_as_per_pan,
          bank_account_number, bank_ifsc, bank_account_holder)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''),
               NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''))
       RETURNING *`,
      [user_id, aadhaar, pan, full_name, account, ifsc, holder]
    );
    return publicKyc(r.rows[0]);
  });
}

async function getMine(user_id) {
  const r = await query(
    `SELECT * FROM mentor_kyc WHERE mentor_user_id = $1`,
    [user_id]
  );
  if (!r.rows[0]) return null;
  return publicKyc(r.rows[0]);
}

// --- Admin: list / approve / reject ----------------------------------------

async function adminList({ status = 'pending', limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);
  const r = await query(
    `SELECT k.*, u.email, u.full_name
       FROM mentor_kyc k
       JOIN users u ON u.id = k.mentor_user_id
      WHERE k.status = $1
      ORDER BY k.submitted_at ASC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    [status]
  );
  return {
    items: r.rows.map((row) => ({ ...publicKyc(row), email: row.email, full_name: row.full_name })),
    limit: limitN, offset: offsetN,
  };
}

async function approve({ admin_user_id, kyc_id, notes }) {
  return decide({ admin_user_id, kyc_id, decision: 'approved', notes });
}
async function reject({ admin_user_id, kyc_id, notes }) {
  return decide({ admin_user_id, kyc_id, decision: 'rejected', notes });
}

async function decide({ admin_user_id, kyc_id, decision, notes }) {
  return withTransaction(async (client) => {
    const before = (await client.query(`SELECT * FROM mentor_kyc WHERE id = $1 FOR UPDATE`, [kyc_id])).rows[0];
    if (!before) throw notFound('kyc_not_found');
    if (before.status !== 'pending') throw bad('already_decided', `KYC already ${before.status}`);

    const after = (await client.query(
      `UPDATE mentor_kyc
          SET status = $1,
              reviewer_user_id = $2,
              reviewer_notes = $3,
              reviewed_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [decision, admin_user_id, notes || null, kyc_id]
    )).rows[0];

    await client.query(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_table, target_id, before_state, after_state, notes)
       VALUES ($1, $2, 'mentor_kyc', $3, $4, $5, $6)`,
      [admin_user_id, `kyc_${decision}`, kyc_id, before, after, notes || null]
    );

    await notify.notify({
      client,
      user_id: before.mentor_user_id,
      kind: decision === 'approved' ? 'kyc_approved' : 'kyc_rejected',
      title: decision === 'approved'
        ? 'KYC approved — you can now withdraw earnings'
        : 'KYC was not approved',
      body: notes || null,
      link_url: '/mentor/earnings',
      reference_table: 'mentor_kyc',
      reference_id: kyc_id,
      send_email: true,
    });

    return publicKyc(after);
  });
}

// --- Helpers --------------------------------------------------------------

function publicKyc(k) {
  return {
    id: k.id,
    mentor_user_id: k.mentor_user_id,
    aadhaar_number_masked: maskAadhaar(k.aadhaar_number),
    pan_number_masked: maskPan(k.pan_number),
    full_name_as_per_pan: k.full_name_as_per_pan,
    bank_account_number_masked: maskAccount(k.bank_account_number),
    bank_ifsc: k.bank_ifsc,
    bank_account_holder: k.bank_account_holder,
    has_bank_details: !!(k.bank_account_number && k.bank_ifsc && k.bank_account_holder),
    status: k.status,
    reviewer_notes: k.reviewer_notes,
    submitted_at: k.submitted_at,
    reviewed_at: k.reviewed_at,
  };
}

// For internal callers (e.g. payoutService) that need the unmasked record.
async function getApprovedForMentor(user_id) {
  const r = await query(
    `SELECT * FROM mentor_kyc WHERE mentor_user_id = $1 AND status = 'approved'`,
    [user_id]
  );
  return r.rows[0] || null;
}

module.exports = { submit, getMine, adminList, approve, reject, getApprovedForMentor };
