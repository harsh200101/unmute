'use strict';

const { query } = require('../config/db');
const { notFound, bad } = require('../utils/errors');

// Read-only wallet operations used by /api/wallet/*.
// Money-moving (debit/credit) lives in paymentsService + bookingService;
// this module is just for the UI.

async function getMyBalances(user_id) {
  const w = await query(
    `SELECT kind, balance_paise FROM wallets WHERE user_id = $1 ORDER BY kind`,
    [user_id]
  );
  const u = await query(
    `SELECT pending_penalty_paise FROM users WHERE id = $1`,
    [user_id]
  );
  if (!u.rows[0]) throw notFound('user_not_found');

  const balances = { mentee: 0, mentor: 0 };
  for (const row of w.rows) {
    if (row.kind === 'mentee' || row.kind === 'mentor') {
      balances[row.kind] = row.balance_paise;
    }
  }
  return {
    balances,
    pending_penalty_paise: u.rows[0].pending_penalty_paise,
  };
}

async function listTransactions({ user_id, kind, limit = 50, offset = 0 }) {
  const limitN = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offsetN = Math.max(Number(offset) || 0, 0);

  const params = [user_id];
  let where = `w.user_id = $1`;
  if (kind) {
    if (!['mentee', 'mentor'].includes(kind)) throw bad('invalid_kind');
    params.push(kind);
    where += ` AND w.kind = $${params.length}`;
  }

  const rows = await query(
    `SELECT wt.uuid, wt.direction, wt.amount_paise, wt.balance_after_paise,
            wt.reason, wt.reference_table, wt.reference_id, wt.description,
            wt.created_at, w.kind AS wallet_kind
       FROM wallet_transactions wt
       JOIN wallets w ON w.id = wt.wallet_id
      WHERE ${where}
      ORDER BY wt.created_at DESC
      LIMIT ${limitN} OFFSET ${offsetN}`,
    params
  );
  return { items: rows.rows, limit: limitN, offset: offsetN };
}

module.exports = { getMyBalances, listTransactions };
