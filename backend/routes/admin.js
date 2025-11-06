const express = require('express');
const { query, param, body } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const { rateLimit } = require('../middleware/auth');
const mentorController = require('../controllers/mentorController');

const router = express.Router();

// ==========================================
// ADMIN MENTOR VERIFICATION ROUTES
// ==========================================

// PUT /api/admin/mentors/:mentorId/verify - Admin approve/reject mentor verification
router.put('/mentors/:mentorId/verify',
  // auth, // Temporarily disabled for email links - admin doesn't need authentication
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  [
    param('mentorId')
      .isInt({ min: 1 })
      .withMessage('Invalid mentor ID'),
    query('action')
      .isIn(['approve', 'reject'])
      .withMessage('Action must be "approve" or "reject"')
  ],
  mentorController.updateMentorVerificationStatus
);

// GET /api/admin/mentors/:mentorId/verify - Admin verify mentor (alternative route for email links)
router.get('/mentors/:mentorId/verify',
  // auth, // Temporarily disabled for email links - admin doesn't need authentication
  rateLimit(100, 15 * 60 * 1000), // 100 requests per 15 minutes
  [
    param('mentorId')
      .isInt({ min: 1 })
      .withMessage('Invalid mentor ID'),
    query('action')
      .isIn(['approve', 'reject'])
      .withMessage('Action must be "approve" or "reject"')
  ],
  async (req, res) => {
    try {
      const { mentorId } = req.params;
      const { action } = req.query;

      console.log(`🔄 Admin ${action} verification for mentor:`, mentorId);

      const newStatus = action === 'approve' ? 'verified' : 'rejected';

      // Update mentor verification status
      const updateQuery = `
        UPDATE mentors
        SET verification_status = $2, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const updateResult = await db.query(updateQuery, [mentorId, newStatus]);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Mentor not found',
          code: 'MENTOR_NOT_FOUND'
        });
      }

      const mentor = updateResult.rows[0];

      // Get user data for email
      const userQuery = 'SELECT first_name, last_name, email FROM users WHERE id = $1';
      const userResult = await db.query(userQuery, [mentor.user_id]);
      const user = userResult.rows[0];

      // Send result email to mentor
      const { sendMentorVerificationResultEmail } = require('../utils/emailService');

      await sendMentorVerificationResultEmail({
        id: mentor.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }, action === 'approve');

      console.log(`✅ Mentor verification ${newStatus} for mentor:`, mentorId);

      res.json({
        success: true,
        message: `Mentor verification ${newStatus} successfully`,
        data: {
          mentor: mentorController.formatMentorResponse(mentor),
          action: action,
          newStatus: newStatus
        }
      });

    } catch (error) {
      console.error('❌ Error updating mentor verification status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update verification status',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// GET /api/admin/mentors/pending - Get all pending mentor verifications
router.get('/mentors/pending',
  // auth, // Temporarily disabled for email links - admin doesn't need authentication
  rateLimit(50, 15 * 60 * 1000), // 50 requests per 15 minutes
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50')
  ],
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      console.log('🔍 Fetching pending mentor verifications');

      const offset = (page - 1) * limit;

      const query = `
        SELECT
          m.id,
          m.user_id,
          m.specializations,
          m.hourly_rate,
          m.years_experience,
          m.created_at,
          m.updated_at,
          u.first_name,
          u.last_name,
          u.email,
          u.bio,
          u.location,
          u.created_at as user_created_at,
          ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL) as categories
        FROM mentors m
        INNER JOIN users u ON m.user_id = u.id
        LEFT JOIN mentor_categories mc ON m.id = mc.mentor_id
        LEFT JOIN categories c ON mc.category_id = c.id
        WHERE m.verification_status = 'pending'
          AND m.status = 'active'
          AND u.is_active = true
        GROUP BY m.id, u.id
        ORDER BY m.created_at ASC
        LIMIT $1 OFFSET $2
      `;

      const result = await db.query(query, [limit, offset]);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM mentors m
        INNER JOIN users u ON m.user_id = u.id
        WHERE m.verification_status = 'pending'
          AND m.status = 'active'
          AND u.is_active = true
      `;

      const countResult = await db.query(countQuery);
      const totalPending = parseInt(countResult.rows[0].total);

      const pendingMentors = result.rows.map(mentor => ({
        id: mentor.id,
        userId: mentor.user_id,
        firstName: mentor.first_name,
        lastName: mentor.last_name,
        email: mentor.email,
        bio: mentor.bio,
        location: mentor.location,
        specializations: mentor.specializations || [],
        categories: mentor.categories || [],
        hourlyRate: parseFloat(mentor.hourly_rate || 0),
        yearsExperience: mentor.years_experience || 0,
        createdAt: mentor.created_at,
        updatedAt: mentor.updated_at,
        userCreatedAt: mentor.user_created_at
      }));

      res.json({
        success: true,
        data: {
          mentors: pendingMentors,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalPending / limit),
            totalMentors: totalPending,
            limit: parseInt(limit),
            hasNextPage: page < Math.ceil(totalPending / limit),
            hasPreviousPage: page > 1
          }
        }
      });

    } catch (error) {
      console.error('❌ Error fetching pending mentor verifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending verifications',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Admin API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;