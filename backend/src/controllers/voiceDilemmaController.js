'use strict';

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const svc = require('../services/voiceDilemmaService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'voice-dilemmas');

async function create(req, res, next) {
  try {
    const dilemma = await svc.createDilemma({
      mentee_user_id: req.user.id,
      mentor_uuid: req.body?.mentor_uuid,
      mentor_user_id: req.body?.mentor_user_id,
      title: req.body?.title,
      category: req.body?.category,
      audio_base64: req.body?.audio_base64,
      audio_duration_seconds: req.body?.audio_duration_seconds,
      text_notes: req.body?.text_notes,
      is_anonymous: req.body?.is_anonymous,
    });
    res.status(201).json({ dilemma });
  } catch (err) {
    next(err);
  }
}

async function listMy(req, res, next) {
  try {
    const items = await svc.listMyDilemmas({
      user_id: req.user.id,
      role: req.query.role,
      status: req.query.status,
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const dilemma = await svc.getDilemmaByUuid({
      uuid: req.params.uuid,
      user_id: req.user.id,
    });
    res.json({ dilemma });
  } catch (err) {
    next(err);
  }
}

async function answer(req, res, next) {
  try {
    const dilemma = await svc.answerDilemma({
      uuid: req.params.uuid,
      mentor_user_id: req.user.id,
      audio_base64: req.body?.audio_base64,
      audio_duration_seconds: req.body?.audio_duration_seconds,
      written_takeaway: req.body?.written_takeaway,
    });
    res.json({ dilemma });
  } catch (err) {
    next(err);
  }
}

async function serveAudio(req, res) {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, safeFilename);

  const ext = path.extname(safeFilename).toLowerCase();
  const mimeTypes = {
    '.webm': 'audio/webm',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };
  const fallbackContentType = mimeTypes[ext] || 'audio/webm';

  const headers = {
    'Accept-Ranges': 'bytes',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };

  // 1. If file exists on local disk, serve immediately
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath, {
      headers: {
        ...headers,
        'Content-Type': fallbackContentType,
      },
    });
  }

  // 2. Fallback to PostgreSQL database (survives Render ephemeral container redeploys)
  try {
    const result = await query(
      'SELECT mime_type, data FROM voice_dilemma_audio_files WHERE filename = $1',
      [safeFilename]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const contentType = row.mime_type || fallbackContentType;

      // Re-create the file on local disk so subsequent chunk/range requests are instant
      try {
        if (!fs.existsSync(UPLOAD_DIR)) {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        fs.writeFileSync(filePath, row.data);
        return res.sendFile(filePath, {
          headers: {
            ...headers,
            'Content-Type': contentType,
          },
        });
      } catch (cacheErr) {
        console.warn('[voice-dilemmas] Failed to write disk cache, sending buffer directly:', cacheErr.message);
        res.set({
          ...headers,
          'Content-Type': contentType,
          'Content-Length': row.data.length,
        });
        return res.send(row.data);
      }
    }
  } catch (dbErr) {
    console.error('[voice-dilemmas] Database audio retrieval error:', dbErr);
  }

  // 3. Not found on disk or database
  return res.status(404).json({
    error: 'Audio file not found or expired',
    code: 'not_found',
  });
}

module.exports = {
  create,
  listMy,
  getOne,
  answer,
  serveAudio,
};
