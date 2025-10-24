import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';
import sessionController from '../controllers/sessionController';

const MenteeRescheduleRequests = () => {
  const { user, isAuthenticated, isMentee } = useAuth();
  const navigate = useNavigate();

  // State management
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [responding, setResponding] = useState(null);

  // Load pending reschedule requests
  const loadRequests = async () => {
    if (!isAuthenticated || !isMentee()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/sessions/reschedule-requests/pending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRequests(data.data.requests || []);
      } else {
        toast.error('Failed to load reschedule requests');
      }
    } catch (error) {
      console.error('Failed to load requests:', error);
      toast.error('Error loading reschedule requests');
    } finally {
      setLoading(false);
    }
  };

  // Handle response to reschedule request
  const handleResponse = async (requestId, action, newScheduledAt = null, reason = '') => {
    setResponding(requestId);
    try {
      // For accept action, newScheduledAt is required
      if (action === 'accept' && !newScheduledAt) {
        toast.error('Please select a new time for the session.');
        return;
      }
      const response = await fetch(`/api/sessions/reschedule-requests/${requestId}/respond`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          newScheduledAt,
          reason
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Reschedule request ${action === 'accept' ? 'approved' : 'declined'} successfully`);

        // Remove the request from the list
        setRequests(prev => prev.filter(req => req.id !== requestId));

        // Refresh the main sessions list if needed
        if (window.location.pathname.includes('appointments')) {
          // Trigger a refresh of the parent component
          window.dispatchEvent(new CustomEvent('refreshSessions'));
        }

        // After successful reschedule, redirect to booking view
        if (action === 'accept') {
          navigate('/mentors'); // Redirect to the booking view (mentors page)
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to respond to request');
      }
    } catch (error) {
      console.error('Failed to respond to request:', error);
      toast.error('Error responding to reschedule request');
    } finally {
      setResponding(null);
    }
  };

  // Load requests on mount
  useEffect(() => {
    if (isAuthenticated && isMentee()) {
      loadRequests();
    }
  }, [isAuthenticated, isMentee()]);

  // Redirect if not authenticated or not a mentee
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  if (!isMentee()) {
    navigate('/dashboard');
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" />
        <span className="ml-3 text-gray-600">Loading reschedule requests...</span>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-gray-500 text-lg mb-2">No pending reschedule requests</p>
        <p className="text-gray-400 text-sm">You'll see reschedule requests from mentors here</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📅 Pending Reschedule Requests
          <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {requests.length}
          </span>
        </h2>
      </div>

      {requests.map((request) => (
        <div key={request.id} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          {/* Request Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                {request.mentor.firstName?.charAt(0).toUpperCase() || 'M'}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Reschedule Request from {request.mentor.firstName} {request.mentor.lastName}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(request.createdAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1 rounded-full">
              Pending Response
            </span>
          </div>

          {/* Session Details */}
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <h4 className="font-medium text-gray-900 mb-2">{request.sessionTitle}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Current Time:</p>
                <p className="font-medium text-gray-900">
                  {new Date(request.scheduledAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })} at {new Date(request.scheduledAt).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Duration:</p>
                <p className="font-medium text-gray-900">{request.durationMinutes} minutes</p>
              </div>
            </div>
          </div>

          {/* Reschedule Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <h4 className="font-medium text-blue-900 mb-2">Reschedule Request:</h4>
            <div className="text-sm text-blue-800">
              <p>
                {request.mentor.firstName} {request.mentor.lastName} wants to reschedule this session.
                If you accept, you'll need to choose a new time that works for both of you.
              </p>
            </div>
          </div>

          {/* Reason */}
          {request.reason && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <h4 className="font-medium text-gray-900 mb-2">Reason:</h4>
              <p className="text-sm text-gray-700">{request.reason}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/reschedule-session/${request.sessionId}`)}
              disabled={responding === request.id}
              className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              📅 Choose New Time
            </button>

            <button
              onClick={() => handleResponse(request.id, 'decline', null, 'Declined by mentee')}
              disabled={responding === request.id}
              className="flex-1 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
            >
              {responding === request.id ? (
                <>
                  <LoadingSpinner size="sm" />
                  Processing...
                </>
              ) : (
                <>
                  ❌ Decline & Cancel
                </>
              )}
            </button>
          </div>

          {/* Important Note */}
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="text-sm">
                <p className="font-medium text-yellow-900">Important:</p>
                <p className="text-yellow-800">
                  "Choose New Time" will take you to reschedule this session. "Decline & Cancel" will cancel the session with a full refund.
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MenteeRescheduleRequests;