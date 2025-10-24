require('dotenv').config();
const db = require('./config/database');

async function updateUserName() {
  try {
    console.log('🔍 Checking for user with name "Manswi Sahare"...');

    // Find the user
    const userResult = await db.query(`
      SELECT id, first_name, last_name, email
      FROM users
      WHERE first_name = $1 AND last_name = $2
    `, ['Manswi', 'Sahare']);

    if (userResult.rows.length === 0) {
      console.log('❌ No user found with name "Manswi Sahare"');
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ Found user:', user);

    // Update the name to "Mentor Profile"
    await db.query(`
      UPDATE users
      SET first_name = $1, last_name = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, ['Mentor', 'Profile', user.id]);

    console.log('✅ Updated user name to "Mentor Profile"');

  } catch (error) {
    console.error('❌ Error updating user name:', error);
  } finally {
    process.exit(0);
  }
}

updateUserName();