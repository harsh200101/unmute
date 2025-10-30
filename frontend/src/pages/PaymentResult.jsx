import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import sessionController from '../controllers/sessionController';
import { toast } from 'react-hot-toast';

const PaymentResult = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const processPaymentResult = async () => {
      try {
        setLoading(true);

        // Get PhonePe parameters from URL
        const transactionId = searchParams.get('transactionId');
        const status = searchParams.get('status');
        const sessionId = searchParams.get('sessionId');

        if (!transactionId) {
          throw new Error('Missing transaction information');
        }

        // Check payment status with backend
        const statusResponse = await fetch(`/api/payments/status/${transactionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });

        if (!statusResponse.ok) {
          throw new Error('Payment status check failed');
        }

        const statusResult = await statusResponse.json();

        // Normalize status for frontend
        const normalizedStatus = statusResult.status === 'completed' ? 'succeeded' : statusResult.status;
        setPaymentStatus(normalizedStatus);

        // If payment succeeded, fetch session details
        if (normalizedStatus === 'succeeded' && sessionId) {
          const sessionResponse = await fetch(`/api/sessions/${sessionId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
            }
          });

          if (sessionResponse.ok) {
            const sessionResult = await sessionResponse.json();
            if (sessionResult.success) {
              // Transform session data to match expected format
              const session = sessionResult.data.session;
              console.log('Session details loaded:', session);
              const transformedSession = {
                mentor_name: session.mentor?.fullName || `${session.mentor?.firstName || 'Mentor'} ${session.mentor?.lastName || 'Profile'}`,
                mentor_specialization: session.mentorBadgeLevel || 'Mentor',
                session_type: session.sessionType,
                scheduled_at: session.scheduledAt,
                duration_minutes: session.durationMinutes,
                price: session.price,
                currency: session.currency || session.payment?.currency || 'USD',
                description: session.description
              };
              console.log('Transformed session data:', transformedSession);
              setSessionData(transformedSession);
            }
          }
        }

        // Show appropriate toast message
        if (normalizedStatus === 'succeeded') {
          toast.success('Payment successful! Your session has been booked.');
        } else if (normalizedStatus === 'failed' || normalizedStatus === 'pending') {
          toast.error('Payment failed. Please try again with a different payment method.');
        }

      } catch (err) {
        console.error('Payment result error:', err);
        setError(err.message || 'Failed to verify payment');
        toast.error('Unable to verify payment status');
      } finally {
        setLoading(false);
      }
    };

    processPaymentResult();
  }, [searchParams, navigate, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="xl" variant="gradient" />
          <p className="text-gray-600 mt-4 text-lg">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Verification Error</h1>
          <p className="text-gray-600 mb-8">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/sessions')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              View My Sessions
            </button>
            <button
              onClick={() => navigate('/contact')}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Payment Success
  if (paymentStatus === 'succeeded' || paymentStatus === 'completed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Successful! 🎉</h1>
            <p className="text-xl text-gray-600">Your session has been booked successfully</p>
          </div>

          {/* Session Details Card */}
          {sessionData && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Session Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Mentor</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                      {sessionData.mentor_name?.charAt(0) || 'M'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{sessionData.mentor_name || 'Mentor'}</p>
                      <p className="text-sm text-gray-600">{sessionData.mentor_specialization}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Session Type</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {sessionData.session_type === 'video' ? '🎥' : 
                       sessionData.session_type === 'voice' ? '📞' : '💬'}
                    </span>
                    <span className="capitalize font-medium text-gray-900">
                      {sessionData.session_type} Session
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Date & Time</h3>
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">
                      {sessionData.scheduled_at && !isNaN(new Date(sessionData.scheduled_at).getTime())
                        ? new Date(sessionData.scheduled_at).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            timeZone: 'Asia/Kolkata'
                          })
                        : 'Date not available'
                      }
                    </p>
                    <p className="text-sm text-gray-600">
                      {sessionData.scheduled_at && !isNaN(new Date(sessionData.scheduled_at).getTime())
                        ? new Date(sessionData.scheduled_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: 'Asia/Kolkata'
                          })
                        : 'Time not available'
                      }
                    </p>
                    {console.log('Scheduled at value:', sessionData.scheduled_at)}
                    {console.log('Parsed date:', sessionData.scheduled_at ? new Date(sessionData.scheduled_at) : 'null')}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Duration & Cost</h3>
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">{sessionData.duration_minutes || 'N/A'} minutes</p>
                    <p className="text-lg font-bold text-green-600">
                      ₹{sessionData.price || 'N/A'}
                    </p>
                    {console.log('Duration:', sessionData.duration_minutes)}
                    {console.log('Price:', sessionData.price)}
                    {console.log('Currency:', sessionData.currency)}
                  </div>
                </div>
              </div>

              {sessionData.description && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-2">Session Notes</h3>
                  <p className="text-gray-700">{sessionData.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Next Steps */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">What's Next?</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Confirmation Email</h3>
                  <p className="text-gray-600">You'll receive a confirmation email with session details and calendar invite.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Prepare for Your Session</h3>
                  <p className="text-gray-600">Think about your goals and questions you'd like to discuss with your mentor.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-sm">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Join Your Session</h3>
                  <p className="text-gray-600">You can join 15 minutes before the scheduled time through your sessions dashboard.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/sessions')}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            >
              View My Sessions
            </button>
            <button
              onClick={() => navigate('/mentors')}
              className="px-8 py-3 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-300 transition-colors"
            >
              Book Another Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Payment Failed
  if (paymentStatus === 'requires_payment_method' || paymentStatus === 'failed' || paymentStatus === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Failed</h1>
            <p className="text-xl text-gray-600">There was an issue processing your payment</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">What happened?</h2>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-800 text-sm">
                Your payment could not be processed. This might be due to insufficient funds, 
                an expired card, or your bank declining the transaction.
              </p>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">You can try:</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Using a different payment method
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Checking your card details and billing address
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Contacting your bank to authorize the transaction
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.history.back()}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/mentors')}
              className="px-8 py-3 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl border border-gray-300 transition-colors"
            >
              Browse Mentors
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Processing Payment...</h1>
        <LoadingSpinner size="lg" variant="default" />
      </div>
    </div>
  );
};

export default PaymentResult;
