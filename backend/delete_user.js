require('dotenv').config();
const db = require('./config/database');

async function deleteUserByEmail(email) {
  try {
    console.log(`🔍 Searching for user with email: ${email}`);

    // First, check if user exists
    const userResult = await db.query(
      'SELECT id, first_name, last_name, email FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found with email:', email);
      return;
    }

    const user = userResult.rows[0];
    console.log('👤 Found user:', {
      id: user.id,
      name: `${user.first_name} ${user.last_name}`,
      email: user.email
    });

    // Delete user (CASCADE will handle related records)
    console.log('🗑️ Deleting user and all related data...');
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);

    console.log('✅ User deleted successfully!');

    // Verify deletion
    const verifyResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (verifyResult.rows.length === 0) {
      console.log('🔍 Verification: User successfully removed from database');
    } else {
      console.log('⚠️ Warning: User still exists after deletion attempt');
    }

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    throw error;
  }
}

// Run the deletion
async function main() {
  const emailToDelete = 'harshgajbhiye34@gmail.com';

  try {
    await deleteUserByEmail(emailToDelete);
    console.log('🎉 Operation completed successfully');
  } catch (error) {
    console.error('💥 Operation failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { deleteUserByEmail };