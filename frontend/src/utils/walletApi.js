import api, { endpoints } from './api';
import { toast } from 'react-hot-toast';

/**
 * Wallet API utilities for managing wallet operations
 */

/**
 * Get user's current wallet balance
 * @returns {Promise<Object>} Wallet balance data
 */
export const getWalletBalance = async () => {
  try {
    const response = await api.get(endpoints.wallet.balance);

    if (response.data.success) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      throw new Error(response.data.message || 'Failed to fetch wallet balance');
    }
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to load wallet balance';
    toast.error(errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Get paginated wallet transaction history
 * @param {number} limit - Number of transactions to fetch (default: 20)
 * @param {number} offset - Offset for pagination (default: 0)
 * @returns {Promise<Object>} Transaction history data
 */
export const getWalletTransactions = async (limit = 20, offset = 0) => {
  try {
    const params = {};
    if (limit) params.limit = limit;
    if (offset) params.offset = offset;

    const response = await api.get(endpoints.wallet.transactions, { params });

    if (response.data.success) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      throw new Error(response.data.message || 'Failed to fetch wallet transactions');
    }
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to load transaction history';
    toast.error(errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Initiate wallet top-up process via PhonePe
 * @param {number} amount - Amount to top-up in INR
 * @returns {Promise<Object>} Top-up initiation data with redirect URL
 */
export const initiateWalletTopup = async (amount) => {
  try {
    const response = await api.post(endpoints.wallet.topup, { amount });

    if (response.data.success) {
      toast.success('Redirecting to payment...');
      return {
        success: true,
        data: response.data.data
      };
    } else {
      throw new Error(response.data.message || 'Failed to initiate wallet top-up');
    }
  } catch (error) {
    console.error('Error initiating wallet top-up:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to initiate top-up';
    toast.error(errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Check wallet top-up payment status
 * @param {string} transactionId - Transaction ID to check
 * @returns {Promise<Object>} Payment status data
 */
export const checkWalletTopupStatus = async (transactionId) => {
  try {
    const response = await api.get(endpoints.payments.status(transactionId));

    // The payments status endpoint returns different format
    if (response.data.status && response.data.status !== 'NOT_FOUND') {
      return {
        success: true,
        data: {
          status: response.data.status,
          amount: response.data.amount
        }
      };
    } else if (response.data.status === 'NOT_FOUND') {
      throw new Error('Transaction not found');
    } else {
      throw new Error('Failed to check payment status');
    }
  } catch (error) {
    console.error('Error checking wallet top-up status:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to check payment status';
    toast.error(errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Validate wallet balance and join video call session
 * @param {number} sessionId - Session ID to join
 * @returns {Promise<Object>} Join session data
 */
export const joinCall = async (sessionId) => {
  try {
    // First, check wallet balance to ensure sufficient funds
    const balanceResponse = await getWalletBalance();

    if (!balanceResponse.success) {
      throw new Error('Unable to verify wallet balance');
    }

    const balance = balanceResponse.data?.balance || 0;

    // If balance is insufficient, show warning but allow attempt (backend will handle)
    if (balance <= 0) {
      toast.warn('Your wallet balance is low. Please top-up to avoid call interruptions.');
    }

    // Attempt to join the call
    const joinResponse = await api.post(endpoints.sessions.join(sessionId));

    if (joinResponse.data.success) {
      return {
        success: true,
        data: joinResponse.data.data,
        balance: balance
      };
    } else {
      throw new Error(joinResponse.data.message || 'Failed to join call');
    }
  } catch (error) {
    console.error('Error joining call:', error);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to join video call';

    // Handle specific error cases
    if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
      toast.error('Insufficient wallet balance. Please top-up your wallet.');
    } else if (errorMessage.includes('not found') || errorMessage.includes('Session not found')) {
      toast.error('Session not found or access denied.');
    } else if (errorMessage.includes('time') || errorMessage.includes('scheduled')) {
      toast.error('Session is not available for joining at this time.');
    } else {
      toast.error(errorMessage);
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

// Export all functions as default
export default {
  getWalletBalance,
  getWalletTransactions,
  initiateWalletTopup,
  checkWalletTopupStatus,
  joinCall
};