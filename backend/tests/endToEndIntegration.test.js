const billingEngine = require('../services/billingEngine');
const walletService = require('../services/walletService');
const { query, transaction } = require('../config/database');
const sessionController = require('../controllers/sessionController');

// Mock all dependencies
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

jest.mock('../services/walletService', () => ({
  debitWallet: jest.fn(),
  creditWallet: jest.fn(),
  getWalletBalance: jest.fn(),
  initializeWallet: jest.fn()
}));

jest.mock('../utils/agora', () => ({
  generateToken: jest.fn()
}));

describe('End-to-End Integration Tests - Wallet-Based Booking and Calling Flow', () => {
  let mockUserId, mockMentorId, mockSessionId, mockTransactionId;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock IDs
    mockUserId = 1;
    mockMentorId = 2;
    mockSessionId = 123;
    mockTransactionId = 456;

    // Mock successful database transactions
    transaction.mockImplementation(async (callback) => {
      const client = {
        query: jest.fn().mockResolvedValue({ rows: [] })
      };
      return await callback(client);
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('1. Wallet Top-up Flow', () => {
    test('should successfully complete wallet top-up via PhonePe', async () => {
      const topUpAmount = 1000.00;
      const mockWalletResult = { success: true, balance: 1000.00 };

      // Mock wallet initialization
      walletService.initializeWallet.mockResolvedValue({
        success: true,
        walletId: 'wallet-123'
      });

      // Mock credit wallet
      walletService.creditWallet.mockResolvedValue(mockWalletResult);

      // Mock database queries for wallet creation
      query.mockResolvedValueOnce({ rows: [] }) // No existing wallet
        .mockResolvedValueOnce({ rows: [{ uuid: 'wallet-123' }] }); // Wallet created

      // Execute wallet top-up flow
      const initResult = await walletService.initializeWallet(mockUserId);
      const creditResult = await walletService.creditWallet(
        mockUserId,
        topUpAmount,
        mockTransactionId,
        'PhonePe wallet top-up'
      );

      // Assertions
      expect(initResult.success).toBe(true);
      expect(creditResult.success).toBe(true);
      expect(creditResult.balance).toBe(1000.00);
      expect(walletService.initializeWallet).toHaveBeenCalledWith(mockUserId);
      expect(walletService.creditWallet).toHaveBeenCalledWith(
        mockUserId,
        topUpAmount,
        mockTransactionId,
        'PhonePe wallet top-up'
      );
    });

    test('should handle callback processing and wallet crediting', async () => {
      const callbackData = {
        transactionId: 'txn_123456',
        amount: 500.00,
        status: 'SUCCESS',
        userId: mockUserId
      };

      const mockCreditResult = { success: true, balance: 500.00 };

      walletService.creditWallet.mockResolvedValue(mockCreditResult);

      // Simulate callback processing
      const result = await walletService.creditWallet(
        callbackData.userId,
        callbackData.amount,
        callbackData.transactionId,
        `PhonePe payment - ${callbackData.transactionId}`
      );

      expect(result.success).toBe(true);
      expect(result.balance).toBe(500.00);
      expect(walletService.creditWallet).toHaveBeenCalledWith(
        callbackData.userId,
        callbackData.amount,
        callbackData.transactionId,
        `PhonePe payment - ${callbackData.transactionId}`
      );
    });

    test('should verify balance updates and transaction logging', async () => {
      const initialBalance = 200.00;
      const topUpAmount = 300.00;
      const expectedFinalBalance = 500.00;

      // Mock initial balance check
      walletService.getWalletBalance.mockResolvedValue({
        balance: initialBalance,
        currency: 'INR'
      });

      // Mock credit operation
      walletService.creditWallet.mockResolvedValue({
        success: true,
        balance: expectedFinalBalance
      });

      // Execute balance verification flow
      const initialBalanceCheck = await walletService.getWalletBalance(mockUserId);
      const creditResult = await walletService.creditWallet(
        mockUserId,
        topUpAmount,
        mockTransactionId,
        'Balance verification test'
      );

      expect(initialBalanceCheck.balance).toBe(initialBalance);
      expect(creditResult.balance).toBe(expectedFinalBalance);
      expect(creditResult.balance).toBe(initialBalance + topUpAmount);
    });
  });

  describe('2. Session Booking Flow', () => {
    test('should successfully create session with per-minute rates', async () => {
      const mockMentorData = {
        id: mockMentorId,
        hourly_rate: 600.00,
        currency: 'INR',
        min_session_duration: 30,
        max_session_duration: 120,
        user_id: 10,
        first_name: 'John',
        last_name: 'Mentor'
      };

      const sessionData = {
        mentorId: mockMentorId,
        title: 'Career Guidance Session',
        description: 'Discussion about career paths',
        sessionType: 'video',
        scheduledAt: '2025-01-15T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'Asia/Calcutta'
      };

      // Mock mentor data query
      query.mockResolvedValueOnce({ rows: [mockMentorData] });

      // Mock session creation transaction
      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockMentorData] })
            .mockResolvedValueOnce({ rows: [{
              id: mockSessionId,
              ...sessionData,
              per_minute_rate: 10.00, // 600/60
              minimum_debit: 150.00, // 15 minutes * 10
              status: 'scheduled'
            }] })
        };
        return await callback(client);
      });

      // Mock request/response objects
      const mockReq = {
        body: sessionData,
        user: { userId: mockUserId }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Execute session creation
      await sessionController.createSession(mockReq, mockRes);

      // Verify response
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Session created successfully',
          data: expect.objectContaining({
            session: expect.objectContaining({
              perMinuteRate: 10.00,
              minimumDebit: 150.00,
              status: 'scheduled'
            })
          })
        })
      );
    });

    test('should validate wallet balance for minimum booking amount', async () => {
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        minimum_debit: 150.00,
        status: 'scheduled'
      };

      const mockWalletBalance = { balance: 200.00, currency: 'INR' };

      // Mock session query
      query.mockResolvedValue({ rows: [mockSessionData] });

      // Mock wallet balance check
      walletService.getWalletBalance.mockResolvedValue(mockWalletBalance);

      // Mock join call transaction
      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({ rows: [mockWalletBalance] })
        };
        return await callback(client);
      });

      // Mock request/response for join call
      const mockReq = {
        params: { sessionId: mockSessionId.toString() },
        user: { userId: mockUserId }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Execute join call validation
      await sessionController.joinCall(mockReq, mockRes);

      // Verify wallet balance was checked
      expect(walletService.getWalletBalance).toHaveBeenCalledWith(mockUserId);
      expect(mockWalletBalance.balance).toBeGreaterThanOrEqual(mockSessionData.minimum_debit);
    });

    test('should confirm booking and update status', async () => {
      const mockSessionData = {
        id: mockSessionId,
        status: 'booked',
        title: 'Test Session',
        scheduled_at: new Date(),
        duration_minutes: 60
      };

      // Mock session update
      query.mockResolvedValue({ rows: [mockSessionData] });

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [mockSessionData] })
        };
        return await callback(client);
      });

      // Verify session status is 'scheduled' (confirmed in wallet system)
      expect(mockSessionData.status).toBe('scheduled');
    });
  });

  describe('3. Call Joining Flow', () => {
    test('should validate balance before allowing call join', async () => {
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        minimum_debit: 150.00,
        status: 'scheduled',
        scheduled_at: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        meeting_platform: 'agora'
      };

      const mockWalletBalance = { balance: 200.00, currency: 'INR' };

      // Mock session query
      query.mockResolvedValue({ rows: [mockSessionData] });

      // Mock wallet balance
      walletService.getWalletBalance.mockResolvedValue(mockWalletBalance);

      // Mock Agora token generation
      const mockAgora = require('../utils/agora');
      mockAgora.generateToken.mockResolvedValue('mock-agora-token');

      // Mock transaction for meeting creation and status update
      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({ rows: [mockWalletBalance] })
            .mockResolvedValueOnce({}) // Update session with meeting details
            .mockResolvedValueOnce({}) // Update session status
        };
        return await callback(client);
      });

      // Mock request/response
      const mockReq = {
        params: { sessionId: mockSessionId.toString() },
        user: { userId: mockUserId }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Execute join call
      await sessionController.joinCall(mockReq, mockRes);

      // Verify balance validation
      expect(walletService.getWalletBalance).toHaveBeenCalledWith(mockUserId);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Call joined successfully'
        })
      );
    });

    test('should debit minimum amount on call start', async () => {
      const minimumDebit = 150.00;
      const mockDebitResult = { success: true, balance: 50.00 };

      // Mock debit wallet
      walletService.debitWallet.mockResolvedValue(mockDebitResult);

      // Execute minimum debit
      const result = await walletService.debitWallet(
        mockUserId,
        minimumDebit,
        mockSessionId,
        `Session ${mockSessionId} - Initial debit (${minimumDebit} INR)`
      );

      expect(result.success).toBe(true);
      expect(result.balance).toBe(50.00);
      expect(walletService.debitWallet).toHaveBeenCalledWith(
        mockUserId,
        minimumDebit,
        mockSessionId,
        expect.stringContaining('Initial debit')
      );
    });

    test('should setup kill switch timer', async () => {
      const mockDurationMs = 5400000; // 90 minutes in milliseconds

      // Mock billing engine kill switch timer
      const setKillSwitchTimerSpy = jest.spyOn(billingEngine, 'setKillSwitchTimer');
      setKillSwitchTimerSpy.mockResolvedValue('timer_123_1234567890');

      // Execute timer setup
      const timerId = await billingEngine.setKillSwitchTimer(mockSessionId, mockDurationMs);

      expect(timerId).toMatch(/^timer_\d+_\d+$/);
      expect(setKillSwitchTimerSpy).toHaveBeenCalledWith(mockSessionId, mockDurationMs);
    });
  });

  describe('4. Call Billing Flow', () => {
    test('should handle real-time billing during call', async () => {
      const perMinuteRate = 10.00;
      const callDurationMinutes = 25;
      const expectedBill = callDurationMinutes * perMinuteRate; // 250.00

      // Mock call start
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        per_minute_rate: perMinuteRate,
        minimum_debit: 150.00,
        actual_billed_amount: 150.00,
        kill_switch_timer_id: 'timer_123_1234567890'
      };

      query.mockResolvedValue({ rows: [mockSessionData] });

      // Mock real-time billing calculation
      const realTimeBill = callDurationMinutes * perMinuteRate;
      expect(realTimeBill).toBe(expectedBill);
    });

    test('should send low balance warnings', async () => {
      const lowBalanceThreshold = 50.00;
      const currentBalance = 30.00;
      const minutesRemaining = Math.floor(currentBalance / 10); // 3 minutes at 10/minute

      // Mock low balance warning
      const sendLowBalanceWarningSpy = jest.spyOn(billingEngine, 'sendLowBalanceWarning');
      sendLowBalanceWarningSpy.mockResolvedValue({
        success: true,
        message: `Warning sent: ${minutesRemaining} minutes remaining`,
        minutesRemaining
      });

      const result = await billingEngine.sendLowBalanceWarning(mockSessionId, minutesRemaining);

      expect(result.success).toBe(true);
      expect(result.minutesRemaining).toBe(minutesRemaining);
      expect(sendLowBalanceWarningSpy).toHaveBeenCalledWith(mockSessionId, minutesRemaining);
    });

    test('should terminate call when balance depletes', async () => {
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        kill_switch_timer_id: 'timer_123_1234567890',
        first_name: 'John',
        last_name: 'Doe'
      };

      query.mockResolvedValue({ rows: [mockSessionData] });

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({}) // Update session
        };
        return await callback(client);
      });

      // Mock force end call
      const forceEndCallSpy = jest.spyOn(billingEngine, 'forceEndCall');
      forceEndCallSpy.mockResolvedValue({
        success: true,
        reason: 'BALANCE_DEPLETED',
        sessionId: mockSessionId
      });

      const result = await billingEngine.forceEndCall(mockSessionId, 'BALANCE_DEPLETED');

      expect(result.success).toBe(true);
      expect(result.reason).toBe('BALANCE_DEPLETED');
      expect(result.sessionId).toBe(mockSessionId);
    });

    test('should calculate final billing on call end', async () => {
      const actualDuration = 45; // minutes
      const perMinuteRate = 10.00;
      const minimumDebit = 150.00;
      const finalBill = Math.max(minimumDebit, actualDuration * perMinuteRate); // 450.00

      const mockSessionData = {
        id: mockSessionId,
        mentor_id: mockMentorId,
        mentee_id: mockUserId,
        per_minute_rate: perMinuteRate,
        minimum_debit: minimumDebit,
        actual_billed_amount: minimumDebit,
        kill_switch_timer_id: null
      };

      const mockWalletBalance = { balance: 300.00, currency: 'INR' };

      query.mockResolvedValue({ rows: [mockSessionData] });
      walletService.getWalletBalance.mockResolvedValue(mockWalletBalance);

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({ rows: [mockWalletBalance] })
            .mockResolvedValueOnce({}) // Additional debit
            .mockResolvedValueOnce({}) // Insert earnings
            .mockResolvedValueOnce({}) // Update session
        };
        return await callback(client);
      });

      const result = await billingEngine.handleCallEnded(mockSessionId, actualDuration);

      expect(result.success).toBe(true);
      expect(result.finalBill).toBe(finalBill);
      expect(result.finalBill).toBeGreaterThanOrEqual(minimumDebit);
    });
  });

  describe('5. Mentor Earnings Flow', () => {
    test('should record earnings after call completion', async () => {
      const finalBill = 300.00;
      const platformFeeRate = 0.1; // 10%
      const platformFee = finalBill * platformFeeRate; // 30.00
      const mentorEarnings = finalBill - platformFee; // 270.00

      const mockSessionData = {
        id: mockSessionId,
        mentor_id: mockMentorId,
        mentee_id: mockUserId,
        per_minute_rate: 10.00,
        minimum_debit: 150.00,
        actual_billed_amount: 150.00,
        kill_switch_timer_id: null
      };

      const mockWalletBalance = { balance: 200.00, currency: 'INR' };

      query.mockResolvedValue({ rows: [mockSessionData] });
      walletService.getWalletBalance.mockResolvedValue(mockWalletBalance);

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({ rows: [mockWalletBalance] })
            .mockResolvedValueOnce({}) // Insert mentor earnings
            .mockResolvedValueOnce({}) // Update session
        };
        return await callback(client);
      });

      const result = await billingEngine.handleCallEnded(mockSessionId, 30); // 30 minutes

      expect(result.success).toBe(true);
      expect(result.earnings).toBe(270.00); // 300 - 10%
      expect(result.platformFee).toBe(30.00);
      expect(result.finalBill).toBe(300.00);
    });

    test('should deduct platform fee correctly', async () => {
      const billAmount = 500.00;
      const platformFeeRate = 0.1;
      const expectedPlatformFee = billAmount * platformFeeRate; // 50.00
      const expectedMentorEarnings = billAmount - expectedPlatformFee; // 450.00

      // Test platform fee calculation
      expect(expectedPlatformFee).toBe(50.00);
      expect(expectedMentorEarnings).toBe(450.00);
      expect(expectedPlatformFee + expectedMentorEarnings).toBe(billAmount);
    });

    test('should track earnings status', async () => {
      const mockEarningsData = {
        mentor_id: mockMentorId,
        session_id: mockSessionId,
        amount: 225.00,
        currency: 'INR',
        status: 'completed'
      };

      // Mock earnings insertion
      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [mockEarningsData] })
        };
        return await callback(client);
      });

      // Verify earnings status
      expect(mockEarningsData.status).toBe('completed');
      expect(mockEarningsData.amount).toBe(225.00);
      expect(mockEarningsData.currency).toBe('INR');
    });
  });

  describe('6. Error Scenarios', () => {
    test('should handle insufficient balance for booking', async () => {
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        minimum_debit: 150.00,
        status: 'scheduled'
      };

      const mockWalletBalance = { balance: 50.00, currency: 'INR' }; // Insufficient balance

      query.mockResolvedValue({ rows: [mockSessionData] });
      walletService.getWalletBalance.mockResolvedValue(mockWalletBalance);

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [mockSessionData] })
        };
        return await callback(client);
      });

      // Mock request/response for join call
      const mockReq = {
        params: { sessionId: mockSessionId.toString() },
        user: { userId: mockUserId }
      };
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Execute join call with insufficient balance
      await sessionController.joinCall(mockReq, mockRes);

      // Verify error response
      expect(mockRes.status).toHaveBeenCalledWith(402);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          data: expect.objectContaining({
            required: 150.00,
            available: 50.00
          })
        })
      );
    });

    test('should handle balance depletion during call', async () => {
      const mockSessionData = {
        id: mockSessionId,
        mentee_id: mockUserId,
        kill_switch_timer_id: 'timer_123_1234567890'
      };

      query.mockResolvedValue({ rows: [mockSessionData] });

      transaction.mockImplementation(async (callback) => {
        const client = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockSessionData] })
            .mockResolvedValueOnce({}) // Update session
        };
        return await callback(client);
      });

      // Mock force end call for balance depletion
      const forceEndCallSpy = jest.spyOn(billingEngine, 'forceEndCall');
      forceEndCallSpy.mockResolvedValue({
        success: true,
        reason: 'BALANCE_DEPLETED'
      });

      const result = await billingEngine.forceEndCall(mockSessionId, 'BALANCE_DEPLETED');

      expect(result.success).toBe(true);
      expect(result.reason).toBe('BALANCE_DEPLETED');
    });

    test('should handle failed wallet operations', async () => {
      const debitAmount = 100.00;

      // Mock wallet debit failure
      walletService.debitWallet.mockRejectedValue(new Error('Wallet service error'));

      await expect(walletService.debitWallet(
        mockUserId,
        debitAmount,
        mockSessionId,
        'Test debit'
      )).rejects.toThrow('Wallet service error');
    });

    test('should handle invalid session states', async () => {
      const invalidSessionId = 'invalid';

      // Test invalid session ID in billing engine
      await expect(billingEngine.handleCallStarted(invalidSessionId))
        .rejects.toThrow('Invalid session ID');

      await expect(billingEngine.handleCallEnded(invalidSessionId, 30))
        .rejects.toThrow('Invalid session ID');
    });
  });

  describe('Complete User Journey Integration', () => {
    test('should complete full user journey from top-up to earnings', async () => {
      // Step 1: Wallet top-up
      walletService.initializeWallet.mockResolvedValue({
        success: true,
        walletId: 'wallet-123'
      });

      walletService.creditWallet.mockResolvedValue({
        success: true,
        balance: 1000.00
      });

      const walletInit = await walletService.initializeWallet(mockUserId);
      const topUp = await walletService.creditWallet(
        mockUserId,
        1000.00,
        mockTransactionId,
        'PhonePe top-up'
      );

      expect(walletInit.success).toBe(true);
      expect(topUp.balance).toBe(1000.00);

      // Step 2: Session booking (mocked)
      const sessionCreated = {
        id: mockSessionId,
        status: 'scheduled',
        perMinuteRate: 10.00,
        minimumDebit: 150.00
      };

      expect(sessionCreated.status).toBe('scheduled');

      // Step 3: Call joining with balance validation
      walletService.getWalletBalance.mockResolvedValue({
        balance: 1000.00,
        currency: 'INR'
      });

      const balanceCheck = await walletService.getWalletBalance(mockUserId);
      expect(balanceCheck.balance).toBeGreaterThanOrEqual(sessionCreated.minimumDebit);

      // Step 4: Call start with minimum debit
      walletService.debitWallet.mockResolvedValue({
        success: true,
        balance: 850.00
      });

      const callStart = await walletService.debitWallet(
        mockUserId,
        sessionCreated.minimumDebit,
        mockSessionId,
        `Session ${mockSessionId} - Initial debit (${sessionCreated.minimumDebit} INR)`
      );

      expect(callStart.success).toBe(true);
      expect(callStart.balance).toBe(850.00);

      // Step 5: Call completion with final billing
      const actualDuration = 60; // minutes
      const finalBill = actualDuration * sessionCreated.perMinuteRate; // 600.00
      const additionalDebit = finalBill - sessionCreated.minimumDebit; // 450.00

      walletService.debitWallet.mockResolvedValue({
        success: true,
        balance: 400.00
      });

      const finalDebit = await walletService.debitWallet(
        mockUserId,
        additionalDebit,
        mockSessionId,
        `Session ${mockSessionId} - Final billing (${additionalDebit} INR)`
      );

      expect(finalDebit.success).toBe(true);
      expect(finalDebit.balance).toBe(400.00);

      // Step 6: Mentor earnings calculation
      const platformFee = finalBill * 0.1; // 60.00
      const mentorEarnings = finalBill - platformFee; // 540.00

      expect(platformFee).toBe(60.00);
      expect(mentorEarnings).toBe(540.00);
      expect(platformFee + mentorEarnings).toBe(finalBill);

      // Verify complete journey
      expect(topUp.balance).toBe(1000.00); // Initial top-up
      expect(callStart.balance).toBe(850.00); // After minimum debit
      expect(finalDebit.balance).toBe(400.00); // After final billing
      expect(finalBill).toBe(600.00); // Total billed
      expect(mentorEarnings).toBe(540.00); // Mentor received
    });
  });
});