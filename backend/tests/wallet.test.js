'use strict';

const { pool, query, truncateAll, createUser, createWallet } = require('./_helpers');

beforeEach(truncateAll);
afterAll(async () => {
  await pool.end().catch(() => {});
});

describe('Wallet ledger trigger', () => {
  test('credit transaction increases balance and records balance_after_paise', async () => {
    const user = await createUser();
    const wallet = await createWallet(user.id, 'mentee', 0);

    const res = await query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, balance_after_paise)
       VALUES ($1, 'credit', $2, 'topup', 0)
       RETURNING balance_after_paise`,
      [wallet.id, 50000]
    );
    expect(res.rows[0].balance_after_paise).toBe(50000);

    const wb = await query('SELECT balance_paise FROM wallets WHERE id = $1', [wallet.id]);
    expect(wb.rows[0].balance_paise).toBe(50000);
  });

  test('debit transaction decreases balance', async () => {
    const user = await createUser();
    const wallet = await createWallet(user.id, 'mentee', 10000);

    await query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, balance_after_paise)
       VALUES ($1, 'debit', $2, 'session_charge', 0)`,
      [wallet.id, 3000]
    );

    const wb = await query('SELECT balance_paise FROM wallets WHERE id = $1', [wallet.id]);
    expect(wb.rows[0].balance_paise).toBe(7000);
  });

  test('debit exceeding balance raises Insufficient balance', async () => {
    const user = await createUser();
    const wallet = await createWallet(user.id, 'mentee', 500);

    await expect(
      query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason, balance_after_paise)
         VALUES ($1, 'debit', $2, 'session_charge', 0)`,
        [wallet.id, 1000]
      )
    ).rejects.toThrow(/Insufficient balance/);

    // Balance unchanged after failed debit
    const wb = await query('SELECT balance_paise FROM wallets WHERE id = $1', [wallet.id]);
    expect(wb.rows[0].balance_paise).toBe(500);
  });

  test('CHECK (balance_paise >= 0) acts as backstop against trigger bugs', async () => {
    const user = await createUser();
    const wallet = await createWallet(user.id, 'mentee', 100);

    // Bypassing the ledger and forcing a negative directly must be rejected
    // by the CHECK constraint.
    await expect(
      query(`UPDATE wallets SET balance_paise = -1 WHERE id = $1`, [wallet.id])
    ).rejects.toThrow(/check constraint/);
  });

  test('idempotency_key uniqueness — same key twice fails', async () => {
    const user = await createUser();
    const wallet = await createWallet(user.id, 'mentee', 0);

    await query(
      `INSERT INTO wallet_transactions
         (wallet_id, direction, amount_paise, reason, idempotency_key, balance_after_paise)
       VALUES ($1, 'credit', $2, 'topup', $3, 0)`,
      [wallet.id, 1000, 'phonepe-txn-abc']
    );

    await expect(
      query(
        `INSERT INTO wallet_transactions
           (wallet_id, direction, amount_paise, reason, idempotency_key, balance_after_paise)
         VALUES ($1, 'credit', $2, 'topup', $3, 0)`,
        [wallet.id, 1000, 'phonepe-txn-abc']
      )
    ).rejects.toThrow(/duplicate key|idempotency_key/);
  });
});
