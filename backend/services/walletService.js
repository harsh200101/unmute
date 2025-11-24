const { query, transaction } = require('../config/database');

/**
 * Get current wallet balance for a user
 * @param {number} userId - User ID
 * @returns {Promise<{balance: number, currency: string}>}
 */
async function getWalletBalance(userId) {
  if (!userId || typeof userId !== 'number') {
    throw new Error('Invalid user ID');
  }

  try {
    const result = await query(
      'SELECT balance, currency FROM wallets WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found for user');
    }

    return {
      balance: parseFloat(result.rows[0].balance),
      currency: result.rows[0].currency
    };
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw error;
  }
}

/**
 * Debit amount from wallet with transaction logging
 * @param {number} userId - User ID
 * @param {number} amount - Amount to debit
 * @param {number} sessionId - Session ID for reference
 * @param {string} description - Transaction description
 * @param {object} [client=null] - Optional database client for transactions.
 * @returns {Promise<{success: boolean, balance: number}>}
 */
async function debitWallet(userId, amount, sessionId, description, client = null) {
    const a = parseFloat(amount);
    if (!userId || !Number.isInteger(userId)) throw new Error('Invalid user ID');
    if (isNaN(a) || a <= 0) throw new Error('Invalid amount: must be a positive number');
    if (!sessionId || !Number.isInteger(sessionId)) throw new Error('Invalid session ID');
    if (!description) throw new Error('Invalid description');

    const operation = async (dbClient) => {
        // Lock the wallet row to prevent race conditions during concurrent debits.
        const balanceResult = await dbClient.query(
            'SELECT balance FROM wallets WHERE user_id = $1 AND is_active = true FOR UPDATE',
            [userId]
        );

        if (balanceResult.rows.length === 0) throw new Error('Wallet not found for user');
        
        const currentBalance = parseFloat(balanceResult.rows[0].balance);
        if (currentBalance < a) throw new Error('Insufficient wallet balance');

        // The trigger `update_wallet_balance` handles the actual balance update.
        const transResult = await dbClient.query(
            `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description, reference_type, reference_id)
             SELECT w.id, 'debit', $1, $2, 'session', $3 FROM wallets w WHERE w.user_id = $4 AND w.is_active = true
             RETURNING balance_after`,
            [a, description, sessionId, userId]
        );

        if (transResult.rows.length === 0) throw new Error('Failed to create debit transaction');
        
        return {
            success: true,
            balance: parseFloat(transResult.rows[0].balance_after),
        };
    };

    // If a client is provided, use it; otherwise, create a new transaction.
    if (client) {
        return await operation(client);
    } else {
        return await transaction(operation);
    }
}

/**
 * Credit amount to wallet with transaction logging
 * @param {number} userId - User ID
 * @param {number} amount - Amount to credit
 * @param {number} referenceId - Reference ID (e.g., session ID, payment ID)
 * @param {string} description - Transaction description
 * @param {object} [client=null] - Optional database client for transactions.
 * @returns {Promise<{success: boolean, balance: number}>}
 */
async function creditWallet(userId, amount, referenceId, description, client = null) {
    const a = parseFloat(amount);
    if (!userId || !Number.isInteger(userId)) throw new Error('Invalid user ID');
    if (isNaN(a) || a <= 0) throw new Error('Invalid amount: must be a positive number');
    if (!referenceId || !Number.isInteger(referenceId)) throw new Error('Invalid reference ID');
    if (!description) throw new Error('Invalid description');

    const operation = async (dbClient) => {
        // The trigger `update_wallet_balance` handles the balance update. No need for FOR UPDATE here
        // as credits don't have the same race condition risk as debits.
        const transResult = await dbClient.query(
            `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, description, reference_type, reference_id)
             SELECT w.id, 'credit', $1, $2, 'session', $3 FROM wallets w WHERE w.user_id = $4 AND w.is_active = true
             RETURNING balance_after`,
            [a, description, referenceId, userId]
        );

        if (transResult.rows.length === 0) throw new Error('Failed to create credit transaction');

        return {
            success: true,
            balance: parseFloat(transResult.rows[0].balance_after),
        };
    };
    
    // If a client is provided, use it; otherwise, create a new transaction.
    if (client) {
        return await operation(client);
    } else {
        return await transaction(operation);
    }
}

/**
 * Get wallet transaction history
 * @param {number} userId - User ID
 * @param {number} limit - Number of transactions to return (default: 50)
 * @param {number} offset - Offset for pagination (default: 0)
 * @param {object} filters - Optional filters { type, startDate, endDate }
 * @returns {Promise<Array>} Array of transactions
 */
async function getWalletTransactions(userId, limit = 50, offset = 0, filters = {}) {
  if (!userId || typeof userId !== 'number') {
    throw new Error('Invalid user ID');
  }
  if (limit && (typeof limit !== 'number' || limit <= 0 || limit > 100)) {
    throw new Error('Invalid limit: must be between 1 and 100');
  }
  if (offset && (typeof offset !== 'number' || offset < 0)) {
    throw new Error('Invalid offset: must be non-negative');
  }

  try {
    let queryStr = `SELECT
        wt.uuid,
        wt.transaction_type,
        wt.amount,
        wt.description,
        wt.reference_type,
        wt.reference_id,
        wt.balance_after,
        wt.created_at
      FROM wallet_transactions wt
      JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = $1 AND w.is_active = true`;

    const queryParams = [userId];
    let paramIndex = 2;

    // Add type filter
    if (filters.type) {
      queryStr += ` AND wt.transaction_type = $${paramIndex}`;
      queryParams.push(filters.type);
      paramIndex++;
    }

    // Add date range filter
    if (filters.startDate) {
      queryStr += ` AND DATE(wt.created_at) >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      queryStr += ` AND DATE(wt.created_at) <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    queryStr += ` ORDER BY wt.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await query(queryStr, queryParams);

    return result.rows.map(row => ({
      id: row.uuid,
      type: row.transaction_type,
      amount: parseFloat(row.amount),
      description: row.description,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      balanceAfter: parseFloat(row.balance_after),
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('Error getting wallet transactions:', error);
    throw error;
  }
}

/**
 * Initialize wallet for new user
 * @param {number} userId - User ID
 * @param {object} [client=null] - Optional database client for transactions
 * @returns {Promise<{success: boolean, walletId: string}>}
 */
async function initializeWallet(userId, client = null) {
  if (!userId || typeof userId !== 'number') {
    throw new Error('Invalid user ID');
  }

  const dbClient = client || query;

  try {
    // Check if wallet already exists
    const existingResult = await dbClient.query(
      'SELECT uuid FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (existingResult.rows.length > 0) {
      return {
        success: true,
        walletId: existingResult.rows[0].uuid,
        message: 'Wallet already exists'
      };
    }

    // Create new wallet
    const result = await dbClient.query(
      'INSERT INTO wallets (user_id, balance, currency, is_active) VALUES ($1, $2, $3, $4) RETURNING uuid',
      [userId, 0, 'INR', true]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create wallet');
    }

    return {
      success: true,
      walletId: result.rows[0].uuid
    };
  } catch (error) {
    console.error('Error initializing wallet:', error);
    throw error;
  }
}

module.exports = {
  getWalletBalance,
  debitWallet,
  creditWallet,
  getWalletTransactions,
  initializeWallet
};