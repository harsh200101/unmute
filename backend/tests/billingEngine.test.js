const { transaction } = require('../config/database');
const billingEngine = require('../services/billingEngine');
const walletService = require('../services/walletService');

// Mock a database transaction for testing purposes.
jest.mock('../config/database', () => ({
    transaction: jest.fn(async (callback) => {
        // The key fix: ensure the async callback is awaited.
        return await callback(mockClient);
    }),
}));

// Mock the database client.
const mockClient = {
    query: jest.fn(),
};

// Mock the wallet service.
jest.mock('../services/walletService', () => ({
    getWalletBalance: jest.fn(),
    debitWallet: jest.fn(),
    creditWallet: jest.fn(),
}));

describe('Billing Engine', () => {
    let mockSession;

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();

        // Define a default mock session for tests to use/override
        mockSession = {
            id: 1,
            mentee_id: 10,
            mentor_id: 20,
            status: 'in_progress',
            billing_status: 'pending',
            billed_minutes: 0,
            per_minute_rate: 10, // 10 INR per minute
            minimum_charge: 150, // 15 minutes * 10 INR/min
            billing_start_time: null,
            mentee_present: false,
            mentor_present: false,
        };

        // A more robust mock that allows for chaining and inspection.
        mockClient.query.mockImplementation((queryText) => {
            if (queryText.includes('SELECT * FROM sessions')) {
                return Promise.resolve({ rows: [mockSession], rowCount: 1 });
            }
             // Ensure all other query types also return a resolved promise.
            return Promise.resolve({ rows: [], rowCount: 1 });
        });
    });

    describe('handleUserJoin', () => {
        it('should mark user as present and not start billing if other user is absent', async () => {
            mockSession.mentor_present = false; // Mentor is not here yet

            const result = await billingEngine.handleUserJoin(1, 'mentee');

            expect(mockClient.query).toHaveBeenCalledWith('UPDATE sessions SET mentee_present = true WHERE id = $1', [1]);
            expect(mockClient.query).not.toHaveBeenCalledWith(expect.stringContaining("billing_status = 'active'"));
            expect(result.billingStatus).toBe('pending');
        });

        it("should start billing when the second user joins", async () => {
            mockSession.mentor_present = true; // Mentor is already here
            mockSession.billing_status = 'paused';

            const result = await billingEngine.handleUserJoin(1, 'mentee');

            expect(mockClient.query).toHaveBeenCalledWith(
                "UPDATE sessions SET billing_status = 'active', billing_start_time = CURRENT_TIMESTAMP WHERE id = $1",
                [1]
            );
            expect(result.billingStatus).toBe('active');
        });
    });

    describe('handleUserLeave', () => {
        it('should pause an active billing session', async () => {
            mockSession.billing_status = 'active';
            mockSession.billing_start_time = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
            mockSession.billed_minutes = 10;

            const result = await billingEngine.handleUserLeave(1, 'mentor');

            // It should update the presence
            expect(mockClient.query).toHaveBeenCalledWith('UPDATE sessions SET mentor_present = false WHERE id = $1', [1]);
            
            // It should pause the billing and update billed_minutes
            const updateQuery = mockClient.query.mock.calls.find(call => call[0].includes("UPDATE sessions SET\n                    billed_minutes ="));
            expect(updateQuery).toBeDefined();
            // The new billed minutes should be approximately 15 (10 existing + 5 new)
            expect(updateQuery[1][0]).toBeCloseTo(15, 0);
            expect(updateQuery[0]).toContain("billing_status = 'paused'");
            expect(result.billingStatus).toBe('paused');
        });
    });

    describe('_finalizeSession (via endSession)', () => {
        it('should apply the minimum charge if billed minutes are too low', async () => {
            mockSession.billed_minutes = 10; // Less than the 15-min minimum
            
            const result = await billingEngine.endSession(1, 'test_end');

            const finalBill = 150; // Should be the minimum charge
            const platformFee = finalBill * 0.15;
            const mentorPayout = finalBill - platformFee;

            // Verify debit/credit calls
            expect(walletService.debitWallet).toHaveBeenCalledWith(mockSession.mentee_id, finalBill, mockSession.id, expect.any(String), mockClient);
            expect(walletService.creditWallet).toHaveBeenCalledWith(mockSession.mentor_id, mentorPayout, mockSession.id, expect.any(String), mockClient);
            
            // Verify final session update
            const finalUpdateCall = mockClient.query.mock.calls.find(call => call[0].includes("UPDATE sessions SET\n                status = 'completed'"));
            expect(finalUpdateCall[1][3]).toBe(finalBill); // actual_billed_amount
            expect(result.finalBill).toBe(finalBill);
        });

        it('should charge for the actual duration if it exceeds the minimum', async () => {
            mockSession.billed_minutes = 20; // More than 15 minutes

            const result = await billingEngine.endSession(1, 'test_end');

            const finalBill = 20 * 10; // 200
            const platformFee = finalBill * 0.15;
            const mentorPayout = finalBill - platformFee;

            expect(walletService.debitWallet).toHaveBeenCalledWith(mockSession.mentee_id, finalBill, mockSession.id, expect.any(String), mockClient);
            expect(walletService.creditWallet).toHaveBeenCalledWith(mockSession.mentor_id, mentorPayout, mockSession.id, expect.any(String), mockClient);
            expect(result.finalBill).toBe(finalBill);
        });
    });
    
    describe('initiateSessionTimers', () => {
        it('should set a 60-minute timer if balance is sufficient', async () => {
            // גבוה balance (enough for > 60 mins)
            walletService.getWalletBalance.mockResolvedValue({ balance: 1000 }); 
            mockSession.per_minute_rate = 10;
            
            jest.useFakeTimers();
            const setTimeoutMock = jest.spyOn(global, 'setTimeout');

            await billingEngine.initiateSessionTimers(1);

            // Expect a timer to be set for 60 minutes
            expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
            
            jest.useRealTimers();
            setTimeoutMock.mockRestore();
        });

        it('should set a shorter timer if balance is insufficient for 60 minutes', async () => {
            // Low balance (enough for 30 mins)
            walletService.getWalletBalance.mockResolvedValue({ balance: 300 });
            mockSession.per_minute_rate = 10;

            jest.useFakeTimers();
            const setTimeoutMock = jest.spyOn(global, 'setTimeout');

            await billingEngine.initiateSessionTimers(1);
            
            // Expect timers for auto-end and a 5-min warning
            expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 30 * 60 * 1000); // Main timer
            expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 25 * 60 * 1000); // 5-min warning
            
            jest.useRealTimers();
            setTimeoutMock.mockRestore();
        });
    });
});