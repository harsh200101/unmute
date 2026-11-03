const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Promote manswisahare9@gmail.com to admin
    console.log('--- Updating role for manswisahare9@gmail.com to admin ---');
    const updateRes = await client.query(
      `UPDATE users 
       SET role = 'admin' 
       WHERE email = 'manswisahare9@gmail.com' 
       RETURNING id, uuid, email, full_name, role`
    );
    console.log('Updated user to admin:', updateRes.rows);

    // 2. Check and delete harshgajbhiye95@gmail.com
    console.log('\n--- Finding harshgajbhiye95@gmail.com ---');
    const userRes = await client.query(
      `SELECT id, uuid, email, full_name, role FROM users WHERE email = 'harshgajbhiye95@gmail.com'`
    );

    if (userRes.rows.length === 0) {
      console.log('User harshgajbhiye95@gmail.com not found.');
    } else {
      const user = userRes.rows[0];
      const userId = user.id;
      console.log(`Found user ID ${userId}:`, user);

      // Clean up in proper order of constraints:
      // a. refresh_tokens, email_verification_tokens, password_reset_tokens
      await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);

      // b. meeting_messages
      await client.query(`DELETE FROM meeting_messages WHERE sender_user_id = $1`, [userId]);

      // c. session_notes
      await client.query(`DELETE FROM session_notes WHERE author_user_id = $1`, [userId]);

      // d. reviews
      await client.query(`DELETE FROM reviews WHERE reviewer_user_id = $1 OR reviewee_user_id = $1 OR hidden_by_user_id = $1`, [userId]);

      // e. notifications
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);

      // f. bookings and meetings
      const bookingsRes = await client.query(
        `SELECT id FROM bookings WHERE mentee_user_id = $1 OR mentor_user_id = $1 OR reschedule_proposed_by_user_id = $1`,
        [userId]
      );
      if (bookingsRes.rows.length > 0) {
        const bookingIds = bookingsRes.rows.map(b => b.id);
        await client.query(`DELETE FROM meetings WHERE booking_id = ANY($1::int[])`, [bookingIds]);
        await client.query(`DELETE FROM bookings WHERE id = ANY($1::int[])`, [bookingIds]);
      }

      // g. payments
      await client.query(`DELETE FROM payments WHERE user_id = $1`, [userId]);

      // h. wallets and wallet_transactions
      const walletsRes = await client.query(`SELECT id FROM wallets WHERE user_id = $1`, [userId]);
      if (walletsRes.rows.length > 0) {
        const walletIds = walletsRes.rows.map(w => w.id);
        await client.query(`DELETE FROM wallet_transactions WHERE wallet_id = ANY($1::int[])`, [walletIds]);
        await client.query(`DELETE FROM wallets WHERE user_id = $1`, [userId]);
      }

      // i. withdrawals
      await client.query(`DELETE FROM withdrawals WHERE mentor_user_id = $1`, [userId]);

      // j. mentor_kyc
      await client.query(`DELETE FROM mentor_kyc WHERE mentor_user_id = $1 OR reviewer_user_id = $1`, [userId]);

      // k. availability
      await client.query(`DELETE FROM availability_override WHERE mentor_user_id = $1`, [userId]);
      await client.query(`DELETE FROM availability_template WHERE mentor_user_id = $1`, [userId]);

      // l. mentor_tags
      await client.query(`DELETE FROM mentor_tags WHERE mentor_user_id = $1`, [userId]);

      // m. mentor_profiles
      await client.query(`DELETE FROM mentor_profiles WHERE user_id = $1 OR verified_by_user_id = $1`, [userId]);

      // n. admin_audit_log
      await client.query(`DELETE FROM admin_audit_log WHERE admin_user_id = $1`, [userId]);

      // o. delete user
      const delUserRes = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id, email, full_name`, [userId]);
      console.log('Successfully deleted user:', delUserRes.rows[0]);
    }

    await client.query('COMMIT');
    console.log('\n--- Transaction Committed Successfully ---');

    // Verification check
    const verifyList = await pool.query(
      `SELECT id, email, full_name, role FROM users WHERE email IN ('harshgajbhiye95@gmail.com', 'manswisahare9@gmail.com')`
    );
    console.log('\nVerification Query Result:');
    console.table(verifyList.rows);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during transaction, rolled back:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
