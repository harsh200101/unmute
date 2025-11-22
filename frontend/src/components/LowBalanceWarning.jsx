import React, { useState, useEffect } from 'react';

const LowBalanceWarning = ({ balance, minutesRemaining, onTopUp }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [prevBalance, setPrevBalance] = useState(balance);

  // Auto-reappear if balance gets lower
  useEffect(() => {
    if (balance < prevBalance) {
      setIsVisible(true);
    }
    setPrevBalance(balance);
  }, [balance, prevBalance]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 bg-red-600 text-white p-4 rounded-lg shadow-lg max-w-sm w-full sm:max-w-xs md:max-w-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center mb-1">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="font-bold text-sm">Low Balance Warning</span>
          </div>
          <p className="text-sm">Only {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''} remaining</p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-white hover:text-gray-200 ml-2 flex-shrink-0"
          aria-label="Dismiss warning"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <button
        onClick={onTopUp}
        className="w-full bg-white text-red-600 hover:bg-gray-100 font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Top Up Now
      </button>
    </div>
  );
};

export default LowBalanceWarning;