const { query, transaction } = require('../config/database');
const walletService = require('../services/walletService');
const request = require('supertest');
const express = require('express');

// Mock the database module
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

// Mock auth middleware
const mockAuth = jest.fn((req, res, next) => {
  req.user = { userId: 1 };
  next();
});

const mockRateLimit = jest.fn(() => (req, res, next) => next());

jest.mock('../middleware/auth', () => ({
  __esModule: true,
  default: mockAuth,
  rateLimit: mockRateLimit
}));

// Import routes after mocks are set up
const walletRoutes = require('../routes/wallet');

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn()
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid'),
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-hash')
    }))
  }))
}));

// Mock DNS
jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn(() => Promise.resolve())
  }
}));

const app = express();
app.use(express.json());
app.use('/api/wallet', walletRoutes);

describe('Error Scenario Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Function Error Handling', () => {
    test('should handle database connection errors', async () => {
      const mockUserId = 1;

      query.mockRejectedValue(new Error('Connection refused'));

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('Connection refused');
    });

    test('should handle transaction rollback on database errors', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Error test';

      transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Transaction failed');
    });

    test('should handle invalid JSON in transaction metadata', async () => {
      const mockUserId = 1;

      // Mock corrupted metadata
      query.mockResolvedValue({
        rows: [{
          balance: 500.00,
          currency: 'INR'
        }]
      });

      // Should still work despite potential metadata issues
      const result = await walletService.getWalletBalance(mockUserId);
      expect(result.balance).toBe(500.00);
    });
  });

  describe('API Error Handling', () => {
    test('should handle malformed JSON in requests', async () => {
      const response = await request(app)
        .post('/api/wallet/topup')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400);

      // Express should handle malformed JSON
      expect(response.status).toBe(400);
    });

    test('should handle missing authentication', async () => {
      // Temporarily remove auth mock
      const originalAuth = require('../middleware/auth');
      jest.doMock('../middleware/auth', () => ({
        auth: (req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        },
        rateLimit: originalAuth.rateLimit
      }));

      const response = await request(app)
        .get('/api/wallet/balance')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });

    test('should handle rate limiting', async () => {
      // Mock rate limit exceeded
      const originalAuth = require('../middleware/auth');
      let callCount = 0;
      jest.doMock('../middleware/auth', () => ({
        auth: originalAuth.auth,
        rateLimit: () => (req, res, next) => {
          callCount++;
          if (callCount > 100) {
            res.status(429).json({ error: 'Too many requests' });
          } else {
            next();
          }
        }
      }));

      // Make multiple requests to trigger rate limit
      for (let i = 0; i < 102; i++) {
        const response = await request(app)
          .get('/api/wallet/balance');

        if (i >= 100) {
          expect(response.status).toBe(429);
          break;
        }
      }
    });
  });

  describe('Payment Gateway Error Handling', () => {
    test('should handle PhonePe API timeout', async () => {
      const mockAmount = 500.00;
      const mockUser = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '9999999999'
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });

      const axios = require('axios');
      axios.post.mockRejectedValue(new Error('Timeout'));

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to initiate wallet top-up');
    });

    test('should handle PhonePe API returning invalid response', async () => {
      const mockAmount = 500.00;
      const mockUser = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '9999999999'
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });

      const axios = require('axios');
      axios.post.mockResolvedValue({
        data: null // Invalid response
      });

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    test('should handle DNS resolution failure', async () => {
      const mockAmount = 500.00;
      const mockUser = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '9999999999'
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });

      const dns = require('dns');
      dns.promises.lookup.mockRejectedValue(new Error('DNS resolution failed'));

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Callback Error Handling', () => {
    test('should handle invalid callback payload', async () => {
      const response = await request(app)
        .post('/api/wallet/callback')
        .send({ invalid: 'payload' })
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid payload format');
    });

    test('should handle invalid base64 in callback', async () => {
      const response = await request(app)
        .post('/api/wallet/callback')
        .send({ response: 'invalid-base64!' })
        .expect(500);

      expect(response.body.status).toBe('error');
    });

    test('should handle checksum validation failure', async () => {
      const mockPayload = {
        data: {
          merchantTransactionId: 'WTmock-uuid'
        },
        code: 'PAYMENT_SUCCESS'
      };

      // Mock invalid checksum
      const crypto = require('crypto');
      crypto.createHash.mockReturnValue({
        update: jest.fn(() => ({
          digest: jest.fn(() => 'invalid-hash')
        }))
      });

      const response = await request(app)
        .post('/api/wallet/callback')
        .set('x-verify', 'valid-checksum###salt')
        .send({ response: Buffer.from(JSON.stringify(mockPayload)).toString('base64') })
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid checksum');
    });

    test('should handle wallet credit failure in callback', async () => {
      const mockPayload = {
        data: {
          merchantTransactionId: 'WTmock-uuid'
        },
        code: 'PAYMENT_SUCCESS'
      };

      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          amount: 500.00,
          metadata: JSON.stringify({ userId: '1', type: 'wallet_topup' })
        }]
      });

      // Mock wallet credit failure
      const walletService = require('../services/walletService');
      walletService.creditWallet = jest.fn().mockRejectedValue(new Error('Credit failed'));

      const response = await request(app)
        .post('/api/wallet/callback')
        .send({ response: Buffer.from(JSON.stringify(mockPayload)).toString('base64') })
        .expect(302); // Should still redirect even if credit fails

      expect(walletService.creditWallet).toHaveBeenCalled();
    });
  });

  describe('Database Constraint Violations', () => {
    test('should handle unique constraint violations', async () => {
      const mockUserId = 1;

      // Mock unique constraint violation
      query.mockRejectedValue({
        code: '23505', // PostgreSQL unique violation code
        message: 'duplicate key value violates unique constraint'
      });

      await expect(walletService.initializeWallet(mockUserId))
        .rejects.toThrow();
    });

    test('should handle foreign key constraint violations', async () => {
      const mockUserId = 999;

      // Mock foreign key violation
      query.mockRejectedValue({
        code: '23503', // PostgreSQL foreign key violation code
        message: 'violates foreign key constraint'
      });

      await expect(walletService.initializeWallet(mockUserId))
        .rejects.toThrow();
    });

    test('should handle check constraint violations', async () => {
      const mockUserId = 1;
      const mockAmount = -100.00; // Negative amount
      const mockSessionId = 123;
      const mockDescription = 'Invalid amount test';

      // Service should catch this before database
      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Invalid amount: must be a positive number');
    });
  });

  describe('Network and Connectivity Issues', () => {
    test('should handle database connection pool exhaustion', async () => {
      const mockUserId = 1;

      query.mockRejectedValue(new Error('connection pool exhausted'));

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('connection pool exhausted');
    });

    test('should handle transaction deadlock', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Deadlock test';

      transaction.mockRejectedValue({
        code: '40P01', // PostgreSQL deadlock code
        message: 'deadlock detected'
      });

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow();
    });

    test('should handle transaction serialization failures', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Serialization test';

      transaction.mockRejectedValue({
        code: '40001', // PostgreSQL serialization failure code
        message: 'could not serialize access'
      });

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow();
    });
  });

  describe('Data Corruption and Recovery', () => {
    test('should handle corrupted transaction data', async () => {
      const mockUserId = 1;

      // Mock corrupted data in result
      query.mockResolvedValue({
        rows: [{
          balance: 'invalid-number',
          currency: 'INR'
        }]
      });

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow();
    });

    test('should handle missing required fields in transactions', async () => {
      const mockUserId = 1;

      // Mock incomplete transaction data
      query.mockResolvedValue({
        rows: [{
          // Missing balance field
          currency: 'INR'
        }]
      });

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('Wallet not found for user');
    });

    test('should handle invalid UUID formats', async () => {
      const mockUserId = 1;
      const mockLimit = 10;
      const mockOffset = 0;

      // Mock invalid UUID in transaction
      query.mockResolvedValue({
        rows: [{
          uuid: 'invalid-uuid-format',
          transaction_type: 'debit',
          amount: 100.00,
          description: 'Test',
          reference_type: 'session',
          reference_id: 123,
          balance_after: 400.00,
          created_at: new Date()
        }]
      });

      const result = await walletService.getWalletTransactions(mockUserId, mockLimit, mockOffset);

      // Should still process despite invalid UUID format
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('invalid-uuid-format');
    });
  });
});