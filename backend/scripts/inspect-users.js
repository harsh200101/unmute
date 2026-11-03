const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function inspectAll() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const res = await pool.query(
      `SELECT u.id, u.uuid, u.email, u.full_name, u.role, u.is_active, 
              mp.id as mentor_id, mp.verification_status 
       FROM users u 
       LEFT JOIN mentor_profiles mp ON mp.user_id = u.id
       ORDER BY u.id ASC`
    );
    console.table(res.rows);
  } catch (err) {
    console.error("Query failed:", err);
  } finally {
    await pool.end();
  }
}

inspectAll();
