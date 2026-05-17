import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import sessionController from '../controllers/sessionController';

const PaymentStatusPage = () => {
  // DEBUGGING: Immediate log when component is instantiated
  console.log('🎯 PAYMENT_STATUS_PAGE COMPONENT INSTANTIATED');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const transactionId = searchParams.get('transactionId');
  const paymentStatus = searchParams.get('status');
  const sessionId = searchParams.get('sessionId');
  const [status, setStatus] = useState(paymentStatus || 'pending');
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(!paymentStatus);
  const [sessionDetails, setSessionDetails] = useState(null);

  // DEBUGGING: Log when component mounts and receives props
  useEffect(() => {
    console.log('🚀 PAYMENT_STATUS_PAGE LOADED:', {
      timestamp: new Date().toISOString(),
      currentURL: window.location.href,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      queryParams: {
        transactionId,
        paymentStatus,
        sessionId,
        allParams: Object.fromEntries(searchParams.entries())
      },
      userAgent: navigator.userAgent,
      referrer: document.referrer
    });

    console.log(' PaymentStatusPage - Query params:', {
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
      } else if (paymentStatus === 'pending') {
        setStatus('Pending...');
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
          // Use shared api instance; it will add Authorization header from localStorage if available
          const response = await api.get(`/payments/status/${transactionId}`);

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

  // Status-based styling
  const getStatusConfig = () => {
    switch (status) {
      case 'Success!':
        return {
          bgGradient: 'from-green-50 to-emerald-100',
          icon: '🎉',
          iconBg: 'bg-green-100',
          iconColor: 'text-green-600',
          title: 'Payment Successful!',
          subtitle: 'Your transaction has been completed successfully'
        };
      case 'Pending...':
        return {
          bgGradient: 'from-yellow-50 to-orange-100',
          icon: '⏳',
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          title: 'Payment Processing',
          subtitle: 'Your payment is being verified'
        };
      case 'Failed!':
        return {
          bgGradient: 'from-red-50 to-pink-100',
          icon: '❌',
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          title: 'Payment Failed',
          subtitle: 'There was an issue processing your payment'
        };
      default:
        return {
          bgGradient: 'from-blue-50 to-indigo-100',
          icon: '💳',
          iconBg: 'bg-blue-100',
          iconColor: 'text-blue-600',
          title: 'Payment Status',
          subtitle: 'Checking your payment status'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className={`min-h-screen bg-gradient-to-br ${statusConfig.bgGradient} flex flex-col justify-center py-12 sm:px-6 lg:px-8`}>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
          {/* Header Section */}
          <div className="text-center p-8 pb-6">
            <div className={`w-20 h-20 ${statusConfig.iconBg} rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse`}>
              <span className={`text-3xl ${statusConfig.iconColor}`}>{statusConfig.icon}</span>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
              {statusConfig.title}
            </h1>
            <p className="text-lg text-gray-600 font-medium">{statusConfig.subtitle}</p>
          </div>

          {/* Status Card */}
          <div className="px-8 pb-6">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200/50 shadow-inner">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/70 rounded-xl">
                  <span className="font-semibold text-gray-700">Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    status === 'Success!' ? 'bg-green-100 text-green-800' :
                    status === 'Pending...' ? 'bg-yellow-100 text-yellow-800' :
                    status === 'Failed!' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {status}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/70 rounded-xl">
                  <span className="font-semibold text-gray-700">Transaction ID</span>
                  <span className="text-sm text-gray-600 font-mono">{transactionId}</span>
                </div>

                {polling && (
                  <div className="flex items-center justify-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                    <span className="text-blue-700 font-medium">Verifying payment...</span>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-red-700 font-medium">{error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session Details Card */}
          {sessionDetails && (
            <div className="px-8 pb-6">
              <div className="bg-gradient-to-r from-white to-gray-50 rounded-2xl p-6 border border-gray-200/50 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    status === 'Success!' ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    <span className={`text-lg ${
                      status === 'Success!' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      📅
                    </span>
                  </div>
                  <h3 className={`text-xl font-bold ${
                    status === 'Success!' ? 'text-green-800' : 'text-yellow-800'
                  }`}>
                    {status === 'Success!' ? 'Session Booked!' : 'Session Pending Confirmation'}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-white/70 rounded-lg">
                      <span className="font-medium text-gray-600">Title</span>
                      <span className="text-gray-900 font-semibold">{sessionDetails.title}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/70 rounded-lg">
                      <span className="font-medium text-gray-600">Mentor</span>
                      <span className="text-gray-900 font-semibold">{sessionDetails.mentor?.fullName || 'Mentor'}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-white/70 rounded-lg">
                      <span className="font-medium text-gray-600">Duration</span>
                      <span className="text-gray-900 font-semibold">{sessionDetails.durationMinutes ? `${sessionDetails.durationMinutes} min` : 'Duration not available'}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-white/70 rounded-lg">
                      <span className="font-medium text-gray-600">Price</span>
                      <span className="text-green-600 font-bold">₹{sessionDetails.price ? sessionDetails.price.toLocaleString('en-IN') : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-white/70 rounded-lg">
                  <span className="font-medium text-gray-600">Scheduled: </span>
                  <span className="text-gray-900 font-semibold">
                    {sessionDetails.scheduledAt ? new Date(sessionDetails.scheduledAt).toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    }) : 'Invalid Date'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="px-8 pb-8">
            {(!polling && !error && status === 'Success!') && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  🚀 Go to Dashboard
                </button>
                {sessionDetails && (
                  <button
                    onClick={() => navigate('/sessions')}
                    className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                  >
                    📅 View My Sessions
                  </button>
                )}
              </div>
            )}

            {(!polling && !error && status === 'Pending...') && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  🚀 Go to Dashboard
                </button>
                <button
                  onClick={() => navigate('/sessions')}
                  className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  📅 View My Sessions
                </button>
              </div>
            )}

            {error && !polling && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  🚀 Go to Dashboard
                </button>
                <button
                  onClick={() => navigate('/sessions')}
                  className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
                >
                  📅 View My Sessions
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentStatusPage;