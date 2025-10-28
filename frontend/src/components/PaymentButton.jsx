import React, { useState } from 'react';
import axios from 'axios';

const PaymentButton = ({ sessionId, amount, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.post(
        'http://localhost:5000/api/payments/pay',
        { sessionId, amount },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        // Redirect to PhonePe payment page
        window.location.href = response.data.redirectUrl;
      } else {
        setError(response.data.message || 'Payment initiation failed.');
        if (onError) onError(response.data.message);
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'An error occurred. Please try again.';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handlePayment}
        disabled={loading || !sessionId}
        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
      >
        {loading ? 'Processing...' : `Pay ₹${amount}`}
      </button>
      {error && <p className="text-red-500 mt-2">{error}</p>}
      {!sessionId && <p className="text-orange-500 mt-2">Session ID is required.</p>}
    </div>
  );
};

export default PaymentButton;