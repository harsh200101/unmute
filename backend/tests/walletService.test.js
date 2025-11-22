const { query, transaction } = require('../config/database');
const walletService = require('../services/walletService');

// Mock the database module
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

describe('Wallet Service Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWalletBalance', () => {
    test('should return wallet balance for existing user', async () => {
      const mockUserId = 1;
      const mockResult = {
        rows: [{
          balance: 500.00,
          currency: 'INR'
        }]
      };

      query.mockResolvedValue(mockResult);

      const result = await walletService.getWalletBalance(mockUserId);

      expect(query).toHaveBeenCalledWith(
        'SELECT balance, currency FROM wallets WHERE user_id = $1 AND is_active = true',
        [mockUserId]
      );
      expect(result).toEqual({
        balance: 500.00,
        currency: 'INR'
      });
    });

    test('should throw error for non-existent wallet', async () => {
      const mockUserId = 999;
      const mockResult = { rows: [] };

      query.mockResolvedValue(mockResult);

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('Wallet not found for user');
    });

    test('should throw error for invalid user ID', async () => {
      await expect(walletService.getWalletBalance('invalid'))
        .rejects.toThrow('Invalid user ID');
      await expect(walletService.getWalletBalance(null))
        .rejects.toThrow('Invalid user ID');
    });
  });

  describe('debitWallet', () => {
    test('should successfully debit wallet with sufficient balance', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Session payment';

      const mockBalanceResult = {
        rows: [{ balance: 500.00 }]
      };

      const mockTransactionResult = {
        rows: [{ balance_after: 400.00 }]
      };

      query.mockResolvedValueOnce(mockBalanceResult);
      transaction.mockImplementation(async (callback) => {
        return await callback({
          query: jest.fn().mockResolvedValue(mockTransactionResult)
        });
      });

      const result = await walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription);

      expect(result).toEqual({
        success: true,
        balance: 400.00
      });
    });

    test('should throw error for insufficient balance', async () => {
      const mockUserId = 1;
      const mockAmount = 600.00;
      const mockSessionId = 123;
      const mockDescription = 'Session payment';

      const mockBalanceResult = {
        rows: [{ balance: 500.00 }]
      };

      query.mockResolvedValueOnce(mockBalanceResult);
      transaction.mockImplementation(async (callback) => {
        return await callback({
          query: jest.fn().mockResolvedValue(mockBalanceResult)
        });
      });

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Insufficient wallet balance');
    });

    test('should throw error for invalid parameters', async () => {
      await expect(walletService.debitWallet('invalid', 100, 123, 'test'))
        .rejects.toThrow('Invalid user ID');
      await expect(walletService.debitWallet(1, -100, 123, 'test'))
        .rejects.toThrow('Invalid amount: must be a positive number');
      await expect(walletService.debitWallet(1, 100, 'invalid', 'test'))
        .rejects.toThrow('Invalid session ID');
      await expect(walletService.debitWallet(1, 100, 123, 123))
        .rejects.toThrow('Invalid description');
    });
  });

  describe('creditWallet', () => {
    test('should successfully credit wallet', async () => {
      const mockUserId = 1;
      const mockAmount = 200.00;
      const mockTransactionId = 456;
      const mockDescription = 'Wallet top-up';

      const mockTransactionResult = {
        rows: [{ balance_after: 700.00 }]
      };

      transaction.mockImplementation(async (callback) => {
        return await callback({
          query: jest.fn().mockResolvedValue(mockTransactionResult)
        });
      });

      const result = await walletService.creditWallet(mockUserId, mockAmount, mockTransactionId, mockDescription);

      expect(result).toEqual({
        success: true,
        balance: 700.00
      });
    });

    test('should throw error for invalid parameters', async () => {
      await expect(walletService.creditWallet('invalid', 100, 456, 'test'))
        .rejects.toThrow('Invalid user ID');
      await expect(walletService.creditWallet(1, 0, 456, 'test'))
        .rejects.toThrow('Invalid amount: must be a positive number');
      await expect(walletService.creditWallet(1, 100, 'invalid', 'test'))
        .rejects.toThrow('Invalid transaction ID');
    });
  });

  describe('getWalletTransactions', () => {
    test('should return paginated transactions', async () => {
      const mockUserId = 1;
      const mockLimit = 10;
      const mockOffset = 0;

      const mockResult = {
        rows: [{
          uuid: 'txn-123',
          transaction_type: 'debit',
          amount: 100.00,
          description: 'Session payment',
          reference_type: 'session',
          reference_id: 123,
          balance_after: 400.00,
          created_at: new Date('2025-01-01')
        }]
      };

      query.mockResolvedValue(mockResult);

      const result = await walletService.getWalletTransactions(mockUserId, mockLimit, mockOffset);

      expect(result).toEqual([{
        id: 'txn-123',
        type: 'debit',
        amount: 100.00,
        description: 'Session payment',
        referenceType: 'session',
        referenceId: 123,
        balanceAfter: 400.00,
        createdAt: new Date('2025-01-01')
      }]);
    });

    test('should use default values for limit and offset', async () => {
      const mockUserId = 1;
      const mockResult = { rows: [] };

      query.mockResolvedValue(mockResult);

      await walletService.getWalletTransactions(mockUserId);

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        [mockUserId, 50, 0]
      );
    });

    test('should throw error for invalid parameters', async () => {
      await expect(walletService.getWalletTransactions('invalid'))
        .rejects.toThrow('Invalid user ID');
      await expect(walletService.getWalletTransactions(1, 150))
        .rejects.toThrow('Invalid limit: must be between 1 and 100');
      await expect(walletService.getWalletTransactions(1, 50, -1))
        .rejects.toThrow('Invalid offset: must be non-negative');
    });
  });

  describe('initializeWallet', () => {
    test('should create new wallet for user without existing wallet', async () => {
      const mockUserId = 1;

      // First query returns no existing wallet
      query.mockResolvedValueOnce({ rows: [] });
      // Second query creates wallet
      query.mockResolvedValueOnce({ rows: [{ uuid: 'wallet-123' }] });

      const result = await walletService.initializeWallet(mockUserId);

      expect(result).toEqual({
        success: true,
        walletId: 'wallet-123'
      });
    });

    test('should return existing wallet if already exists', async () => {
      const mockUserId = 1;

      query.mockResolvedValueOnce({ rows: [{ uuid: 'existing-wallet-123' }] });

      const result = await walletService.initializeWallet(mockUserId);

      expect(result).toEqual({
        success: true,
        walletId: 'existing-wallet-123',
        message: 'Wallet already exists'
      });
    });

    test('should throw error for invalid user ID', async () => {
      await expect(walletService.initializeWallet('invalid'))
        .rejects.toThrow('Invalid user ID');
    });
  });
});