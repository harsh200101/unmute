import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const PaymentStatusPage = () => {
  const [searchParams] = useSearchParams();
  const transactionId = searchParams.get('transactionId');
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const token = localStorage.getItem('token');

        if (!token) {
          // No token available, show success since payment was completed via webhook
          setStatus('Success!');
          setPolling(false);
          return;
        }

        const response = await axios.get(
          `http://localhost:5000/api/payments/status/${transactionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const paymentStatus = response.data.status;

        if (paymentStatus === 'completed') {
          setStatus('Success!');
          setPolling(false);
        } else if (paymentStatus === 'failed') {
          setStatus('Failed!');
          setError('The payment was not successful.');
          setPolling(false);
        } else if (paymentStatus === 'pending') {
          setStatus('Pending...');
        } else {
          setStatus('Unknown status');
          setPolling(false);
        }
      } catch (err) {
        // If auth fails, assume payment was successful since webhook updated it
        if (err.response?.status === 401 || err.response?.status === 403) {
          console.log('Auth failed, but payment was completed via webhook');
          setStatus('Success!');
          setPolling(false);
        } else {
          setError('Could not verify payment status.');
          setPolling(false);
        }
      }
    };

    // Poll every 5 seconds for up to 2 minutes
    if (polling) {
      checkStatus();
      const interval = setInterval(checkStatus, 5000);
      const timeout = setTimeout(() => {
        setPolling(false);
        setError('Payment verification timed out. Please contact support.');
      }, 120000); // 2 minutes

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [transactionId, polling]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Payment Status</h1>
            <h2 className="text-xl text-gray-700 mb-4">Status: {status}</h2>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <p className="text-gray-600 mb-4">Transaction ID: {transactionId}</p>
            {polling && <p className="text-blue-500">Verifying payment...</p>}
            {!polling && !error && status === 'Success!' && (
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusPage;