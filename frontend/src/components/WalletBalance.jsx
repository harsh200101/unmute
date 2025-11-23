import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import LoadingSpinner from './LoadingSpinner';
import { toast } from 'react-hot-toast';

// Compact version for header
export const WalletBalanceHeader = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customError, setCustomError] = useState('');

  const fetchBalance = async () => {
    try {
      const response = await api.get('/wallet/balance');
      if (response.data.success) {
        setBalance(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching wallet balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = (amount) => {
    setShowDropdown(false);
    api.post('/wallet/topup', { amount })
      .then(response => {
        if (response.data.success) {
          toast.success('Redirecting to payment...');
          window.location.href = response.data.redirectUrl;
        }
      })
      .catch(err => {
        toast.error('Failed to initiate top-up');
      });
  };

  const handleCustomTopup = () => {
    const amount = parseFloat(customAmount);

    // Validation
    if (!amount || amount < 1 || amount > 50000) {
      setCustomError('Please enter an amount between ₹1 and ₹50,000');
      return;
    }

    setCustomError('');
    setShowDropdown(false);
    setCustomAmount('');

    api.post('/wallet/topup', { amount })
      .then(response => {
        if (response.data.success) {
          toast.success('Redirecting to payment...');
          window.location.href = response.data.redirectUrl;
        }
      })
      .catch(err => {
        toast.error('Failed to initiate top-up');
      });
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center space-x-2 px-2 py-1">
        <div className="w-4 h-4 border-2 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
        <span className="text-xs text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setShowDropdown(!showDropdown);
          if (!showDropdown) {
            setCustomAmount('');
            setCustomError('');
          }
        }}
        className="flex items-center space-x-2 px-3 py-2 bg-white hover:bg-gray-50 rounded-lg border border-gray-200 transition-all duration-200 hover:shadow-sm"
        title="Wallet balance"
      >
        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
        </div>
        <div className="text-left">
          <div className="text-sm font-semibold text-gray-900 leading-tight">
            ₹{balance?.balance?.toFixed(2) || '0.00'}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <>
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900">Wallet Balance</div>
              <div className="text-lg font-bold text-green-600">₹{balance?.balance?.toFixed(2) || '0.00'}</div>
            </div>

            <div className="px-4 py-3">
              <div className="text-xs text-gray-600 mb-3">Quick Add Money</div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[100, 500, 1000].map(amount => (
                  <button
                    key={amount}
                    onClick={() => handleTopup(amount)}
                    className="px-2 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors duration-200"
                  >
                    ₹{amount}
                  </button>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs text-gray-600 mb-2">Or enter custom amount</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setCustomError('');
                    }}
                    placeholder="₹"
                    min="1"
                    max="50000"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <button
                    onClick={handleCustomTopup}
                    disabled={!customAmount}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded transition-colors duration-200"
                  >
                    Add
                  </button>
                </div>
                {customError && (
                  <p className="mt-1 text-xs text-red-600">{customError}</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  toast.info('Transaction history coming soon');
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-150 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>View History</span>
              </button>
            </div>
          </div>

          {/* Click outside handler */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setShowDropdown(false);
              setCustomAmount('');
              setCustomError('');
            }}
          />
        </>
      )}
    </div>
  );
};

const WalletBalance = () => {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupError, setTopupError] = useState('');

  // Fetch wallet balance
  const fetchBalance = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get('/wallet/balance');

      if (response.data.success) {
        setBalance(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch balance');
      }
    } catch (err) {
      console.error('Error fetching wallet balance:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load wallet balance');
      toast.error('Failed to load wallet balance');
    } finally {
      setLoading(false);
    }
  };

  // Handle wallet top-up
  const handleTopup = () => {
    setShowTopupModal(true);
    setTopupAmount('');
    setTopupError('');
  };

  // Submit top-up request
  const submitTopup = async () => {
    const amount = parseFloat(topupAmount);

    // Validation
    if (!amount || amount < 1 || amount > 50000) {
      setTopupError('Please enter an amount between ₹1 and ₹50,000');
      return;
    }

    try {
      setTopupLoading(true);
      setTopupError('');

      const response = await api.post('/wallet/topup', { amount });

      if (response.data.success) {
        toast.success('Redirecting to payment...');
        window.location.href = response.data.redirectUrl;
      } else {
        throw new Error(response.data.message || 'Failed to initiate top-up');
      }
    } catch (err) {
      console.error('Error initiating top-up:', err);
      setTopupError(err.response?.data?.message || err.message || 'Failed to initiate top-up');
      toast.error('Failed to initiate top-up');
    } finally {
      setTopupLoading(false);
    }
  };

  // Close top-up modal
  const closeTopupModal = () => {
    setShowTopupModal(false);
    setTopupAmount('');
    setTopupError('');
  };

  // Format balance in INR
  const formatBalance = (amount) => {
    if (amount === null || amount === undefined) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Load balance on component mount
  useEffect(() => {
    fetchBalance();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="lg" variant="default" text="Loading wallet balance..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to Load Balance</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchBalance}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Wallet Balance</h2>
          <p className="text-sm text-gray-600">Manage your funds</p>
        </div>
        <button
          onClick={fetchBalance}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Balance Display */}
      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-gray-900 mb-2">
          {formatBalance(balance?.balance)}
        </div>
        <p className="text-sm text-gray-600 uppercase tracking-wide">
          {balance?.currency || 'INR'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleTopup}
          disabled={topupLoading}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {topupLoading ? (
            <>
              <LoadingSpinner size="sm" color="white" />
              Processing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Money
            </>
          )}
        </button>

        <button
          onClick={() => toast.info('Transaction history coming soon')}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          History
        </button>
      </div>

      {/* Additional Info */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        Funds are securely stored and can be used for booking sessions
      </div>

      {/* Top-up Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add Money to Wallet</h3>
                <button
                  onClick={closeTopupModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (₹)
                </label>
                <input
                  type="number"
                  id="amount"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="1"
                  max="50000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={topupLoading}
                />
                {topupError && (
                  <p className="mt-1 text-sm text-red-600">{topupError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={closeTopupModal}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={topupLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={submitTopup}
                  disabled={topupLoading || !topupAmount}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  {topupLoading ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      Processing...
                    </>
                  ) : (
                    'Add Money'
                  )}
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500 text-center">
                Amount must be between ₹1 and ₹50,000
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletBalance;