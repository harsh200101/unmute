import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

const MentorRescheduleRequest = () => {
  const { user, isAuthenticated, isMentor } = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams();

  // State management
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [formData, setFormData] = useState({
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Load session details
  const loadSession = async () => {
    if (!isAuthenticated || !isMentor()) return;

    setLoading(true);
    try {
      const response = await api.get(`/sessions/details/${sessionId}`);
      setSession(response.data.data.session);

      // Initialize form data
      setFormData({
        reason: ''
      });
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error(error.response?.data?.message || 'Error loading session details');
      navigate('/mentor/sessions');
    } finally {
      setLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.reason.trim()) {
      toast.error('Please provide a reason for the reschedule request');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/sessions/details/${sessionId}/reschedule-request`, {
        reason: formData.reason
      });
      toast.success('Reschedule request sent successfully! The mentee will choose a new time.');
      navigate('/mentor/sessions');
    } catch (error) {
      console.error('Failed to submit reschedule request:', error);
      toast.error(error.response?.data?.message || 'Error sending reschedule request');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Load session on mount
  useEffect(() => {
    if (isAuthenticated && isMentor()) {
      loadSession();
    }
  }, [isAuthenticated, isMentor(), sessionId]);

  // Redirect if not authenticated or not a mentor
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (!isMentor()) {
    navigate('/dashboard');
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h2>
          <button
            onClick={() => navigate('/mentor/sessions')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Request Session Reschedule</h1>
              <p className="text-gray-600 mt-1">
                Ask {session.mentee?.firstName} {session.mentee?.lastName} to reschedule this session - they will choose the new time
              </p>
            </div>
            <button
              onClick={() => navigate('/mentor/sessions')}
              className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-all duration-200"
            >
              ← Back to Sessions
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Session Info */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Current Session Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">{session.title}</h3>
              <p className="text-gray-600 text-sm mb-4">{session.description}</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-600">
                    {new Date(session.scheduledAt).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-600">
                    {new Date(session.scheduledAt).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })} • {session.durationMinutes} minutes
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Mentee Information</h4>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {session.mentee?.firstName?.charAt(0).toUpperCase() || 'S'}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {session.mentee?.firstName} {session.mentee?.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{session.mentee?.email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reschedule Request Form */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Send Reschedule Request</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Reason */}
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Reschedule *
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={4}
                value={formData.reason}
                onChange={handleInputChange}
                placeholder="Please explain why you need to reschedule this session..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                required
              />
            </div>


            {/* Important Notes */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">Important Notes</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• The mentee will receive a notification and can choose a new time or decline your request</li>
                    <li>• If the mentee chooses a new time, the session will be rescheduled automatically</li>
                    <li>• If declined, the session will be cancelled with a full refund to the mentee</li>
                    <li>• You cannot directly reschedule sessions - the mentee must choose the new time</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/mentor/sessions')}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Sending Request...
                  </>
                ) : (
                  <>
                    📅 Send Request
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MentorRescheduleRequest;