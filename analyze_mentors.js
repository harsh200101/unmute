const db = require('./backend/config/database');

// Disable SSL for local database connection
const originalPool = db.pool;
const tempPool = require('pg').Pool;
const localPool = new tempPool({
  connectionString: process.env.DATABASE_URL,
  ssl: false  // Disable SSL for local connections
});

// Temporarily replace the pool
db.pool = localPool;

async function analyzeMentors() {
  try {
    console.log('🔍 Analyzing mentors with IDs 69 and 71 from live database...\n');

    // Query for mentor 69 with full details
    const mentor69Query = `
      SELECT
        m.id as mentor_id,
        m.user_id,
        m.status as mentor_status,
        m.verification_status,
        m.created_at as mentor_created_at,
        m.updated_at as mentor_updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active as user_active,
        u.is_verified as user_verified,
        u.created_at as user_created_at,
        u.oauth_provider
      FROM mentors m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = 69
    `;

    const mentor69Result = await db.query(mentor69Query);

    console.log('=== MENTOR 69 ===');
    if (mentor69Result.rows.length > 0) {
      const mentor = mentor69Result.rows[0];
      console.log(JSON.stringify(mentor, null, 2));

      // Check visibility criteria
      const visible = mentor.mentor_status === 'active' &&
                     mentor.verification_status === 'verified' &&
                     mentor.user_active === true &&
                     mentor.user_verified === true;

      console.log('\n📊 Visibility Analysis for Mentor 69:');
      console.log(`  Mentor Status: ${mentor.mentor_status} (${mentor.mentor_status === 'active' ? '✅' : '❌'})`);
      console.log(`  Verification Status: ${mentor.verification_status} (${mentor.verification_status === 'verified' ? '✅' : '❌'})`);
      console.log(`  User Active: ${mentor.user_active} (${mentor.user_active === true ? '✅' : '❌'})`);
      console.log(`  User Verified: ${mentor.user_verified} (${mentor.user_verified === true ? '✅' : '❌'})`);
      console.log(`  Registration Method: ${mentor.oauth_provider ? 'OAuth (' + mentor.oauth_provider + ')' : 'Email'}`);
      console.log(`  Would appear in "find mentor": ${visible ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log('❌ Mentor 69 not found in database');
    }

    // Query for mentor 71 with full details
    const mentor71Query = `
      SELECT
        m.id as mentor_id,
        m.user_id,
        m.status as mentor_status,
        m.verification_status,
        m.created_at as mentor_created_at,
        m.updated_at as mentor_updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active as user_active,
        u.is_verified as user_verified,
        u.created_at as user_created_at,
        u.oauth_provider
      FROM mentors m
      LEFT JOIN users u ON m.user_id = u.id
      WHERE m.id = 71
    `;

    const mentor71Result = await db.query(mentor71Query);

    console.log('\n=== MENTOR 71 ===');
    if (mentor71Result.rows.length > 0) {
      const mentor = mentor71Result.rows[0];
      console.log(JSON.stringify(mentor, null, 2));

      // Check visibility criteria
      const visible = mentor.mentor_status === 'active' &&
                     mentor.verification_status === 'verified' &&
                     mentor.user_active === true &&
                     mentor.user_verified === true;

      console.log('\n📊 Visibility Analysis for Mentor 71:');
      console.log(`  Mentor Status: ${mentor.mentor_status} (${mentor.mentor_status === 'active' ? '✅' : '❌'})`);
      console.log(`  Verification Status: ${mentor.verification_status} (${mentor.verification_status === 'verified' ? '✅' : '❌'})`);
      console.log(`  User Active: ${mentor.user_active} (${mentor.user_active === true ? '✅' : '❌'})`);
      console.log(`  User Verified: ${mentor.user_verified} (${mentor.user_verified === true ? '✅' : '❌'})`);
      console.log(`  Registration Method: ${mentor.oauth_provider ? 'OAuth (' + mentor.oauth_provider + ')' : 'Email'}`);
      console.log(`  Would appear in "find mentor": ${visible ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log('❌ Mentor 71 not found in database');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    const mentor69Exists = mentor69Result.rows.length > 0;
    const mentor71Exists = mentor71Result.rows.length > 0;

    if (mentor69Exists && mentor71Exists) {
      const m69 = mentor69Result.rows[0];
      const m71 = mentor71Result.rows[0];

      const m69Visible = m69.mentor_status === 'active' && m69.verification_status === 'verified' && m69.user_active && m69.user_verified;
      const m71Visible = m71.mentor_status === 'active' && m71.verification_status === 'verified' && m71.user_active && m71.user_verified;

      console.log(`Mentor 69 visible: ${m69Visible ? 'YES' : 'NO'}`);
      console.log(`Mentor 71 visible: ${m71Visible ? 'YES' : 'NO'}`);

      if (m69Visible !== m71Visible) {
        console.log('\n🔍 DISCREPANCY FOUND:');
        if (!m69Visible && m71Visible) {
          console.log('Mentor 69 is NOT visible while Mentor 71 IS visible');
        } else if (m69Visible && !m71Visible) {
          console.log('Mentor 69 IS visible while Mentor 71 is NOT visible');
        }
      } else {
        console.log('\n✅ Both mentors have the same visibility status');
      }
    } else {
      console.log('One or both mentors do not exist in the database');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error analyzing mentors:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

analyzeMentors();