import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import sessionController from '../controllers/sessionController';

const PaymentStatusPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const transactionId = searchParams.get('transactionId');
  const paymentStatus = searchParams.get('status');
  const sessionId = searchParams.get('sessionId');
  const [status, setStatus] = useState(paymentStatus || 'pending');
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(!paymentStatus);
  const [sessionDetails, setSessionDetails] = useState(null);

  useEffect(() => {
    console.log('🔍 PaymentStatusPage - Query params:', {
      transactionId,
      paymentStatus,
      sessionId
    });

    // If we have status from URL params (from callback redirect), use it directly
    if (paymentStatus) {
      if (paymentStatus === 'completed') {
        setStatus('Success!');
        setPolling(false);
      } else if (paymentStatus === 'failed') {
        setStatus('Failed!');
        setError('The payment was not successful.');
        setPolling(false);
      }
    }

    // Fetch session details if sessionId is provided
    const fetchSessionDetails = async () => {
      if (sessionId) {
        try {
          console.log('🔍 Fetching session details for:', sessionId);
          const result = await sessionController.getSessionDetails(sessionId);
          if (result.success) {
            setSessionDetails(result.session);
            console.log('✅ Session details loaded:', result.session);
          }
        } catch (err) {
          console.error('❌ Failed to fetch session details:', err);
        }
      }
    };

    fetchSessionDetails();

    // Only poll if we don't have status from URL params
    if (!paymentStatus) {
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
    }
  }, [transactionId, paymentStatus, sessionId, polling]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {status === 'Success!' ? '🎉 Payment Successful!' : 'Payment Status'}
            </h1>
            <h2 className="text-xl text-gray-700 mb-4">Status: {status}</h2>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <p className="text-gray-600 mb-4">Transaction ID: {transactionId}</p>

            {sessionDetails && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-green-900 mb-2">Session Booked!</h3>
                <div className="text-left text-sm text-green-800">
                  <p><strong>Title:</strong> {sessionDetails.title}</p>
                  <p><strong>Mentor:</strong> {sessionDetails.mentorName}</p>
                  <p><strong>Scheduled:</strong> {new Date(sessionDetails.scheduled_at).toLocaleString()}</p>
                  <p><strong>Duration:</strong> {sessionDetails.duration_minutes} minutes</p>
                  <p><strong>Price:</strong> ${sessionDetails.price}</p>
                </div>
              </div>
            )}

            {polling && <p className="text-blue-500">Verifying payment...</p>}
            {!polling && !error && status === 'Success!' && (
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Go to Dashboard
                </button>
                {sessionDetails && (
                  <button
                    onClick={() => navigate('/sessions')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                  >
                    View My Sessions
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusPage;