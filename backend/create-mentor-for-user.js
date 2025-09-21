require('dotenv').config();
const db = require('./config/database');

async function createMentorForUser() {
  const userId = 51; // The user ID from the error logs

  try {
    console.log('🚀 Creating mentor profile for user ID:', userId);

    // Check if user exists
    const userCheck = await db.query('SELECT id, email, first_name, last_name FROM users WHERE id = $1', [userId]);

    if (userCheck.rows.length === 0) {
      console.error('❌ User not found with ID:', userId);
      return;
    }

    const user = userCheck.rows[0];
    console.log('✅ Found user:', user);

    // Check if mentor profile already exists
    const mentorCheck = await db.query('SELECT id FROM mentors WHERE user_id = $1', [userId]);

    if (mentorCheck.rows.length > 0) {
      console.log('✅ Mentor profile already exists for user:', userId);
      return;
    }

    // Create mentor profile
    const mentorResult = await db.query(`
      INSERT INTO mentors (
        user_id, hourly_rate, status, verification_status,
        specializations, languages, years_experience, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, status, verification_status
    `, [
      userId,
      75.00,
      'active',
      'verified',
      ['JavaScript', 'React', 'Node.js', 'Python'],
      ['English', 'Spanish'],
      5,
      'America/New_York'
    ]);

    const mentor = mentorResult.rows[0];
    console.log('✅ Created mentor profile:', mentor);

    // Create some sample availability
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
    console.log('\n🎉 Mentor profile setup complete for user:', user.email);

  } catch (error) {
    console.error('❌ Error creating mentor profile:', error);
  } finally {
    process.exit(0);
  }
}

createMentorForUser();