'use strict';

const path = require('path');
const fs = require('fs');
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

function serveAudio(req, res) {
  const safeFilename = path.basename(req.params.filename);
  const filePath = path.join(UPLOAD_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found', code: 'not_found' });
  }

  const ext = path.extname(safeFilename).toLowerCase();
  const mimeTypes = {
    '.webm': 'audio/webm',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(filePath);
}

module.exports = {
  create,
  listMy,
  getOne,
  answer,
  serveAudio,
};
