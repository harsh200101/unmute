import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import VideoCall from '../components/VideoCall';
import api from '../utils/api';
import toast from 'react-hot-toast';

const MeetingRoom = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meetingStatus, setMeetingStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);

  useEffect(() => {
    // Check if user is authenticated before proceeding
    if (!user) {
      console.log('🏠 [DEBUG] User not authenticated, redirecting to login');
      toast.error('Please log in to access this meeting');
      navigate('/login');
      return;
    }

    checkMeetingStatus();
  }, [sessionId, user, navigate]);

  const checkMeetingStatus = async () => {
    try {
      console.log('🏠 [DEBUG] Checking meeting status for session:', sessionId);
      setLoading(true);
      const response = await api.get(`/meetings/${sessionId}/status`);
      console.log('🏠 [DEBUG] Meeting status response:', response.data);
      setMeetingStatus(response.data.data);
      console.log('🏠 [DEBUG] Meeting status set successfully');
    } catch (err) {
      console.error('🏠 [DEBUG] Failed to check meeting status:', err);
      console.error('🏠 [DEBUG] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });

      // Handle authentication errors specifically
      if (err.response?.status === 401) {
        console.log('🏠 [DEBUG] Authentication required, redirecting to login');
        toast.error('Please log in to access this meeting');
        navigate('/login');
        return;
      }

      setError(err.response?.data?.message || 'Failed to load meeting status');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMeeting = () => {
    setShowVideoCall(true);
  };

  const handleLeaveMeeting = () => {
    setShowVideoCall(false);
    navigate('/sessions');
  };

  const handleMeetingEnd = () => {
    setShowVideoCall(false);
    toast.success('Meeting has ended');
    navigate('/sessions');
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-semibold">Loading Meeting...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Meeting Error</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/sessions')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Sessions
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showVideoCall) {
    return (
      <VideoCall
        sessionId={sessionId}
        onClose={handleLeaveMeeting}
        onMeetingEnd={handleMeetingEnd}
      />
    );
  }

  const { meeting, session } = meetingStatus || {};
  // Allow testing users (Harsh Gajbhiye - ID 49, manswi sahare - ID 51, new user - ID 55, test mentors - ID 68, 71) to join anytime
  const isTestingUser = user?.id === 49 || user?.id === 51 || user?.id === 55 || user?.id === 68 || user?.id === 71;
  const canJoin = meeting?.canJoin || isTestingUser;

  console.log('🏠 [DEBUG] MeetingRoom canJoin check - userId:', user?.id, 'isTestingUser:', isTestingUser, 'meeting.canJoin:', meeting?.canJoin, 'canJoin:', canJoin);
  const timeUntilStart = session?.scheduledAt ? new Date(session.scheduledAt) - new Date() : 0;
  const minutesUntilStart = Math.ceil(timeUntilStart / (1000 * 60));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6">
            <h1 className="text-2xl font-bold">{session?.title || 'Video Meeting'}</h1>
            <p className="text-blue-100 mt-1">
              {new Date(session?.scheduledAt).toLocaleString()}
            </p>
          </div>

          {/* Meeting Status */}
          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Meeting Info */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Meeting Details</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-semibold ${
                      meeting?.status === 'active' ? 'text-green-600' :
                      meeting?.status === 'scheduled' ? 'text-blue-600' :
                      'text-gray-600'
                    }`}>
                      {meeting?.status || 'Unknown'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span>{session?.durationMinutes} minutes</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Participants:</span>
                    <span>{meeting?.participantsJoined?.length || 0} joined</span>
                  </div>

                  {meeting?.timeRemaining !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Time Remaining:</span>
                      <span className={meeting.timeRemaining < 15 ? 'text-red-600 font-semibold' : ''}>
                        {formatTime(meeting.timeRemaining)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Join Status */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Join Meeting</h2>

                {!canJoin ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div>
                        <h3 className="text-yellow-800 font-medium">Not ready to join</h3>
                        <p className="text-yellow-700 text-sm mt-1">
                          {isTestingUser
                            ? 'Testing mode: You can join this meeting anytime.'
                            : minutesUntilStart > 0
                            ? `Meeting starts in ${minutesUntilStart} minutes. You can join 15 minutes early.`
                            : 'Meeting time has passed or is not available.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h3 className="text-green-800 font-medium">Ready to join</h3>
                        <p className="text-green-700 text-sm mt-1">
                          {isTestingUser
                            ? 'Testing mode: Ready to join anytime!'
                            : 'Click the button below to join the video meeting.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-blue-800 font-medium mb-2">Before joining:</h3>
              <ul className="text-blue-700 text-sm space-y-1">
                <li>• Ensure you have a stable internet connection</li>
                <li>• Test your camera and microphone</li>
                <li>• Close other applications that might use your camera</li>
                <li>• Make sure you're in a quiet, well-lit environment</li>
              </ul>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex justify-center space-x-4">
              <button
                onClick={() => navigate('/sessions')}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 font-semibold"
              >
                Back to Sessions
              </button>

              {canJoin && (
                <button
                  onClick={handleJoinMeeting}
                  className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 font-semibold"
                >
                  Join Meeting
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingRoom;