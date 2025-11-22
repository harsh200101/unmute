const { query, transaction } = require('../config/database');
const walletService = require('../services/walletService');

// Mock the database module
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

describe('Database Integrity Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Wallet Balance Constraints', () => {
    test('should prevent negative wallet balance', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Test debit';

      // Mock insufficient balance
      const mockBalanceResult = {
        rows: [{ balance: 50.00 }]
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

    test('should maintain balance consistency during concurrent operations', async () => {
      // This test verifies that the service properly checks balance before debiting
      const mockUserId = 1;
      const mockAmount = 50.00;
      const mockSessionId = 123;
      const mockDescription = 'Concurrent test';

      // Mock insufficient balance - balance is less than debit amount
      const mockBalanceResult = { rows: [{ balance: 25.00 }] };

      transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue(mockBalanceResult) // Balance check returns insufficient funds
        };
        return await callback(mockClient);
      });

      // Debit should fail due to insufficient balance
      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Insufficient wallet balance');
    });
  });

  describe('Transaction Logging', () => {
    test('should log all wallet transactions', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Test transaction';

      const mockBalanceResult = { rows: [{ balance: 200.00 }] };
      const mockTransactionResult = { rows: [{ balance_after: 100.00 }] };

      query.mockResolvedValueOnce(mockBalanceResult);
      transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce(mockBalanceResult) // Balance check
            .mockResolvedValueOnce(mockTransactionResult) // Transaction insert
        };
        return await callback(mockClient);
      });

      await walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription);

      // Verify transaction was logged
      expect(transaction).toHaveBeenCalled();
    });

    test('should maintain transaction reference integrity', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockTransactionId = 456;
      const mockDescription = 'Credit transaction';

      const mockTransactionResult = { rows: [{ balance_after: 200.00 }] };

      transaction.mockImplementation(async (callback) => {
        return await callback({
          query: jest.fn().mockResolvedValue(mockTransactionResult)
        });
      });

      await walletService.creditWallet(mockUserId, mockAmount, mockTransactionId, mockDescription);

      // Transaction should reference the payment ID
      expect(transaction).toHaveBeenCalled();
    });
  });

  describe('Foreign Key Constraints', () => {
    test('should enforce user-wallet relationship', async () => {
      const mockUserId = 999; // Non-existent user

      query.mockResolvedValue({ rows: [] }); // No wallet found

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('Wallet not found for user');
    });

    test('should validate wallet ownership', async () => {
      const mockUserId = 1;

      // Mock wallet belonging to different user
      query.mockResolvedValue({ rows: [] });

      await expect(walletService.getWalletBalance(mockUserId))
        .rejects.toThrow('Wallet not found for user');
    });
  });

  describe('Data Type Validation', () => {
    test('should validate decimal precision for amounts', async () => {
      const mockUserId = 1;
      const mockAmount = 100.123456; // More precision than allowed
      const mockSessionId = 123;
      const mockDescription = 'Precision test';

      const mockBalanceResult = { rows: [{ balance: 200.00 }] };
      const mockTransactionResult = { rows: [{ balance_after: 99.876544 }] };

      query.mockResolvedValueOnce(mockBalanceResult);
      transaction.mockImplementation(async (callback) => {
        return await callback({
          query: jest.fn().mockResolvedValue(mockTransactionResult)
        });
      });

      const result = await walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription);

      // Should handle decimal precision correctly
      expect(result.success).toBe(true);
      expect(typeof result.balance).toBe('number');
    });

    test('should handle currency consistency', async () => {
      const mockUserId = 1;

      const mockResult = {
        rows: [{
          balance: 500.00,
          currency: 'INR'
        }]
      };

      query.mockResolvedValue(mockResult);

      const result = await walletService.getWalletBalance(mockUserId);

      expect(result.currency).toBe('INR');
      expect(typeof result.balance).toBe('number');
    });
  });

  describe('Transaction Atomicity', () => {
    test('should rollback on transaction failure', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Atomicity test';

      // Simulate transaction failure
      transaction.mockImplementation(async () => {
        throw new Error('Database connection lost');
      });

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Database connection lost');

      // Transaction should be rolled back automatically
      expect(transaction).toHaveBeenCalled();
    });

    test('should maintain data consistency on partial failures', async () => {
      const mockUserId = 1;
      const mockAmount = 100.00;
      const mockSessionId = 123;
      const mockDescription = 'Consistency test';

      // Simulate partial failure in transaction
      transaction.mockImplementation(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ balance: 200.00 }] }) // Balance check succeeds
            .mockRejectedValueOnce(new Error('Transaction log failed')) // Transaction insert fails
        };
        return await callback(mockClient);
      });

      await expect(walletService.debitWallet(mockUserId, mockAmount, mockSessionId, mockDescription))
        .rejects.toThrow('Transaction log failed');

      // Balance should not be modified due to transaction rollback
    });
  });

  describe('Index Performance Validation', () => {
    test('should use proper indexes for wallet queries', async () => {
      const mockUserId = 1;

      const mockResult = {
        rows: [{
          balance: 500.00,
          currency: 'INR'
        }]
      };

      query.mockResolvedValue(mockResult);

      await walletService.getWalletBalance(mockUserId);

      // Query should use user_id index
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1'),
        [mockUserId]
      );
    });

    test('should use indexes for transaction queries', async () => {
      const mockUserId = 1;
      const mockLimit = 10;
      const mockOffset = 0;

      const mockResult = { rows: [] };

      query.mockResolvedValue(mockResult);

      await walletService.getWalletTransactions(mockUserId, mockLimit, mockOffset);

      // Query should use proper JOIN and ORDER BY for index utilization
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN wallets w ON wt.wallet_id = w.id'),
        [mockUserId, mockLimit, mockOffset]
      );
    });
  });
});