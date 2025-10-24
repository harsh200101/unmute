require('dotenv').config();
const db = require('./config/database');

async function updateCategories() {
  try {
    console.log('🔄 Starting database update...');

    // Delete existing categories
    await db.query('DELETE FROM categories');
    console.log('✅ Deleted existing categories');

    // Insert new life-focused categories
    await db.query(`
      INSERT INTO categories (name, description, slug, color_hex) VALUES
      ('Spiritual Guidance', 'Spiritual awakening, meditation, and inner peace', 'spiritual-guidance', '#8B5CF6'),
      ('Life Coaching', 'Personal development and life direction guidance', 'life-coaching', '#10B981'),
      ('Mental Health Support', 'Anxiety, depression, and emotional wellness', 'mental-health-support', '#EC4899'),
      ('Relationship Counseling', 'Love, marriage, and interpersonal relationships', 'relationship-counseling', '#F59E0B'),
      ('Career Transition', 'Finding purpose and meaningful work', 'career-transition', '#3B82F6'),
      ('Grief & Loss', 'Coping with loss and bereavement', 'grief-loss', '#EF4444'),
      ('Stress Management', 'Techniques for managing daily stress and overwhelm', 'stress-management', '#06B6D4'),
      ('Self-Discovery', 'Finding your true self and life purpose', 'self-discovery', '#84CC16'),
      ('Parenting Support', 'Guidance for parents and family dynamics', 'parenting-support', '#059669')
    `);
    console.log('✅ Inserted new life-focused categories');

    // Delete existing expertise tags
    await db.query('DELETE FROM expertise_tags');
    console.log('✅ Deleted existing expertise tags');

    // Insert new life-focused expertise tags
    await db.query(`
      INSERT INTO expertise_tags (name, category) VALUES
      ('Meditation', 'Spirituality'),
      ('CBT', 'Psychology'),
      ('Life Coaching', 'Personal Development'),
      ('Spiritual Counseling', 'Spirituality'),
      ('Emotional Intelligence', 'Psychology'),
      ('Grief Counseling', 'Mental Health'),
      ('Relationship Counseling', 'Relationships'),
      ('Stress Management', 'Wellness'),
      ('Mindfulness', 'Spirituality'),
      ('Career Guidance', 'Personal Development')
    `);
    console.log('✅ Inserted new life-focused expertise tags');

    console.log('🎉 Database updated successfully!');

  } catch (error) {
    console.error('❌ Error updating database:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

updateCategories();