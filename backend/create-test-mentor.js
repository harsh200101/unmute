require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./config/database');

async function createTestMentor() {
  try {
    console.log('🚀 Creating test mentor account...');

    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);

    const userResult = await db.query(`
      INSERT INTO users (
        email, password_hash, first_name, last_name, role, is_verified, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_verified = true,
        is_active = true
      RETURNING id, email, first_name, last_name
    `, [
      'mentor@test.com',
      hashedPassword,
      'John',
      'Mentor',
      'mentor',
      true,
      true
    ]);

    const user = userResult.rows[0];
    console.log('✅ Test user created/updated:', user);

    // Create mentor profile
    const mentorResult = await db.query(`
      INSERT INTO mentors (
        user_id, hourly_rate, status, verification_status,
        specializations, languages, years_experience, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        status = 'active',
        verification_status = 'verified',
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, status, verification_status
    `, [
      user.id,
      75.00,
      'active',
      'verified',
      ['JavaScript', 'React', 'Node.js', 'Python'],
      ['English', 'Spanish'],
      8,
      'America/New_York'
    ]);

    const mentor = mentorResult.rows[0];
    console.log('✅ Test mentor profile created/updated:', mentor);

    // Create some sample availability
    await db.query(`
      DELETE FROM mentor_availability WHERE mentor_id = $1
    `, [mentor.id]);

    const availabilitySlots = [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 }, // Monday
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 }, // Tuesday
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 }, // Wednesday
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 }, // Thursday
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60 }, // Friday
    ];

    for (const slot of availabilitySlots) {
      await db.query(`
        INSERT INTO mentor_availability (
          mentor_id, day_of_week, start_time, end_time, is_available, slot_duration_minutes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        mentor.id,
        slot.dayOfWeek,
        slot.startTime,
        slot.endTime,
        true,
        slot.slotDurationMinutes
      ]);
    }

    console.log('✅ Sample availability slots created');

    console.log('\n🎉 Test mentor setup complete!');
    console.log('📧 Email: mentor@test.com');
    console.log('🔑 Password: password123');
    console.log('🌐 Login at: http://localhost:3000/login');

  } catch (error) {
    console.error('❌ Error creating test mentor:', error);
  } finally {
    process.exit(0);
  }
}

createTestMentor();