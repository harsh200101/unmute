const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    console.log('tags by kind:', (await pool.query(`SELECT kind, is_active, COUNT(*)::int n FROM tags GROUP BY 1,2`)).rows);
    console.log('tiers:', (await pool.query(`SELECT name, per_minute_paise FROM pricing_tiers ORDER BY sort_order`)).rows);
    console.log('kind constraint:', (await pool.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid='tags'::regclass AND contype='c'`)).rows);
    console.log('platform wallets:', (await pool.query(`SELECT COUNT(*)::int n FROM wallets WHERE kind='platform'`)).rows);
    console.log('migrations:', (await pool.query(`SELECT COUNT(*)::int n FROM schema_migrations`).catch(e=>({rows:[e.message]}))).rows);
  } finally { await pool.end(); }
})();
