import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const SessionCard = ({ 
  session, 
  userRole = 'mentee', 
  variant = 'default', // 'default', 'compact', 'detailed', 'upcoming'
  showActions = true,
  onJoinSession,
  onCancelSession,
  onRescheduleSession,
  onStartSession,
  onCompleteSession,
  onAddNotes,
  className = ""
}) => {
  const { user } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [sessionStatus, setSessionStatus] = useState(session.status);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Calculate time remaining for upcoming sessions
  useEffect(() => {
    if (!session.scheduled_at || sessionStatus !== 'confirmed') return;

    const updateTimeRemaining = () => {
      const now = new Date();
      const sessionTime = new Date(session.scheduled_at);
      const diff = sessionTime - now;

      if (diff <= 0) {
        setTimeRemaining('Session time has passed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else {
        setTimeRemaining(`${minutes}m`);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [session.scheduled_at, sessionStatus]);

  // Get status styling
  const getStatusStyle = (status) => {
    const statusStyles = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳' },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📅' },
      confirmed: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' },
      in_progress: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🔴' },
      completed: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '✨' },
      cancelled_by_mentee: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
      cancelled_by_mentor: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
      no_show_mentee: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻' },
      no_show_mentor: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻' },
      disputed: { bg: 'bg-red-100', text: 'text-red-800', icon: '⚠️' },
      refunded: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '💰' }
    };
    return statusStyles[status] || statusStyles.pending;
  };

  // Get session type styling
  const getSessionTypeStyle = (type) => {
    const typeStyles = {
      video: { icon: '🎥', label: 'Video Call' },
      voice: { icon: '📞', label: 'Voice Call' },
      chat: { icon: '💬', label: 'Chat Session' },
      in_person: { icon: '🤝', label: 'In Person' }
    };
    return typeStyles[type] || typeStyles.video;
  };

  // Format date and time
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  // Check if session can be joined
  const canJoinSession = () => {
    if (sessionStatus !== 'confirmed') return false;
    const now = new Date();
    const sessionTime = new Date(session.scheduled_at);
    const timeDiff = sessionTime - now;
    // Allow joining 15 minutes before and during session
    return timeDiff <= 15 * 60 * 1000 && timeDiff >= -session.duration_minutes * 60 * 1000;
  };

  // Check if session can be cancelled
  const canCancelSession = () => {
    const now = new Date();
    const sessionTime = new Date(session.scheduled_at);
    const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
    return ['pending', 'scheduled', 'confirmed'].includes(sessionStatus) && hoursUntilSession > 24;
  };

  // Handle action with loading
  const handleAction = async (actionFn, ...args) => {
    setIsActionLoading(true);
    try {
      await actionFn(...args);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsActionLoading(false);
    }
  };

  const statusStyle = getStatusStyle(sessionStatus);
  const typeStyle = getSessionTypeStyle(session.session_type);
  const dateTime = formatDateTime(session.scheduled_at);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300 overflow-hidden ${className}`}>
      {/* Header with Status */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.icon} {sessionStatus.replace(/_/g, ' ').toUpperCase()}
          </span>
          <span className="inline-flex items-center gap-1 text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
            {typeStyle.icon} {typeStyle.label}
          </span>
        </div>
        
        {/* Price */}
        {session.price && (
          <span className="text-lg font-bold text-gray-900">
            ${session.price}
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Session Title & Description */}
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {session.title || `${typeStyle.label} Session`}
          </h3>
          {session.description && (
            <p className="text-gray-600 text-sm line-clamp-2">
              {session.description}
            </p>
          )}
        </div>

        {/* Participant Info */}
        <div className="flex items-center gap-4 mb-4">
          {userRole === 'mentee' ? (
            /* Show Mentor Info */
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                {session.mentor_name?.charAt(0).toUpperCase() || 'M'}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  {session.mentor_name || 'Your Mentor'}
                </h4>
                <p className="text-sm text-gray-500">
                  {session.mentor_specialization || 'Mentor'}
                </p>
              </div>
            </div>
          ) : (
            /* Show Mentee Info */
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-semibold">
                {session.mentee_name?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  {session.mentee_name || 'Student'}
                </h4>
                <p className="text-sm text-gray-500">Mentee</p>
              </div>
            </div>
          )}
        </div>

        {/* Date, Time & Duration */}
        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">{dateTime.date}</p>
              <p className="text-xs text-gray-500">{dateTime.time}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">{session.duration_minutes} min</p>
              <p className="text-xs text-gray-500">Duration</p>
            </div>
          </div>
        </div>

        {/* Time Remaining (for confirmed upcoming sessions) */}
        {sessionStatus === 'confirmed' && timeRemaining && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">
                {timeRemaining.includes('passed') ? 'Ready to join' : `Starts in ${timeRemaining}`}
              </span>
            </div>
          </div>
        )}

        {/* Meeting Link (for confirmed sessions) */}
        {session.meeting_url && ['confirmed', 'in_progress'].includes(sessionStatus) && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-green-900">Meeting Ready</span>
              </div>
              {canJoinSession() && (
                <button
                  onClick={() => handleAction(onJoinSession, session.id, session.meeting_url)}
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isActionLoading ? <LoadingSpinner size="sm" /> : '🎥'} Join Now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notes Section */}
        {(session.mentor_notes || session.mentee_notes) && (
          <div className="mb-4">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${showNotes ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
              Session Notes
            </button>
            {showNotes && (
              <div className="mt-2 space-y-2">
                {session.mentor_notes && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs font-medium text-blue-900 mb-1">Mentor Notes:</p>
                    <p className="text-sm text-blue-800">{session.mentor_notes}</p>
                  </div>
                )}
                {session.mentee_notes && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-xs font-medium text-purple-900 mb-1">Your Notes:</p>
                    <p className="text-sm text-purple-800">{session.mentee_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex flex-wrap gap-2">
            {/* Join Session */}
            {canJoinSession() && session.meeting_url && (
              <button
                onClick={() => handleAction(onJoinSession, session.id, session.meeting_url)}
                disabled={isActionLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '🎥'} Join Session
              </button>
            )}

            {/* Start Session (Mentor only) */}
            {userRole === 'mentor' && sessionStatus === 'confirmed' && canJoinSession() && (
              <button
                onClick={() => handleAction(onStartSession, session.id)}
                disabled={isActionLoading}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '▶️'} Start Session
              </button>
            )}

            {/* Complete Session (Mentor only) */}
            {userRole === 'mentor' && sessionStatus === 'in_progress' && (
              <button
                onClick={() => handleAction(onCompleteSession, session.id)}
                disabled={isActionLoading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '✅'} Complete
              </button>
            )}

            {/* Cancel Session */}
            {canCancelSession() && (
              <button
                onClick={() => handleAction(onCancelSession, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '❌'} Cancel
              </button>
            )}

            {/* Reschedule */}
            {['pending', 'scheduled'].includes(sessionStatus) && (
              <button
                onClick={() => handleAction(onRescheduleSession, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '📅'} Reschedule
              </button>
            )}

            {/* Add Notes */}
            {sessionStatus === 'completed' && (
              <button
                onClick={() => handleAction(onAddNotes, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '📝'} Add Notes
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payment Status (if relevant) */}
      {session.payment_status && session.payment_status !== 'completed' && (
        <div className="px-4 pb-4">
          <div className={`p-3 rounded-xl text-sm ${
            session.payment_status === 'pending' ? 'bg-yellow-50 text-yellow-800' :
            session.payment_status === 'failed' ? 'bg-red-50 text-red-800' :
            'bg-gray-50 text-gray-800'
          }`}>
            Payment Status: {session.payment_status.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionCard;
