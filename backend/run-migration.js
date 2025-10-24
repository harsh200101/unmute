require('dotenv').config();
const db = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    // Get migration file from command line argument or default to latest
    const migrationFile = process.argv[2] || '002_performance_optimizations.sql';
    console.log(`🔄 Running database migration: ${migrationFile}`);

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // For complex migrations with functions, execute as one statement
    // Remove comments and clean up the SQL
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') || line.trim() === '')
      .join('\n')
      .trim();

    console.log('📄 Executing migration as single statement...');

    try {
      console.log('⚡ Executing migration...');
      await db.query(cleanSQL);
    } catch (error) {
      // Handle specific PostgreSQL errors
      if (error.code === '42P07') {
        console.log('⚠️ Migration skipped (table already exists):', error.message);
      } else if (error.code === '23505') {
        console.log('⚠️ Migration skipped (constraint already exists):', error.message);
      } else if (error.code === '42710') {
        console.log('⚠️ Migration skipped (object already exists):', error.message);
      } else {
        throw error;
      }
    }

    console.log('✅ Migration completed successfully!');

    // Test the new table
    const testResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'email_verification_tokens'
    `);

    if (testResult.rows.length > 0) {
      console.log('✅ email_verification_tokens table created successfully!');
    } else {
      console.log('❌ email_verification_tokens table was not created');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

runMigration();