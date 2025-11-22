require('dotenv').config();
const db = require('./config/database');

async function checkMentorEarningsColumn() {
  try {
    console.log('🔍 Checking if mentor_earnings column exists in sessions table...');

    const query = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sessions'
        AND table_schema = 'public'
        AND column_name = 'mentor_earnings'
    `;

    const result = await db.query(query);

    if (result.rows.length > 0) {
      console.log('✅ mentor_earnings column exists in sessions table');
      return true;
    } else {
      console.log('❌ mentor_earnings column does NOT exist in sessions table');
      return false;
    }

  } catch (error) {
    console.error('❌ Error checking column:', error.message);
    throw error;
  } finally {
    await db.closePool();
  }
}

checkMentorEarningsColumn();