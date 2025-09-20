const { Pool } = require('pg');

// Load environment variables first
require('dotenv').config();

// Try different SSL configurations
const connectionConfigs = [
  // Config 1: No SSL (for some Render databases)
  {
    name: "No SSL",
    config: {
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true
    }
  },
  // Config 2: SSL with rejectUnauthorized false
  {
    name: "SSL - rejectUnauthorized: false",
    config: {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true
    }
  },
  // Config 3: SSL required mode
  {
    name: "SSL - require mode",
    config: {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true
    }
  }
];

async function testConnectionConfig(configObj) {
  console.log(`\n🔄 Testing: ${configObj.name}`);
  const pool = new Pool(configObj.config);
  
  try {
    const client = await pool.connect();
    console.log('✅ Connection established successfully!');
    
    // Test basic query
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log('✅ Current Time:', timeResult.rows[0].current_time);
    
    // Test database version
    const versionResult = await client.query('SELECT version()');
    console.log('✅ PostgreSQL Version:', versionResult.rows[0].version.substring(0, 50) + '...');
    
    client.release();
    await pool.end();
    
    console.log(`🎉 SUCCESS with configuration: ${configObj.name}`);
    return configObj;
    
  } catch (error) {
    console.log(`❌ Failed with ${configObj.name}:`, error.message);
    try { await pool.end(); } catch (e) {}
    return null;
  }
}

async function findWorkingConnection() {
  console.log('🔄 Testing Render PostgreSQL connection...');
  console.log('📍 Region: Singapore');
  console.log('🏗️  Database: unmute_ddk4');
  console.log('👤 User: adminharsh');
  
  for (const config of connectionConfigs) {
    const result = await testConnectionConfig(config);
    if (result) {
      console.log('\n🎯 RECOMMENDED CONFIGURATION:');
      console.log('Use this in your config/database.js:');
      console.log(JSON.stringify(result.config, null, 2));
      process.exit(0);
    }
  }
  
  console.log('\n❌ No working configuration found. Please check:');
  console.log('1. Database is running in Render dashboard');
  console.log('2. Credentials are correct');
  console.log('3. Network connectivity');
  process.exit(1);
}

findWorkingConnection();
