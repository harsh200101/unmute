require('dotenv').config();
const db = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Running database migration...');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_create_tables.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split the SQL into individual statements (basic approach)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📄 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
          await db.query(statement);
        } catch (error) {
          // Ignore "already exists" errors for tables and indexes
          if (error.code === '42P07' || error.code === '23505') {
            console.log(`⚠️ Statement ${i + 1} skipped (already exists):`, error.message);
          } else {
            throw error;
          }
        }
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