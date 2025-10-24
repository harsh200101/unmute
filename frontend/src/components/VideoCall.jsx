import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const VideoCall = ({ sessionId, onClose, onMeetingEnd }) => {
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meetingStatus, setMeetingStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]);
  const [localAudioMuted, setLocalAudioMuted] = useState(false);
  const [localVideoMuted, setLocalVideoMuted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [connectionQuality, setConnectionQuality] = useState('good');

  // Agora client and tracks
  const [agoraClient, setAgoraClient] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);

  // Refs for video containers
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});

  // Timer for meeting duration
  const timerRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    // Check if AgoraRTC is available
    console.log('🎥 [DEBUG] Checking AgoraRTC availability...');
    if (typeof AgoraRTC === 'undefined') {
      console.error('🎥 [DEBUG] AgoraRTC is not available!');
      setError('AgoraRTC SDK not loaded. Please refresh the page.');
      setLoading(false);
      return;
    }

    console.log('🎥 [DEBUG] AgoraRTC is available, version:', AgoraRTC.VERSION || 'unknown');

    initializeMeeting();
    return () => {
      cleanup();
    };
  }, [sessionId]);

  const initializeMeeting = async () => {
    try {
      console.log('🎥 [DEBUG] Starting meeting initialization for session:', sessionId);
      setLoading(true);
      setError(null);

      // Get meeting credentials from backend
      console.log('🎥 [DEBUG] Fetching meeting credentials...');
      const response = await api.get(`/meetings/${sessionId}/credentials`);
      console.log('🎥 [DEBUG] Credentials response:', response.data);

      const { credentials: creds, session, meeting } = response.data.data || response.data;
      console.log('🎥 [DEBUG] Extracted credentials:', creds);
      console.log('🎥 [DEBUG] Session info:', session);
      console.log('🎥 [DEBUG] Meeting info:', meeting);

      if (!creds || !creds.appId || !creds.channelName || !creds.token) {
        throw new Error('Invalid credentials received from server');
      }

      // Set credentials and meeting info first
      setCredentials(creds);
      setMeetingInfo({ session, meeting });
      setTimeRemaining(meeting.timeRemaining);

      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 10));

      // Initialize Agora client
      console.log('🎥 [DEBUG] Initializing Agora client...');
      console.log('🎥 [DEBUG] AgoraRTC available:', typeof AgoraRTC);
      console.log('🎥 [DEBUG] AgoraRTC.createClient available:', typeof AgoraRTC.createClient);

      const client = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      });

      setAgoraClient(client);
      console.log('🎥 [DEBUG] Agora client created successfully');

      // Set up event listeners
      client.on('user-published', handleUserPublished);
      client.on('user-unpublished', handleUserUnpublished);
      client.on('user-left', handleUserLeft);
      client.on('user-joined', handleUserJoined);
      client.on('connection-state-change', handleConnectionStateChange);
      client.on('network-quality', handleNetworkQuality);
      client.on('token-privilege-will-expire', () => {
        console.log('🎥 [DEBUG] Token privilege will expire soon');
      });
      client.on('token-privilege-did-expire', () => {
        console.log('🎥 [DEBUG] Token privilege expired');
        setError('Meeting token expired. Please refresh and try again.');
      });
      console.log('🎥 [DEBUG] Event listeners set up');

      // Join the channel
      console.log('🎥 [DEBUG] Joining channel with credentials:', {
        appId: creds.appId ? '***' + creds.appId.slice(-4) : 'NOT SET',
        channelName: creds.channelName,
        token: creds.token ? '***' + creds.token.slice(-10) : 'NOT SET',
        uid: creds.uid
      });

      try {
        await client.join(creds.appId, creds.channelName, creds.token, creds.uid);
        console.log('🎥 [DEBUG] Successfully joined Agora channel');
      } catch (joinError) {
        console.error('🎥 [DEBUG] Failed to join Agora channel:', joinError);
        console.error('🎥 [DEBUG] Join error details:', {
          message: joinError.message,
          code: joinError.code,
          name: joinError.name
        });
        throw joinError;
      }

      // Create and publish local tracks
      console.log('🎥 [DEBUG] Creating local tracks...');
      await createLocalTracks(creds);
      console.log('🎥 [DEBUG] Publishing local tracks...');
      await publishLocalTracks();
      console.log('🎥 [DEBUG] Local tracks published');

      setMeetingStatus('connected');
      console.log('🎥 [DEBUG] Meeting status set to connected');

      // Start timer for meeting duration
      startTimer(meeting.timeRemaining);
      console.log('🎥 [DEBUG] Timer started');

      // Log meeting join event
      await logMeetingEvent('user_joined');
      console.log('🎥 [DEBUG] Meeting initialization completed successfully');

    } catch (err) {
      console.error('🎥 [DEBUG] Failed to initialize meeting:', err);
      console.error('🎥 [DEBUG] Error details:', {
        message: err.message,
        stack: err.stack,
        response: err.response?.data,
        status: err.response?.status
      });
      setError(err.response?.data?.message || err.message || 'Failed to join meeting');
      setMeetingStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const createLocalTracks = async (creds) => {
    try {
      console.log('🎥 [DEBUG] Creating local tracks...');
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      console.log('🎥 [DEBUG] Local tracks created:', { audioTrack: !!audioTrack, videoTrack: !!videoTrack });

      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      // Play local video - use setTimeout to ensure DOM is ready
      if (videoTrack) {
        setTimeout(() => {
          if (localVideoRef.current) {
            console.log('🎥 [DEBUG] Playing local video in container:', localVideoRef.current);
            videoTrack.play(localVideoRef.current);
            console.log('🎥 [DEBUG] Local video playing');
          } else {
            console.log('🎥 [DEBUG] Local video container not ready, retrying...');
            setTimeout(() => {
              if (localVideoRef.current && videoTrack) {
                videoTrack.play(localVideoRef.current);
                console.log('🎥 [DEBUG] Local video playing (retry)');
              }
            }, 500);
          }
        }, 100);
      }

      // Add to participants list
      if (creds.uid) {
        const localParticipant = {
          uid: creds.uid,
          audioTrack,
          videoTrack,
          isLocal: true,
          audioMuted: false,
          videoMuted: false,
          name: 'You'
        };
        setParticipants(prev => {
          // Remove any existing local participant first
          const filtered = prev.filter(p => p.uid !== creds.uid);
          const newList = [...filtered, localParticipant];
          console.log('🎥 [DEBUG] Added/Updated local participant:', localParticipant, 'total participants:', newList.length);
          return newList;
        });
      }

    } catch (err) {
      console.error('🎥 [DEBUG] Failed to create local tracks:', err);
      toast.error('Failed to access camera/microphone. Please check permissions.');
      // Continue without local tracks - user can still join as viewer
    }
  };

  const publishLocalTracks = async () => {
    try {
      console.log('🎥 [DEBUG] Publishing local tracks...');
      console.log('🎥 [DEBUG] Client ready:', !!agoraClient, 'audioTrack:', !!localAudioTrack, 'videoTrack:', !!localVideoTrack);

      if (agoraClient) {
        const tracksToPublish = [];
        if (localAudioTrack) tracksToPublish.push(localAudioTrack);
        if (localVideoTrack) tracksToPublish.push(localVideoTrack);

        if (tracksToPublish.length > 0) {
          await agoraClient.publish(tracksToPublish);
          console.log('🎥 [DEBUG] Local tracks published successfully');
        } else {
          console.log('🎥 [DEBUG] No tracks to publish');
        }
      } else {
        console.log('🎥 [DEBUG] Cannot publish - client not ready');
      }
    } catch (err) {
      console.error('🎥 [DEBUG] Failed to publish local tracks:', err);
      toast.error('Failed to share audio/video');
    }
  };

  // Force re-render when participants change to ensure video containers are created
  useEffect(() => {
    console.log('🎥 [DEBUG] Participants updated:', participants.length, 'participants');
    console.log('🎥 [DEBUG] Current participants:', participants.map(p => ({ uid: p.uid, isLocal: p.isLocal, hasVideo: !!p.videoTrack })));
  }, [participants]);

  // Debug logging for connection state
  useEffect(() => {
    console.log('🎥 [DEBUG] Meeting status changed to:', meetingStatus);
    console.log('🎥 [DEBUG] Current participants count:', participants.length);
    console.log('🎥 [DEBUG] Local user ID:', credentials?.uid);
    console.log('🎥 [DEBUG] All participants:', participants.map(p => ({
      uid: p.uid,
      isLocal: p.isLocal,
      name: p.name,
      hasVideo: !!p.videoTrack,
      hasAudio: !!p.audioTrack
    })));
  }, [meetingStatus, participants.length, credentials?.uid]);

  const handleUserPublished = async (user, mediaType) => {
    try {
      console.log('🎥 [DEBUG] User published:', { uid: user.uid, mediaType, hasAudioTrack: !!user.audioTrack, hasVideoTrack: !!user.videoTrack });

      // Subscribe to the remote user
      await agoraClient.subscribe(user, mediaType);
      console.log('🎥 [DEBUG] Successfully subscribed to user:', user.uid, 'mediaType:', mediaType);

      // Update participants list
      if (user.uid) {
        setParticipants(prev => {
          const existing = prev.find(p => p.uid === user.uid);
          console.log('🎥 [DEBUG] Updating participants - existing:', !!existing, 'current participants:', prev.length);

          if (existing) {
            const updated = prev.map(p =>
              p.uid === user.uid
                ? {
                    ...p,
                    [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: user[mediaType === 'audio' ? 'audioTrack' : 'videoTrack']
                  }
                : p
            );
            console.log('🎥 [DEBUG] Updated existing participant:', updated.find(p => p.uid === user.uid));
            return updated;
          } else {
            const newParticipant = {
              uid: user.uid,
              audioTrack: mediaType === 'audio' ? user.audioTrack : null,
              videoTrack: mediaType === 'video' ? user.videoTrack : null,
              isLocal: false,
              audioMuted: false,
              videoMuted: false,
              name: `Participant ${user.uid}`
            };
            const newList = [...prev, newParticipant];
            console.log('🎥 [DEBUG] Added new participant:', newParticipant, 'total participants:', newList.length);
            return newList;
          }
        });
      }

      // Play remote video if available - use setTimeout to ensure DOM is updated
      if (mediaType === 'video' && user.videoTrack) {
        console.log('🎥 [DEBUG] Video track published for user:', user.uid);

        // Force a re-render to ensure video containers are created
        setParticipants(prev => [...prev]);

        setTimeout(() => {
          const container = document.getElementById(`remote-video-${user.uid}`);
          console.log('🎥 [DEBUG] Playing remote video for user:', user.uid, 'container found:', !!container);
          if (container) {
            user.videoTrack.play(container);
            console.log('🎥 [DEBUG] Remote video playing for user:', user.uid);

            // Update participant to mark video as available
            setParticipants(prev => prev.map(p =>
              p.uid === user.uid ? { ...p, videoTrack: user.videoTrack } : p
            ));
          } else {
            console.log('🎥 [DEBUG] Remote video container not found for user:', user.uid, 'retrying...');
            // Retry after a longer delay
            setTimeout(() => {
              const retryContainer = document.getElementById(`remote-video-${user.uid}`);
              if (retryContainer && user.videoTrack) {
                user.videoTrack.play(retryContainer);
                console.log('🎥 [DEBUG] Remote video playing for user (retry):', user.uid);

                // Update participant to mark video as available
                setParticipants(prev => prev.map(p =>
                  p.uid === user.uid ? { ...p, videoTrack: user.videoTrack } : p
                ));
              }
            }, 1000);
          }
        }, 200);
      }

      // Handle audio publication
      if (mediaType === 'audio' && user.audioTrack) {
        console.log('🎥 [DEBUG] Audio track published for user:', user.uid);
        user.audioTrack.play();

        // Update participant to mark audio as available
        setParticipants(prev => prev.map(p =>
          p.uid === user.uid ? { ...p, audioTrack: user.audioTrack } : p
        ));
      }

      // Play remote audio if available
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
        console.log('🎥 [DEBUG] Remote audio playing for user:', user.uid);
      }

    } catch (err) {
      console.error('🎥 [DEBUG] Failed to subscribe to user:', err);
    }
  };

  const handleUserUnpublished = (user, mediaType) => {
    if (user.uid) {
      setParticipants(prev =>
        prev.map(p =>
          p.uid === user.uid
            ? {
                ...p,
                [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: null
              }
            : p
        )
      );
    }
  };

  const handleUserJoined = (user) => {
    console.log('🎥 [DEBUG] User joined:', user.uid, 'Local user:', credentials?.uid);

    // Add user to participants list immediately when they join
    if (user.uid) {
      setParticipants(prev => {
        const existing = prev.find(p => p.uid === user.uid);
        if (!existing) {
          const newParticipant = {
            uid: user.uid,
            audioTrack: null,
            videoTrack: null,
            isLocal: user.uid === credentials?.uid,
            audioMuted: false,
            videoMuted: false,
            name: user.uid === credentials?.uid ? 'You' : `Participant ${user.uid}`
          };
          console.log('🎥 [DEBUG] Added participant on join:', newParticipant);
          return [...prev, newParticipant];
        }
        return prev;
      });
    }
  };

  const handleUserLeft = (user) => {
    console.log('🎥 [DEBUG] User left:', user.uid);
    if (user.uid) {
      setParticipants(prev => prev.filter(p => p.uid !== user.uid));

      // Remove remote video container
      const container = document.getElementById(`remote-video-${user.uid}`);
      if (container) {
        container.remove();
      }
    }
  };

  const handleConnectionStateChange = (state, reason) => {
    console.log('🎥 [DEBUG] Connection state changed:', {
      state,
      reason,
      timestamp: new Date().toISOString(),
      currentParticipants: participants.length
    });

    // Map Agora states to our status
    let newStatus = 'connecting';
    switch (state) {
      case 'CONNECTED':
        newStatus = 'connected';
        console.log('🎥 [DEBUG] Successfully connected to Agora channel');
        break;
      case 'CONNECTING':
        newStatus = 'connecting';
        console.log('🎥 [DEBUG] Connecting to Agora channel...');
        break;
      case 'RECONNECTING':
        newStatus = 'reconnecting';
        console.log('🎥 [DEBUG] Reconnecting to Agora channel...');
        break;
      case 'DISCONNECTED':
        newStatus = 'disconnected';
        if (reason === 'LEAVE') {
          console.log('🎥 [DEBUG] User left the meeting');
        } else {
          console.log('🎥 [DEBUG] Connection lost:', reason);
        }
        break;
      default:
        newStatus = state.toLowerCase();
    }

    setMeetingStatus(newStatus);
  };

  const handleNetworkQuality = (stats) => {
    const quality = stats.downlinkNetworkQuality;
    let qualityText = 'good';
    if (quality <= 2) qualityText = 'poor';
    else if (quality <= 4) qualityText = 'fair';
    else if (quality <= 6) qualityText = 'good';
    else qualityText = 'excellent';
    setConnectionQuality(qualityText);
  };

  const startTimer = (initialTime) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setTimeRemaining(initialTime);

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Meeting time is up
          handleMeetingEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 60000); // Update every minute
  };

  const handleMeetingEnd = async () => {
    try {
      console.log('🎥 [DEBUG] Meeting ending - time limit reached');
      await logMeetingEvent('meeting_ended');
      toast.success('Meeting ended automatically after time limit');
      cleanup();
      onMeetingEnd && onMeetingEnd();
    } catch (err) {
      console.error('🎥 [DEBUG] Error ending meeting:', err);
    }
  };

  const logMeetingEvent = async (eventType, eventData = {}) => {
    try {
      await api.post(`/meetings/${sessionId}/events`, {
        eventType,
        eventData: {
          ...eventData,
          participantsCount: participants.length,
          timeRemaining
        }
      });
    } catch (err) {
      console.error('Failed to log meeting event:', err);
    }
  };

  const toggleAudio = async () => {
    if (localAudioTrack) {
      try {
        if (localAudioMuted) {
          await localAudioTrack.setEnabled(true);
          setLocalAudioMuted(false);
          toast.success('Microphone unmuted');
        } else {
          await localAudioTrack.setEnabled(false);
          setLocalAudioMuted(true);
          toast.success('Microphone muted');
        }
      } catch (err) {
        console.error('Failed to toggle audio:', err);
        toast.error('Failed to toggle microphone');
      }
    } else {
      toast.error('Microphone not available');
    }
  };

  const toggleVideo = async () => {
    if (localVideoTrack) {
      try {
        if (localVideoMuted) {
          await localVideoTrack.setEnabled(true);
          setLocalVideoMuted(false);
          toast.success('Camera enabled');
        } else {
          await localVideoTrack.setEnabled(false);
          setLocalVideoMuted(true);
          toast.success('Camera disabled');
        }
      } catch (err) {
        console.error('Failed to toggle video:', err);
        toast.error('Failed to toggle camera');
      }
    } else {
      toast.error('Camera not available');
    }
  };

  const sendChatMessage = () => {
    if (newMessage.trim()) {
      const message = {
        id: Date.now(),
        text: newMessage.trim(),
        sender: credentials?.uid || 'You',
        senderName: 'You',
        timestamp: new Date()
      };

      // Add to local chat
      setChatMessages(prev => [...prev, message]);
      setNewMessage('');

      // For demo purposes, chat is local only
      // In production, implement Agora RTM or WebSocket server for real-time chat
      console.log('📨 Chat message sent (local):', message);
    }
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const leaveMeeting = async () => {
    try {
      await logMeetingEvent('user_left');
      cleanup();
      onClose && onClose();
    } catch (err) {
      console.error('Error leaving meeting:', err);
    }
  };

  const cleanup = async () => {
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop and close local tracks
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
      setLocalAudioTrack(null);
    }

    if (localVideoTrack) {
      localVideoTrack.stop();
      localVideoTrack.close();
      setLocalVideoTrack(null);
    }

    // Leave channel
    if (agoraClient) {
      await agoraClient.leave();
      setAgoraClient(null);
    }

    // Clear participants
    setParticipants([]);
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-blue-400';
      case 'fair': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Connecting to Meeting</h3>
            <p className="text-gray-600">Please wait while we set up your video call...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('🎥 [DEBUG] Rendering error state:', error);
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Failed to Join Meeting</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Don't render video interface until we have credentials
  if (!credentials) {
    console.log('🎥 [DEBUG] Waiting for credentials...');
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Preparing Meeting</h3>
            <p className="text-gray-600">Getting meeting credentials...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 text-white p-4 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${meetingStatus === 'connected' ? 'bg-green-400' : meetingStatus === 'connecting' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
            <span className="text-sm font-medium">
              {meetingStatus === 'connected' ? 'Connected' : meetingStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </span>
          </div>
          <div className="text-sm text-gray-300">
            <span className={`font-medium ${getQualityColor(connectionQuality)}`}>
              {connectionQuality.charAt(0).toUpperCase() + connectionQuality.slice(1)} Connection
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-300">
            <span className="font-medium">{participants.length}</span> participant{participants.length !== 1 ? 's' : ''}
          </div>
          {timeRemaining !== null && (
            <div className={`text-sm font-medium ${timeRemaining < 15 ? 'text-red-400' : 'text-white'}`}>
              {formatTime(timeRemaining)} remaining
            </div>
          )}
          <button
            onClick={leaveMeeting}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Leave Meeting
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video Area */}
        <div className="flex-1 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {/* Local Video */}
            {participants.find(p => p.isLocal) && (
              <div className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-blue-500">
                <div ref={localVideoRef} className="w-full h-64 bg-gray-900"></div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm flex items-center space-x-2">
                  <span>{participants.find(p => p.isLocal)?.name}</span>
                  {localAudioMuted && <span className="text-red-400">🔇</span>}
                  {!localVideoMuted && <span className="text-green-400">📹</span>}
                </div>
                <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                  {meetingInfo?.session?.title || 'Video Meeting'}
                </div>
              </div>
            )}

            {/* Remote Videos */}
            {participants.filter(p => !p.isLocal).map(participant => (
              <div key={participant.uid} className="relative bg-gray-800 rounded-lg overflow-hidden">
                <div
                  id={`remote-video-${participant.uid}`}
                  className="w-full h-64 bg-gray-900"
                  style={{ minHeight: '256px' }}
                ></div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm flex items-center space-x-2">
                  <span>{participant.name}</span>
                  {participant.audioMuted && <span className="text-red-400">🔇</span>}
                  {participant.videoTrack && <span className="text-green-400">📹</span>}
                </div>
                <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                  {meetingInfo?.session?.title || 'Video Meeting'}
                </div>
              </div>
            ))}

            {/* Empty slots for better layout */}
            {participants.length < 6 && Array.from({ length: Math.max(0, 6 - participants.length) }).map((_, index) => (
              <div key={`empty-${index}`} className="bg-gray-800 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
                <div className="text-gray-500 text-center">
                  <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">Waiting for participant...</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-medium">Chat</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.map(message => (
                <div key={message.id} className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium text-sm">{message.sender}</span>
                    <span className="text-gray-400 text-xs">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-gray-200 text-sm">{message.text}</p>
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-700">
              <div className="flex space-x-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleChatKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="flex justify-center items-center space-x-4">
          {/* Audio Control */}
          <button
            onClick={toggleAudio}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              localAudioMuted
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            {localAudioMuted ? '🔇 Unmute' : '🎤 Mute'}
          </button>

          {/* Video Control */}
          <button
            onClick={toggleVideo}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              localVideoMuted
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            {localVideoMuted ? '📷 Turn On' : '📹 Turn Off'}
          </button>

          {/* Chat Toggle */}
          <button
            onClick={() => setShowChat(!showChat)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
              showChat
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            💬 Chat {chatMessages.length > 0 && `(${chatMessages.length})`}
          </button>

          {/* Screen Share (placeholder) */}
          <button
            className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-all duration-200 opacity-50 cursor-not-allowed"
            disabled
          >
            🖥️ Share Screen
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;