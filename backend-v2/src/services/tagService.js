'use strict';

const { query } = require('../config/db');
const { bad } = require('../utils/errors');

const VALID_KINDS = ['expertise', 'industry'];

async function listTags({ kind } = {}) {
  if (kind && !VALID_KINDS.includes(kind)) {
    throw bad('invalid_kind', `kind must be one of: ${VALID_KINDS.join(', ')}`);
  }
  const params = [];
  let where = 'WHERE is_active = TRUE';
  if (kind) {
    params.push(kind);
    where += ` AND kind = $${params.length}`;
  }
  const res = await query(
    `SELECT id, uuid, slug, display_name, kind, sort_order
       FROM tags ${where}
       ORDER BY kind, sort_order, display_name`,
    params
  );
  return res.rows;
}

async function listPricingTiers() {
  const res = await query(
    `SELECT id, uuid, name, display_name, per_minute_paise, sort_order
       FROM pricing_tiers
      WHERE is_active = TRUE
      ORDER BY sort_order, per_minute_paise`
  );
  return res.rows;
}

module.exports = { listTags, listPricingTiers, VALID_KINDS };
