const request = require('supertest');
const express = require('express');
const { query, transaction } = require('../config/database');

// Mock the database module
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

// Mock auth middleware
const mockAuth = jest.fn((req, res, next) => {
  req.user = { userId: 1 }; // Mock authenticated user
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

// Mock axios for PhonePe API calls
jest.mock('axios', () => ({
  post: jest.fn()
}));

// Mock crypto for transaction IDs
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid'),
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-hash')
    }))
  })),
  createHmac: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'mock-hmac')
    }))
  }))
}));

// Mock DNS lookup
jest.mock('dns', () => ({
  promises: {
    lookup: jest.fn(() => Promise.resolve())
  }
}));

const app = express();
app.use(express.json());
app.use('/api/wallet', walletRoutes);

describe('Wallet API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/wallet/balance', () => {
    test('should return wallet balance for authenticated user', async () => {
      const mockBalance = {
        balance: 500.00,
        currency: 'INR'
      };

      // Mock the wallet service getWalletBalance function
      const walletService = require('../services/walletService');
      walletService.getWalletBalance = jest.fn().mockResolvedValue(mockBalance);

      const response = await request(app)
        .get('/api/wallet/balance')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBalance);
    });

    test('should handle wallet service errors', async () => {
      const walletService = require('../services/walletService');
      walletService.getWalletBalance = jest.fn().mockRejectedValue(new Error('Wallet not found'));

      const response = await request(app)
        .get('/api/wallet/balance')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to get wallet balance');
    });
  });

  describe('GET /api/wallet/transactions', () => {
    test('should return paginated transactions', async () => {
      const mockTransactions = [
        {
          id: 'txn-123',
          type: 'debit',
          amount: 100.00,
          description: 'Session payment',
          referenceType: 'session',
          referenceId: 123,
          balanceAfter: 400.00,
          createdAt: new Date('2025-01-01')
        }
      ];

      const walletService = require('../services/walletService');
      walletService.getWalletTransactions = jest.fn().mockResolvedValue(mockTransactions);

      const response = await request(app)
        .get('/api/wallet/transactions?limit=10&offset=0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toEqual(mockTransactions);
      expect(response.body.data.pagination).toEqual({
        limit: 10,
        offset: 0,
        hasMore: false
      });
    });

    test('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/wallet/transactions?limit=150')
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_LIMIT');
    });

    test('should use default pagination values', async () => {
      const mockTransactions = [];
      const walletService = require('../services/walletService');
      walletService.getWalletTransactions = jest.fn().mockResolvedValue(mockTransactions);

      await request(app)
        .get('/api/wallet/transactions')
        .expect(200);

      expect(walletService.getWalletTransactions).toHaveBeenCalledWith(1, 50, 0);
    });
  });

  describe('POST /api/wallet/topup', () => {
    test('should initiate wallet top-up successfully', async () => {
      const mockAmount = 500.00;
      const mockUser = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '9999999999'
      };

      // Mock user query
      query.mockResolvedValueOnce({ rows: [mockUser] });

      // Mock axios PhonePe response
      const axios = require('axios');
      axios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            instrumentResponse: {
              redirectInfo: {
                url: 'https://phonepe.com/pay/mock-url'
              }
            }
          }
        }
      });

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.redirectUrl).toBe('https://phonepe.com/pay/mock-url');
      expect(response.body.transactionId).toMatch(/^WT/);
    });

    test('should reject invalid amount', async () => {
      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: 0 })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_AMOUNT');
    });

    test('should reject amount over limit', async () => {
      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: 60000 })
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_AMOUNT');
    });

    test('should prevent duplicate pending top-ups', async () => {
      const mockAmount = 500.00;

      // Mock existing pending top-up
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PENDING_TOPUP_EXISTS');
    });

    test('should handle PhonePe API failure', async () => {
      const mockAmount = 500.00;
      const mockUser = {
        first_name: 'John',
        last_name: 'Doe',
        phone: '9999999999'
      };

      query.mockResolvedValueOnce({ rows: [mockUser] });

      const axios = require('axios');
      axios.post.mockResolvedValue({
        data: {
          success: false,
          message: 'Payment failed'
        }
      });

      const response = await request(app)
        .post('/api/wallet/topup')
        .send({ amount: mockAmount })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Payment failed');
    });
  });

  describe('POST /api/wallet/callback', () => {
    test('should handle successful payment callback', async () => {
      const mockPayload = {
        data: {
          merchantTransactionId: 'WTmock-uuid'
        },
        code: 'PAYMENT_SUCCESS'
      };

      // Mock payment update
      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          amount: 500.00,
          metadata: JSON.stringify({ userId: '1', type: 'wallet_topup' })
        }]
      });

      // Mock wallet credit
      const walletService = require('../services/walletService');
      walletService.creditWallet = jest.fn().mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/wallet/callback')
        .send({ response: Buffer.from(JSON.stringify(mockPayload)).toString('base64') })
        .expect(302);

      expect(walletService.creditWallet).toHaveBeenCalledWith(1, 500.00, 1, 'Wallet Top-up');
    });

    test('should handle failed payment callback', async () => {
      const mockPayload = {
        data: {
          merchantTransactionId: 'WTmock-uuid'
        },
        code: 'PAYMENT_ERROR'
      };

      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          amount: 500.00,
          metadata: JSON.stringify({ userId: '1', type: 'wallet_topup' })
        }]
      });

      const response = await request(app)
        .post('/api/wallet/callback')
        .send({ response: Buffer.from(JSON.stringify(mockPayload)).toString('base64') })
        .expect(302);

      // Should not credit wallet for failed payments
      const walletService = require('../services/walletService');
      expect(walletService.creditWallet).not.toHaveBeenCalled();
    });

    test('should handle test simulator payload format', async () => {
      const mockPayload = {
        code: 'PAYMENT_SUCCESS',
        transactionId: 'WTmock-uuid',
        checksum: 'mock-checksum'
      };

      query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          amount: 500.00,
          metadata: JSON.stringify({ userId: '1', type: 'wallet_topup' })
        }]
      });

      const walletService = require('../services/walletService');
      walletService.creditWallet = jest.fn().mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/wallet/callback')
        .send(mockPayload)
        .expect(302);

      expect(walletService.creditWallet).toHaveBeenCalledWith(1, 500.00, 1, 'Wallet Top-up');
    });
  });

  describe('GET /api/wallet/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/wallet/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.service).toBe('Wallet API');
      expect(response.body.uptime).toBeDefined();
    });
  });
});