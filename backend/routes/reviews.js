const express = require('express');
const { query } = require('express-validator');
const db = require('../config/database');
const { optionalAuth, rateLimit } = require('../middleware/auth');

const router = express.Router();

// GET /api/reviews/featured - Get featured reviews for homepage
router.get('/featured',
  rateLimit(30, 15 * 60 * 1000), // 30 requests per 15 minutes
  optionalAuth,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Limit must be between 1 and 20')
  ],
  async (req, res) => {
    try {
      const { limit = 6 } = req.query;

      console.log('🔍 Fetching featured reviews:', { limit });

      // Get featured reviews from database
      const query = `
        SELECT
          r.id,
          r.overall_rating as rating,
          r.comment,
          r.created_at,
          r.is_featured,
          r.helpful_votes,
          u.first_name as student_first_name,
          u.last_name as student_last_name,
          m.user_id as mentor_user_id,
          mentor_user.first_name as mentor_first_name,
          mentor_user.last_name as mentor_last_name,
          s.title as session_title,
          s.duration_minutes as session_duration
        FROM reviews r
        INNER JOIN users u ON r.mentee_id = u.id
        INNER JOIN mentors m ON r.mentor_id = m.id
        INNER JOIN users mentor_user ON m.user_id = mentor_user.id
        LEFT JOIN sessions s ON r.session_id = s.id
        WHERE r.is_hidden = false
          AND r.is_featured = true
          AND r.overall_rating >= 4
        ORDER BY r.created_at DESC, r.helpful_votes DESC
        LIMIT $1
      `;

      const result = await db.query(query, [parseInt(limit)]);
      console.log('🔍 Found', result.rows.length, 'featured reviews');

      // Format reviews for frontend
      const reviews = result.rows.map(review => ({
        id: review.id,
        mentor_id: review.mentor_user_id,
        student_name: `${review.student_first_name} ${review.student_last_name.charAt(0)}.`,
        rating: review.rating,
        comment: review.comment,
        created_at: review.created_at,
        is_featured: review.is_featured,
        helpful_votes: review.helpful_votes,
        mentor_name: `${review.mentor_first_name} ${review.mentor_last_name}`,
        session_title: review.session_title,
        session_duration: review.session_duration
      }));

      console.log('✅ Successfully fetched featured reviews');

      res.json({
        success: true,
        data: reviews
      });

    } catch (error) {
      console.error('❌ Error fetching featured reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch featured reviews',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

module.exports = router;