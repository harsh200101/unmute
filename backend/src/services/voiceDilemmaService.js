'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const notificationService = require('./notificationService');
const { bad, forbidden, notFound } = require('../utils/errors');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'voice-dilemmas');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function saveAudioBase64(base64Data, prefix) {
  if (!base64Data) {
    throw bad('missing_audio', 'Audio recording is required');
  }
  ensureUploadDir();

  let extension = 'webm';
  let cleanBase64 = base64Data;
  const match = base64Data.match(/^data:audio\/([a-zA-Z0-9_-]+);base64,(.+)$/);
  if (match) {
    const format = match[1].toLowerCase();
    if (['webm', 'ogg', 'mp3', 'wav', 'm4a', 'aac', 'mp4'].includes(format)) {
      extension = format === 'mp4' ? 'm4a' : format;
    }
    cleanBase64 = match[2];
  }

  const filename = `${prefix}_${crypto.randomBytes(8).toString('hex')}_${Date.now()}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const buffer = Buffer.from(cleanBase64, 'base64');
  fs.writeFileSync(filePath, buffer);
  return {
    filename,
    url: `/api/voice-dilemmas/audio/${filename}`,
  };
}

async function createDilemma({
  mentee_user_id,
  mentor_uuid,
  mentor_user_id: input_mentor_user_id,
  title,
  category,
  audio_base64,
  audio_duration_seconds = 0,
  text_notes = '',
  is_anonymous = false,
}) {
  if (!title || !title.trim()) {
    throw bad('missing_title', 'Title is required for your voice dilemma');
  }
  if (!category || !category.trim()) {
    throw bad('missing_category', 'Category is required');
  }
  if (!audio_base64) {
    throw bad('missing_audio', 'Audio recording is required');
  }

  // Resolve mentor_user_id if mentor_uuid is provided
  let mentor_user_id = input_mentor_user_id;
  if (!mentor_user_id && mentor_uuid) {
    const mentorProfile = (
      await query(
        `SELECT user_id FROM mentor_profiles WHERE uuid = $1
         UNION
         SELECT id AS user_id FROM users WHERE uuid = $1
         LIMIT 1`,
        [mentor_uuid]
      )
    ).rows[0];

    if (!mentorProfile) {
      throw notFound('mentor_not_found', 'Selected mentor was not found');
    }
    mentor_user_id = mentorProfile.user_id;
  }

  if (!mentor_user_id) {
    throw bad('missing_mentor', 'Mentor identifier is required');
  }

  if (Number(mentor_user_id) === Number(mentee_user_id)) {
    throw bad('cannot_ask_self', 'You cannot submit a dilemma to yourself');
  }

  // Verify mentor exists and is active/approved
  const mentorUser = (
    await query(
      `SELECT u.id, u.full_name, u.email, mp.verification_status
       FROM users u
       LEFT JOIN mentor_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [mentor_user_id]
    )
  ).rows[0];

  if (!mentorUser) {
    throw notFound('mentor_not_found', 'Selected mentor does not exist');
  }

  const FEE_PAISE = 9900; // ?99 = 9900 paise

  // Save audio file to uploads/voice-dilemmas
  const { url: mentee_audio_url } = saveAudioBase64(audio_base64, `mentee_${mentee_user_id}`);

  // Transactionally check wallet balance, debit fee, insert dilemma
  const createdDilemma = await withTransaction(async (client) => {
    // 1. Lock mentee wallet & verify balance
    const walletRes = await client.query(
      `SELECT id, balance_paise FROM wallets WHERE user_id = $1 AND kind = 'mentee' FOR UPDATE`,
      [mentee_user_id]
    );
    const menteeWallet = walletRes.rows[0];
    if (!menteeWallet) {
      throw bad('mentee_wallet_not_found', 'Mentee wallet not found');
    }

    if (menteeWallet.balance_paise < FEE_PAISE) {
      throw bad(
        'insufficient_balance',
        `Insufficient balance. Voice Dilemma requires ?${(FEE_PAISE / 100).toFixed(0)}, but your balance is ?${(menteeWallet.balance_paise / 100).toFixed(2)}. Please top up.`
      );
    }

    // 2. Insert voice dilemma
    const dilemmaRes = await client.query(
      `INSERT INTO voice_dilemmas
         (mentee_user_id, mentor_user_id, title, category, mentee_audio_url,
          mentee_audio_duration_seconds, mentee_text_notes, is_anonymous, fee_paise, status)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted')
       RETURNING *`,
      [
        mentee_user_id,
        mentor_user_id,
        title.trim(),
        category.trim(),
        mentee_audio_url,
        Math.round(Number(audio_duration_seconds) || 0),
        text_notes ? text_notes.trim() : null,
        Boolean(is_anonymous),
        FEE_PAISE,
      ]
    );
    const dilemma = dilemmaRes.rows[0];

    // 3. Debit mentee wallet
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, reference_table, reference_id,
          idempotency_key, description, balance_after_paise)
       VALUES
         ($1, 'debit', $2, 'voice_dilemma_fee', 'voice_dilemmas', $3, $4, $5, 0)`,
      [
        menteeWallet.id,
        FEE_PAISE,
        dilemma.id,
        `voice_dilemma:${dilemma.uuid}:fee`,
        `Voice dilemma submission fee: "${title.trim()}"`,
      ]
    );

    return dilemma;
  });

  // Notify mentor out-of-transaction (best-effort)
  try {
    await notificationService.notify({
      user_id: mentor_user_id,
      kind: 'voice_dilemma_received',
      title: 'New Voice Dilemma received (?99)',
      body: `A mentee sent you an async voice dilemma: "${title.trim()}"`,
      link_url: '/dashboard',
      reference_table: 'voice_dilemmas',
      reference_id: createdDilemma.id,
      send_email: true,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[voiceDilemmaService] Failed to send mentor notification:', err.message);
  }

  return createdDilemma;
}

function maskMentee(row, viewerUserId) {
  const isMenteeViewer = Number(viewerUserId) === Number(row.mentee_user_id);
  if (row.is_anonymous && !isMenteeViewer) {
    return {
      ...row,
      mentee_name: 'Anonymous Mentee',
      mentee_avatar_url: null,
      mentee_email: null,
    };
  }
  return {
    ...row,
    mentee_name: row.raw_mentee_name,
    mentee_avatar_url: row.raw_mentee_avatar_url,
    mentee_email: isMenteeViewer ? row.raw_mentee_email : null,
  };
}

async function listMyDilemmas({ user_id, role, status }) {
  const params = [user_id];
  let filterRoleClause = '';

  if (role === 'mentor') {
    filterRoleClause = 'AND vd.mentor_user_id = $1';
  } else if (role === 'mentee') {
    filterRoleClause = 'AND vd.mentee_user_id = $1';
  } else {
    filterRoleClause = 'AND (vd.mentee_user_id = $1 OR vd.mentor_user_id = $1)';
  }

  let statusClause = '';
  if (status) {
    params.push(status);
    statusClause = `AND vd.status = $${params.length}`;
  }

  const sql = `
    SELECT
      vd.*,
      mente_u.full_name AS raw_mentee_name,
      mente_u.avatar_url AS raw_mentee_avatar_url,
      mente_u.email AS raw_mentee_email,
      mento_u.full_name AS mentor_name,
      mento_u.avatar_url AS mentor_avatar_url,
      mento_p.headline AS mentor_headline
    FROM voice_dilemmas vd
    JOIN users mente_u ON mente_u.id = vd.mentee_user_id
    JOIN users mento_u ON mento_u.id = vd.mentor_user_id
    LEFT JOIN mentor_profiles mento_p ON mento_p.user_id = vd.mentor_user_id
    WHERE 1=1 ${filterRoleClause} ${statusClause}
    ORDER BY vd.created_at DESC
  `;

  const res = await query(sql, params);
  return res.rows.map((row) => maskMentee(row, user_id));
}

async function getDilemmaByUuid({ uuid, user_id }) {
  const sql = `
    SELECT
      vd.*,
      mente_u.full_name AS raw_mentee_name,
      mente_u.avatar_url AS raw_mentee_avatar_url,
      mente_u.email AS raw_mentee_email,
      mento_u.full_name AS mentor_name,
      mento_u.avatar_url AS mentor_avatar_url,
      mento_p.headline AS mentor_headline
    FROM voice_dilemmas vd
    JOIN users mente_u ON mente_u.id = vd.mentee_user_id
    JOIN users mento_u ON mento_u.id = vd.mentor_user_id
    LEFT JOIN mentor_profiles mento_p ON mento_p.user_id = vd.mentor_user_id
    WHERE vd.uuid = $1
  `;

  const res = await query(sql, [uuid]);
  const row = res.rows[0];
  if (!row) {
    throw notFound('dilemma_not_found', 'Voice dilemma not found');
  }

  const isMentee = Number(user_id) === Number(row.mentee_user_id);
  const isMentor = Number(user_id) === Number(row.mentor_user_id);

  if (!isMentee && !isMentor) {
    throw forbidden('forbidden', 'You do not have permission to view this dilemma');
  }

  return maskMentee(row, user_id);
}

async function answerDilemma({
  uuid,
  mentor_user_id,
  audio_base64,
  audio_duration_seconds = 0,
  written_takeaway = '',
}) {
  if (!audio_base64) {
    throw bad('missing_audio', 'Audio reply is required');
  }
  if (!written_takeaway || !written_takeaway.trim()) {
    throw bad('missing_takeaway', 'Written takeaway / action points are required');
  }

  const dilemmaRes = await query(
    `SELECT * FROM voice_dilemmas WHERE uuid = $1`,
    [uuid]
  );
  const dilemma = dilemmaRes.rows[0];
  if (!dilemma) {
    throw notFound('dilemma_not_found', 'Voice dilemma not found');
  }

  if (Number(dilemma.mentor_user_id) !== Number(mentor_user_id)) {
    throw forbidden('forbidden', 'Only the assigned mentor can answer this dilemma');
  }

  if (dilemma.status !== 'submitted') {
    throw bad('invalid_status', `Cannot answer dilemma with status "${dilemma.status}"`);
  }

  const PAYOUT_PAISE = 6930; // 70% of ?99 (9900 paise) = 6930 paise (?69.30)
  const PLATFORM_SHARE_PAISE = 2970; // 30% of ?99 = 2970 paise

  // Save mentor audio file
  const { url: mentor_audio_url } = saveAudioBase64(audio_base64, `mentor_${mentor_user_id}`);

  const updatedDilemma = await withTransaction(async (client) => {
    // 1. Lock mentor wallet
    const mentorWalletRes = await client.query(
      `SELECT id FROM wallets WHERE user_id = $1 AND kind = 'mentor' FOR UPDATE`,
      [mentor_user_id]
    );
    const mentorWallet = mentorWalletRes.rows[0];
    if (!mentorWallet) {
      throw notFound('mentor_wallet_not_found', 'Mentor wallet not found');
    }

    // 2. Update dilemma status & audio details
    const updateRes = await client.query(
      `UPDATE voice_dilemmas
       SET mentor_audio_url = $1,
           mentor_audio_duration_seconds = $2,
           mentor_written_takeaway = $3,
           status = 'answered',
           answered_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        mentor_audio_url,
        Math.round(Number(audio_duration_seconds) || 0),
        written_takeaway.trim(),
        dilemma.id,
      ]
    );
    const answeredRecord = updateRes.rows[0];

    // 3. Credit mentor wallet with 6930 paise
    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, reference_table, reference_id,
          idempotency_key, description, balance_after_paise)
       VALUES
         ($1, 'credit', $2, 'voice_dilemma_payout', 'voice_dilemmas', $3, $4, $5, 0)`,
      [
        mentorWallet.id,
        PAYOUT_PAISE,
        dilemma.id,
        `voice_dilemma:${dilemma.uuid}:payout`,
        `Payout for answering Voice Dilemma: "${dilemma.title}" (?69.30)`,
      ]
    );

    // 4. Optionally credit platform wallet if exists
    const platRes = await client.query(
      `SELECT id FROM wallets WHERE kind = 'platform' LIMIT 1 FOR UPDATE`
    );
    if (platRes.rows[0] && PLATFORM_SHARE_PAISE > 0) {
      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason, reference_table, reference_id,
            idempotency_key, description, balance_after_paise)
         VALUES
           ($1, 'credit', $2, 'platform_fee', 'voice_dilemmas', $3, $4, $5, 0)`,
        [
          platRes.rows[0].id,
          PLATFORM_SHARE_PAISE,
          dilemma.id,
          `voice_dilemma:${dilemma.uuid}:platform_fee`,
          `Platform share (30%) for Voice Dilemma: "${dilemma.title}"`,
        ]
      );
    }

    return answeredRecord;
  });

  // Notify mentee
  try {
    await notificationService.notify({
      user_id: dilemma.mentee_user_id,
      kind: 'voice_dilemma_answered',
      title: 'Your Voice Dilemma has been answered! 🎙️',
      body: `Your mentor recorded a response to "${dilemma.title}". Listen now in your dashboard.`,
      link_url: '/dashboard',
      reference_table: 'voice_dilemmas',
      reference_id: dilemma.id,
      send_email: true,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[voiceDilemmaService] Failed to send mentee notification:', err.message);
  }

  return updatedDilemma;
}

module.exports = {
  createDilemma,
  listMyDilemmas,
  getDilemmaByUuid,
  answerDilemma,
};
