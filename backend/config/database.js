require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false  // Required for Render.com PostgreSQL
  } : false,
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 60000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 0,
});

pool.on('connect', (client) => {
  console.log('✅ New client connected to PostgreSQL with SSL');
  client.query('SET timezone="UTC"');
});

pool.on('acquire', () => {
  console.log('🔄 Client acquired from pool');
});

pool.on('remove', () => {
  console.log('🔄 Client removed from pool');
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected pool error:', err);
  if (client) {
    console.error('Client info:', {
      processID: client.processID,
      secretKey: client.secretKey ? '[HIDDEN]' : null
    });
  }
});

/**
 * Execute a query on the pool with enhanced error handling
 */
async function query(text, params = [], options = {}) {
  const start = Date.now();
  
  try {
    console.log('🔍 Executing query:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    
    const result = await pool.query(text, params);
    
    const duration = Date.now() - start;
    console.log('⚡ Query executed in', duration, 'ms, rows:', result.rowCount);
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('❌ Query failed after', duration, 'ms');
    console.error('Query:', text);
    console.error('Params:', params);
    console.error('Error:', error.message);
    
    if (error.code) {
      console.error('PostgreSQL Error Code:', error.code);
      console.error('Error Detail:', error.detail);
      console.error('Error Hint:', error.hint);
    }
    
    throw error;
  }
}

/**
 * Execute a transaction with automatic rollback on error
 */
async function transaction(callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('📝 Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('🔄 Transaction rolled back due to error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection and schema compatibility
 */
async function testConnection() {
  const client = await pool.connect();
  
  try {
    // Test basic connection
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log('🔄 Database time:', timeResult.rows[0].current_time);
    
    // Test UUID extension
    const uuidResult = await client.query('SELECT uuid_generate_v4() as test_uuid');
    console.log('🆔 UUID generation test:', uuidResult.rows[0].test_uuid);
    
    // Test pg_trgm extension
    try {
      await client.query("SELECT similarity('test', 'text')");
      console.log('🔍 Fuzzy search extension: Available');
    } catch (err) {
      console.warn('⚠️ pg_trgm extension not available');
    }
    
    // Verify core tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'mentors', 'sessions', 'reviews')
      ORDER BY table_name
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log('📋 Core tables found:', existingTables);
    
    if (existingTables.length < 4) {
      console.warn('⚠️ Some core tables missing. Schema may need to be created.');
    }
    
    return timeResult;
    
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get connection pool statistics
 */
function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxConnections: pool.options.max,
    minConnections: pool.options.min
  };
}

/**
 * Close all connections gracefully
 */
async function closePool() {
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
  } catch (error) {
    console.error('❌ Error closing database pool:', error);
    throw error;
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, closing database connections...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, closing database connections...');
  await closePool();
  process.exit(0);
});

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  getPoolStats,
  closePool
};
