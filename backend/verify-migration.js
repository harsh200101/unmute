require('dotenv').config();
const db = require('./config/database');

async function verifyMigration() {
  try {
    console.log('🔍 Verifying wallet billing system migration...\n');

    // Check new tables exist
    const newTables = ['wallets', 'wallet_transactions', 'mentor_earnings'];
    for (const table of newTables) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [table]);

      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' created successfully`);
      } else {
        console.log(`❌ Table '${table}' not found`);
      }
    }

    console.log('');

    // Check sessions table modifications
    console.log('🔍 Checking sessions table modifications...');
    const sessionColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name IN ('per_minute_rate', 'minimum_debit', 'actual_billed_amount', 'kill_switch_timer_id')
    `);

    const addedColumns = sessionColumns.rows.map(row => row.column_name);
    const expectedColumns = ['per_minute_rate', 'minimum_debit', 'actual_billed_amount', 'kill_switch_timer_id'];

    for (const col of expectedColumns) {
      if (addedColumns.includes(col)) {
        console.log(`✅ Column '${col}' added to sessions table`);
      } else {
        console.log(`❌ Column '${col}' not found in sessions table`);
      }
    }

    // Check dropped columns
    const droppedColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'sessions'
      AND column_name IN ('price', 'platform_fee', 'mentor_earnings')
    `);

    if (droppedColumns.rows.length === 0) {
      console.log('✅ Old pricing columns (price, platform_fee, mentor_earnings) dropped from sessions table');
    } else {
      console.log(`❌ Some old columns still exist: ${droppedColumns.rows.map(r => r.column_name).join(', ')}`);
    }

    console.log('');

    // Check payments table modifications
    console.log('🔍 Checking payments table modifications...');
    const paymentColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name IN ('wallet_credit_amount', 'is_wallet_topup')
    `);

    const paymentAddedColumns = paymentColumns.rows.map(row => row.column_name);
    const expectedPaymentColumns = ['wallet_credit_amount', 'is_wallet_topup'];

    for (const col of expectedPaymentColumns) {
      if (paymentAddedColumns.includes(col)) {
        console.log(`✅ Column '${col}' added to payments table`);
      } else {
        console.log(`❌ Column '${col}' not found in payments table`);
      }
    }

    console.log('');

    // Check data migration
    console.log('🔍 Checking data migration...');

    // Wallets initialized
    const walletCount = await db.query('SELECT COUNT(*) as count FROM wallets');
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');

    console.log(`✅ Wallets created: ${walletCount.rows[0].count} (Users: ${userCount.rows[0].count})`);

    // Mentor earnings migrated
    const earningsCount = await db.query('SELECT COUNT(*) as count FROM mentor_earnings');
    console.log(`✅ Mentor earnings records: ${earningsCount.rows[0].count}`);

    // Check if sessions have per_minute_rate set
    const sessionsWithRate = await db.query('SELECT COUNT(*) as count FROM sessions WHERE per_minute_rate > 0');
    const totalSessions = await db.query('SELECT COUNT(*) as count FROM sessions');
    console.log(`✅ Sessions with per_minute_rate set: ${sessionsWithRate.rows[0].count} / ${totalSessions.rows[0].count}`);

    console.log('\n🎉 Migration verification completed!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

verifyMigration();