import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import { toast } from 'react-hot-toast';

const SessionCard = ({
  session,
  userRole = 'mentee',
  variant = 'default', // 'default', 'compact', 'detailed', 'upcoming'
  showActions = true,
  onJoinSession,
  onCancelSession,
  onRescheduleSession,
  onRespondToReschedule,
  onStartSession,
  onCompleteSession,
  onAddNotes,
  className = ""
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [sessionStatus, setSessionStatus] = useState(session.status);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewData, setReviewData] = useState({
    overallRating: 5,
    comment: ''
  });

  // Calculate time remaining for upcoming and active sessions
  useEffect(() => {
    if (!session.scheduledAt || !['confirmed', 'in_progress'].includes(sessionStatus)) return;

    const updateTimeRemaining = () => {
      const now = new Date();
      const sessionTime = new Date(session.scheduledAt);

      // Check if sessionTime is valid
      if (isNaN(sessionTime.getTime())) {
        setTimeRemaining('Invalid session time');
        return;
      }

      const diff = sessionTime - now;

      if (sessionStatus === 'in_progress') {
        // For active sessions, show remaining time (session ends at scheduled time + duration)
        const endTime = new Date(sessionTime.getTime() + (session.durationMinutes * 60 * 1000));
        const remainingDiff = endTime - now;

        if (remainingDiff <= 0) {
          setTimeRemaining('Session ending soon');
          return;
        }

        const hours = Math.floor(remainingDiff / (1000 * 60 * 60));
        const minutes = Math.floor((remainingDiff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
          setTimeRemaining(`${hours}h ${minutes}m`);
        } else {
          setTimeRemaining(`${minutes}m`);
        }
      } else {
        // For confirmed sessions, show time until start
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
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [session.scheduledAt, sessionStatus, session.durationMinutes]);

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
    if (!dateString) {
      return {
        date: 'Date not set',
        time: 'Time not set'
      };
    }

    const date = new Date(dateString);

    // Check if date is invalid
    if (isNaN(date.getTime())) {
      return {
        date: 'Invalid date',
        time: 'Invalid time'
      };
    }

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
    if (!['confirmed', 'in_progress'].includes(sessionStatus) || !session.scheduledAt) return false;

    // For in_progress sessions, allow joining anytime until completed
    if (sessionStatus === 'in_progress') return true;

    // For confirmed sessions, check time window
    const now = new Date();
    const sessionTime = new Date(session.scheduledAt);

    // Check if sessionTime is valid
    if (isNaN(sessionTime.getTime())) return false;

    const timeDiff = sessionTime - now;
    // Allow joining 15 minutes before and during session (plus 1h 15min for active sessions)
    return timeDiff <= 15 * 60 * 1000 && timeDiff >= -(75 * 60 * 1000); // 75 minutes = 1h 15min
  };

  // Check if session can be cancelled
  const canCancelSession = () => {
    if (!session.scheduledAt) return false;
    const now = new Date();
    const sessionTime = new Date(session.scheduledAt);

    // Check if sessionTime is valid
    if (isNaN(sessionTime.getTime())) return false;

    const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
    return ['pending', 'scheduled', 'confirmed'].includes(sessionStatus) && hoursUntilSession > 24;
  };

  // Check if session can be rescheduled
  const canRescheduleSession = () => {
    if (!session.scheduledAt) return false;
    const now = new Date();
    const sessionTime = new Date(session.scheduledAt);

    // Check if sessionTime is valid
    if (isNaN(sessionTime.getTime())) return false;

    const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
    return ['pending', 'scheduled', 'confirmed'].includes(sessionStatus) && hoursUntilSession > 12;
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

  // Handle review submission
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setIsActionLoading(true);

    try {
      const sessionController = (await import('../controllers/sessionController')).default;

      // Prepare simplified review data
      const simplifiedReviewData = {
        overallRating: reviewData.overallRating,
        comment: reviewData.comment
      };

      if (userRole === 'mentor') {
        await sessionController.submitMentorReview(session.id, simplifiedReviewData);
        toast.success('Mentor review submitted successfully!');
      } else {
        await sessionController.submitSessionReview(session.id, simplifiedReviewData);
        toast.success('Review submitted successfully!');
      }

      setShowReviewForm(false);
      // Refresh the page to show the new review
      window.location.reload();
    } catch (error) {
      console.error('Review submission failed:', error);
      toast.error('Failed to submit review. Please try again.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle rating change
  const handleRatingChange = (field, value) => {
    setReviewData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const statusStyle = getStatusStyle(sessionStatus);
  const typeStyle = getSessionTypeStyle(session.sessionType);
  const dateTime = formatDateTime(session.scheduledAt);

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
                {session.mentor?.firstName?.charAt(0).toUpperCase() || 'M'}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  {session.mentor?.fullName || 'Your Mentor'}
                </h4>
                <p className="text-sm text-gray-500">
                  Mentor
                </p>
              </div>
            </div>
          ) : (
            /* Show Mentee Info */
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-semibold">
                {session.mentee?.firstName?.charAt(0).toUpperCase() || 'S'}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  {session.mentee?.fullName || 'Student'}
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
              <p className="text-sm font-medium text-gray-900">{session.durationMinutes} min</p>
              <p className="text-xs text-gray-500">Duration</p>
            </div>
          </div>
        </div>

        {/* Time Remaining (for confirmed and in-progress sessions) */}
        {['confirmed', 'in_progress'].includes(sessionStatus) && timeRemaining && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-blue-900">
                {sessionStatus === 'in_progress'
                  ? `Session in progress - ${timeRemaining} remaining`
                  : timeRemaining.includes('passed') ? 'Ready to join' : `Starts in ${timeRemaining}`
                }
              </span>
            </div>
          </div>
        )}

        {/* Reschedule Request Notification (for mentees) */}
        {userRole === 'mentee' && session.rescheduleRequest && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-orange-900 mb-1">Reschedule Request</h4>
                <p className="text-sm text-orange-800 mb-3">
                  {session.mentor?.fullName} wants to reschedule this session. Would you like to accept the new time or cancel the session?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(onRespondToReschedule, session.id, { action: 'accept', newScheduledAt: session.rescheduleRequest.newScheduledAt, newDuration: session.rescheduleRequest.newDurationMinutes, timezone: session.rescheduleRequest.timezone })}
                    disabled={isActionLoading}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isActionLoading ? <LoadingSpinner size="sm" /> : '✅'} Accept
                  </button>
                  <button
                    onClick={() => handleAction(onRespondToReschedule, session.id, { action: 'decline' })}
                    disabled={isActionLoading}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isActionLoading ? <LoadingSpinner size="sm" /> : '❌'} Cancel Session
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Meeting Link (for confirmed sessions) */}
        {session.meetingUrl && ['confirmed', 'in_progress'].includes(sessionStatus) && (
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
                  onClick={() => navigate(`/meeting/${session.id}`)}
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isActionLoading ? <LoadingSpinner size="sm" /> : '🎥'} Join Now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Review Form */}
        {showReviewForm && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <form onSubmit={handleReviewSubmit}>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                {userRole === 'mentor' ? 'Review Your Mentee' : 'Review Your Mentor'}
              </h4>

              {/* Overall Rating */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Overall Rating
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRatingChange('overallRating', star)}
                      className="focus:outline-none"
                    >
                      <svg
                        className={`w-8 h-8 ${star <= reviewData.overallRating ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comment (Optional)
                </label>
                <textarea
                  value={reviewData.comment}
                  onChange={(e) => handleRatingChange('comment', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows="3"
                  placeholder={userRole === 'mentor' ? 'Share your feedback about this mentee...' : 'Share your experience with this mentor...'}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isActionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isActionLoading ? <LoadingSpinner size="sm" /> : '⭐'} Submit Review
                </button>
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Review Display */}
        {session.review && !showReviewForm && (
          <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                {/* Mentee-to-Mentor Review: Only show to the specific mentor */}
                {session.review.reviewerType === 'mentee' && userRole === 'mentor' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">Mentee Review</h4>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className={`w-4 h-4 ${i < session.review.overallRating ? 'text-yellow-400' : 'text-gray-300'}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        ))}
                        <span className="text-sm font-medium text-gray-700 ml-1">
                          {session.review.overallRating}/5
                        </span>
                      </div>
                    </div>
                    {session.review.comment && (
                      <p className="text-sm text-gray-700 italic">"{session.review.comment}"</p>
                    )}
                    <p className="text-xs text-blue-600 mt-1">This review is only visible to you (the mentor)</p>
                  </div>
                )}

                {/* Mentor-to-Mentee Review: Only show to mentors (not the specific mentee) */}
                {session.review.reviewerType === 'mentor' && userRole === 'mentor' && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">Mentor Feedback</h4>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className={`w-4 h-4 ${i < session.review.overallRating ? 'text-yellow-400' : 'text-gray-300'}`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        ))}
                        <span className="text-sm font-medium text-gray-700 ml-1">
                          {session.review.overallRating}/5
                        </span>
                      </div>
                    </div>
                    {session.review.comment && (
                      <p className="text-sm text-gray-700 italic">"{session.review.comment}"</p>
                    )}
                    <p className="text-xs text-purple-600 mt-1">This feedback is only visible to mentors</p>
                  </div>
                )}

                {/* For mentees: Show privacy notices */}
                {session.review.reviewerType === 'mentee' && userRole === 'mentee' && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Your Review</h4>
                    <p className="text-xs text-gray-500">Your review is only visible to the mentor</p>
                  </div>
                )}

                {session.review.reviewerType === 'mentor' && userRole === 'mentee' && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Mentor Feedback</h4>
                    <p className="text-xs text-gray-500">Mentor feedback is private and only visible to mentors</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notes Section */}
        {(session.mentorNotes || session.menteeNotes) && (
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
                {session.mentorNotes && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs font-medium text-blue-900 mb-1">Mentor Notes:</p>
                    <p className="text-sm text-blue-800">{session.mentorNotes}</p>
                  </div>
                )}
                {session.menteeNotes && (
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-xs font-medium text-purple-900 mb-1">Your Notes:</p>
                    <p className="text-sm text-purple-800">{session.menteeNotes}</p>
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
            {canJoinSession() && session.meetingUrl && (
              <button
                onClick={() => navigate(`/meeting/${session.id}`)}
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

            {/* Cancel Session (Mentee only) */}
            {userRole === 'mentee' && canCancelSession() && (
              <button
                onClick={() => handleAction(onCancelSession, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '❌'} Cancel
              </button>
            )}

            {/* Reschedule */}
            {canRescheduleSession() && (
              <button
                onClick={() => handleAction(onRescheduleSession, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '📅'} Reschedule
              </button>
            )}

            {/* Request Reschedule (Mentor only) */}
            {userRole === 'mentor' && ['pending', 'scheduled', 'confirmed'].includes(sessionStatus) && (
              <button
                onClick={() => handleAction(onRescheduleSession, session.id)}
                disabled={isActionLoading}
                className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '📅'} Request Reschedule
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

            {/* Review Button */}
            {sessionStatus === 'completed' && !session.review && !showReviewForm && (
              <button
                onClick={() => setShowReviewForm(true)}
                disabled={isActionLoading}
                className={`px-4 py-2 font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  userRole === 'mentor'
                    ? 'bg-green-100 hover:bg-green-200 text-green-700'
                    : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                }`}
              >
                {isActionLoading ? <LoadingSpinner size="sm" /> : '⭐'}
                {userRole === 'mentor' ? 'Review Mentee' : 'Review Mentor'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Payment Status (if relevant) */}
      {session.payment?.status && session.payment.status !== 'completed' && (
        <div className="px-4 pb-4">
          <div className={`p-3 rounded-xl text-sm ${
            session.payment.status === 'pending' ? 'bg-yellow-50 text-yellow-800' :
            session.payment.status === 'failed' ? 'bg-red-50 text-red-800' :
            'bg-gray-50 text-gray-800'
          }`}>
            Payment Status: {session.payment.status.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionCard;
