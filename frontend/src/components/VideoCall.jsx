import React, { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { RTM } from 'agora-rtm-sdk';

import api from '../utils/api';
import toast from 'react-hot-toast';

const VideoCall = ({ sessionId, onClose, onMeetingEnd }) => {
  const [credentials, setCredentials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meetingStatus, setMeetingStatus] = useState('connecting');
  const [participants, setParticipants] = useState([]); // RTC video participants only
  const [rtmParticipants, setRtmParticipants] = useState([]); // RTM chat participants only
  const [localAudioMuted, setLocalAudioMuted] = useState(false);
  const [localVideoMuted, setLocalVideoMuted] = useState(false);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [meetingInfo, setMeetingInfo] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageQueue, setMessageQueue] = useState([]); // Track message queue state
  const [connectionQuality, setConnectionQuality] = useState('good');

  // CHANGED: Use refs for SDK clients to prevent stale state in callbacks
  const agoraClientRef = useRef(null);
  const rtmClientRef = useRef(null);
  const rtmChannelRef = useRef(null);
  const isInitializingRef = useRef(false);
  const isCleaningUpRef = useRef(false);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);

  // Refs for video containers
  const localVideoRef = useRef(null);

  // Timer for meeting duration
  const timerRef = useRef(null);
  const chatInputRef = useRef(null);

  // Track if component is mounted to prevent stale closure issues
  const isMountedRef = useRef(true);

  // ENHANCED: RTM Initialization Function with Comprehensive Debugging
  const initializeRtm = useCallback(async (creds) => {
    const debugLog = (message, data = null, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'RTM_INIT',
        message,
        data,
        level,
        sessionId,
        uid: creds?.uid
      };

      if (level === 'error') {
        console.error(`📨 [${timestamp}] RTM_INIT ERROR:`, message, data);
      } else if (level === 'warn') {
        console.warn(`📨 [${timestamp}] RTM_INIT WARN:`, message, data);
      } else {
        console.log(`📨 [${timestamp}] RTM_INIT:`, message, data);
      }

      // Store debug logs for potential export
      if (!window.rtmDebugLogs) window.rtmDebugLogs = [];
      window.rtmDebugLogs.push(logEntry);
    };

    try {
      debugLog('Starting RTM client initialization', {
        appId: creds.appId ? '***' + creds.appId.slice(-4) : 'MISSING',
        channelName: creds.channelName,
        uid: creds.uid,
        rtmTokenLength: creds.rtmToken ? creds.rtmToken.length : 0,
        hasRtmToken: !!creds.rtmToken
      });

      // Validate credentials
      if (!creds.appId || !creds.channelName || !creds.rtmToken) {
        const missing = [];
        if (!creds.appId) missing.push('appId');
        if (!creds.channelName) missing.push('channelName');
        if (!creds.rtmToken) missing.push('rtmToken');

        debugLog('RTM credentials validation failed', { missingFields: missing }, 'error');
        throw new Error(`Missing RTM credentials: ${missing.join(', ')}`);
      }

      const rtmUid = creds.uid.toString();
      debugLog('Creating RTM client instance', { rtmUid });

      const rtm = new RTM(creds.appId, creds.uid.toString());
      debugLog('RTM client instance created successfully');

      // Enhanced connection state listener
      rtm.on('ConnectionStateChanged', (newState, reason) => {
        const stateData = {
          newState,
          reason,
          timestamp: new Date().toISOString(),
          clientReady: !!rtmClientRef.current,
          channelReady: !!rtmChannelRef.current
        };

        debugLog('RTM Connection State Changed', stateData);

        if (newState === 'ABORTED') {
          debugLog('RTM connection aborted - potential network issue', stateData, 'error');
          toast.error('Chat connection lost. Please refresh.');
        } else if (newState === 'CONNECTED') {
          debugLog('RTM connection established successfully', stateData);
        } else if (newState === 'CONNECTING') {
          debugLog('RTM attempting to connect', stateData);
        } else if (newState === 'DISCONNECTED') {
          debugLog('RTM disconnected', stateData, 'warn');
        }
      });

      // Enhanced message queue monitoring with state integration
      const addToQueue = (message) => {
        setMessageQueue(prev => {
          const newQueue = [...prev, { ...message, queuedAt: new Date() }];
          debugLog('Message added to RTM queue', {
            queueLength: newQueue.length,
            messageType: message.type || 'unknown',
            messageId: message.id
          });
          return newQueue;
        });
      };

      const clearQueue = () => {
        setMessageQueue(prev => {
          const clearedCount = prev.length;
          debugLog('RTM message queue cleared', { clearedCount });
          return [];
        });
      };

      const removeFromQueue = (messageId) => {
        setMessageQueue(prev => {
          const filtered = prev.filter(m => m.id !== messageId);
          const removed = prev.length - filtered.length;
          if (removed > 0) {
            debugLog('Message removed from RTM queue', { messageId, removed });
          }
          return filtered;
        });
      };

      // Attempt RTM login with retry logic
      let loginAttempts = 0;
      const maxLoginAttempts = 3;

      while (loginAttempts < maxLoginAttempts) {
        try {
          loginAttempts++;
          debugLog(`RTM login attempt ${loginAttempts}/${maxLoginAttempts}`, {
            tokenLength: creds.rtmToken.length,
            uid: rtmUid
          });

          await rtm.login({ token: creds.rtmToken, uid: rtmUid });
          debugLog('RTM Login successful', { attempts: loginAttempts });
          break;
        } catch (loginErr) {
          debugLog(`RTM login attempt ${loginAttempts} failed`, {
            error: loginErr.message,
            code: loginErr.code,
            willRetry: loginAttempts < maxLoginAttempts
          }, 'warn');

          if (loginAttempts >= maxLoginAttempts) {
            throw new Error(`RTM login failed after ${maxLoginAttempts} attempts: ${loginErr.message}`);
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * loginAttempts));
        }
      }

      rtmClientRef.current = rtm;
      debugLog('RTM client stored in ref', { clientReady: true });

      // ==========================================================
      // FIX 4: Use `subscribe` instead of `createChannel` and `join`
      // ==========================================================

      debugLog('Subscribing to RTM channel (v2.x)', { channelName: creds.channelName });

      await rtm.subscribe(creds.channelName);
      debugLog('RTM Channel subscribed successfully (v2.x)', { channelName: creds.channelName });

      // We no longer need rtmChannelRef, the client handles everything

      // ==========================================================
      // FIX 2: Add global event listeners (v2.x style) with enhancements
      // ==========================================================

      // Listen for 'message' (replaces 'ChannelMessage')
      rtm.addEventListener('message', (eventArgs) => {
        debugLog('RTM Message (v2.x) received', eventArgs);

        // In v2.x, the message payload is in `eventArgs.message`
        // and the sender is in `eventArgs.publisher`
        const messageText = eventArgs.message;
        const memberId = eventArgs.publisher;
        const localUid = creds.uid.toString(); // Get local UID from function's scope

        // ==========================================================
        // FIX: Ignore messages sent by the local user (echo)
        // ==========================================================
        if (memberId === localUid) {
          debugLog('Ignoring RTM message echo from local user (v2.x)', {
            memberId,
            localUid
          }, 'warn');
          return; // Don't process the echo
        }
        // ==========================================================

        // Check for empty messages
        if (!messageText || messageText.trim() === '') {
          debugLog('Empty message received and discarded (v2.x)', {
            memberId,
            messageLength: messageText ? messageText.length : 0,
            suggestion: 'Check sender client for message validation issues'
          }, 'warn');

          setMessageQueue(prev => [...prev, {
            type: 'empty_message_received',
            memberId,
            timestamp: new Date(),
            discarded: true
          }]);
          return;
        }

        setRtmParticipants(prevParticipants => {
           const sender = prevParticipants.find(p => p.uid.toString() === memberId);
           const senderName = sender ? sender.name : `Participant ${memberId}`;

           // Check for duplicate messages
           const isDuplicate = chatMessages.some(m =>
             m.text === messageText &&
             m.sender === memberId &&
             Math.abs(new Date() - m.timestamp) < 5000
           );

           if (isDuplicate) {
             debugLog('Duplicate message detected and discarded (v2.x)', {
               text: messageText.substring(0, 50),
               memberId,
               suggestion: 'Possible message retry or network duplication'
             }, 'warn');

             setMessageQueue(prev => [...prev, {
               type: 'duplicate_message_discarded',
               memberId,
               text: messageText,
               timestamp: new Date()
             }]);
             return prevParticipants;
           }

           // Enhanced: Add to chat messages with proper structure
           const newMessage = {
             id: Date.now() + Math.random(),
             text: messageText,
             sender: memberId,
             senderName,
             timestamp: new Date(),
             status: 'received',
             receivedAt: new Date()
           };

           debugLog('Adding message to chat state (v2.x)', {
             senderName,
             messageLength: messageText.length,
             currentChatCount: chatMessages.length,
             messageId: newMessage.id
           });

           setChatMessages(prevChat => {
             const newChat = [...prevChat, newMessage];
             debugLog('Chat messages updated (v2.x)', {
               previousCount: prevChat.length,
               newCount: newChat.length
             });
             return newChat;
           });

           // Track received messages
           setMessageQueue(prev => [...prev, {
             type: 'message_received',
             messageId: newMessage.id,
             memberId,
             textLength: messageText.length,
             timestamp: new Date()
           }]);

           return prevParticipants;
         });
      });

      // Listen for 'presence' (replaces 'MemberJoined' / 'MemberLeft') with participant list management
      rtm.addEventListener('presence', (eventArgs) => {
        debugLog('RTM Presence (v2.x) event', eventArgs);

        setRtmParticipants(prevParticipants => {
          let updatedParticipants = [...prevParticipants];

          if (eventArgs.eventType === 'REMOTE_JOIN') {
            const existing = updatedParticipants.find(p => p.uid.toString() === eventArgs.publisher);
            if (!existing) {
              const newParticipant = {
                uid: eventArgs.publisher,
                name: `Participant ${eventArgs.publisher}`,
                joinedAt: new Date()
              };
              updatedParticipants.push(newParticipant);
              debugLog('Participant joined (v2.x)', { uid: eventArgs.publisher });
            }
          } else if (eventArgs.eventType === 'REMOTE_LEAVE') {
            const beforeCount = updatedParticipants.length;
            updatedParticipants = updatedParticipants.filter(p => p.uid.toString() !== eventArgs.publisher);
            const removed = beforeCount - updatedParticipants.length;
            if (removed > 0) {
              debugLog('Participant left (v2.x)', { uid: eventArgs.publisher, removed });
            }
          } else if (eventArgs.eventType === 'SNAPSHOT') {
            // Handle initial snapshot of participants
            if (eventArgs.states && Array.isArray(eventArgs.states)) {
              updatedParticipants = eventArgs.states.map(state => ({
                uid: state.userId,
                name: `Participant ${state.userId}`,
                joinedAt: new Date()
              }));
              debugLog('Presence snapshot loaded (v2.x)', { count: updatedParticipants.length });
            }
          }

          return updatedParticipants;
        });
      });

      debugLog('RTM initialization completed successfully', {
        clientReady: true,
        channelReady: true,
        messageQueueLength: messageQueue.length
      });

      // Conditional breakpoint for debugging
      if (window.location.search.includes('debug=rtm')) {
        debugger; // Conditional breakpoint
        console.log('RTM Debug Breakpoint: Initialization complete');
      }

    } catch (rtmErr) {
      debugLog('RTM Initialization failed', {
        error: rtmErr.message,
        code: rtmErr.code,
        stack: rtmErr.stack,
        credentials: {
          hasAppId: !!creds?.appId,
          hasChannelName: !!creds?.channelName,
          hasRtmToken: !!creds?.rtmToken,
          uid: creds?.uid
        }
      }, 'error');

      // Provide specific error suggestions
      if (rtmErr.message.includes('token')) {
        debugLog('Suggestion: Check RTM token validity and expiration', {}, 'warn');
      } else if (rtmErr.message.includes('network') || rtmErr.message.includes('connection')) {
        debugLog('Suggestion: Check network connectivity and firewall settings', {}, 'warn');
      } else if (rtmErr.message.includes('permission') || rtmErr.message.includes('auth')) {
        debugLog('Suggestion: Verify Agora app credentials and permissions', {}, 'warn');
      }

      toast.error(`Chat failed to connect: ${rtmErr.message}`);
    }
  }, []); // Keep dependencies minimal

  const createLocalTracks = useCallback(async (creds) => {
    try {
      console.log('🎥 Creating local tracks...');
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      console.log('🎥 Local tracks created:', { audioTrack: !!audioTrack, videoTrack: !!videoTrack });

      // Store in refs to avoid state dependency issues
      localAudioTrackRef.current = audioTrack;
      localVideoTrackRef.current = videoTrack;

      // Update state for UI
      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      // Play local video - ensure DOM is ready
      if (videoTrack) {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (localVideoRef.current) {
              console.log('🎥 Playing local video in container:', localVideoRef.current);
              videoTrack.play(localVideoRef.current);
              console.log('🎥 Local video playing');
            } else {
              console.log('🎥 Local video container not ready, retrying...');
              // Retry multiple times with increasing delays
              let retryCount = 0;
              const maxRetries = 5;
              const retryPlay = () => {
                if (retryCount >= maxRetries) {
                  console.error('🎥 Failed to play local video after', maxRetries, 'retries');
                  return;
                }
                setTimeout(() => {
                  if (localVideoRef.current && videoTrack) {
                    console.log('🎥 Local video playing (retry', retryCount + 1, ')');
                    videoTrack.play(localVideoRef.current);
                  } else {
                    retryCount++;
                    retryPlay();
                  }
                }, 200 * (retryCount + 1)); // Increasing delay: 200ms, 400ms, 600ms, etc.
              };
              retryPlay();
            }
          }, 50); // Initial delay to ensure state updates
        });
      }

      // Add to participants list
      if (creds.uid) {
        const localParticipant = {
          uid: creds.uid.toString(),
          audioTrack,
          videoTrack,
          isLocal: true,
          audioMuted: false,
          videoMuted: false,
          name: 'You'
        };
        setParticipants(prev => {
          // Remove any existing local participant first
          const filtered = prev.filter(p => p.uid !== creds.uid.toString());
          const newList = [...filtered, localParticipant];
          console.log('🎥 Added/Updated local participant:', localParticipant, 'total participants:', newList.length);
          return newList;
        });

        // Force a re-render to ensure video container is mounted
        setTimeout(() => {
          setParticipants(prev => [...prev]);
        }, 10);
      }

      // CHANGED: Return the tracks to be used by the publish function
      return [audioTrack, videoTrack];

    } catch (err) {
      console.error('🎥 Failed to create local tracks:', err);
      toast.error('Failed to access camera/microphone. Please check permissions.');
      // Clear refs on failure
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      return []; // CHANGED: Return empty array on failure
    }
  }, []);

  // CHANGED: Function now accepts tracks as an argument
  const publishLocalTracks = async (tracksToPublish) => {
    try {
      console.log('🎥 Publishing local tracks...');
      const client = agoraClientRef.current; // Get client from ref

      // CHANGED: Use client from ref and tracks from argument
      if (client && tracksToPublish && tracksToPublish.length > 0) {
        const validTracks = tracksToPublish.filter(t => t); // Filter out any null tracks
        if (validTracks.length > 0) {
          await client.publish(validTracks);
          console.log('🎥 Local tracks published successfully');
        } else {
          console.log('🎥 No valid tracks to publish');
        }
      } else {
        console.log('🎥 Cannot publish - client not ready or no tracks provided');
      }
    } catch (err) {
      console.error('🎥 Failed to publish local tracks:', err);
      toast.error('Failed to share audio/video');
    }
  };

  // Wrapped in useCallback to satisfy the linter
  const startTimer = useCallback((initialTime) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setTimeRemaining(initialTime);

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Meeting time is up
          // Don't call handleMeetingEnd here to avoid infinite loop
          return 0;
        }
        return prev - 1;
      });
    }, 60000); // Update every minute
  }, []);

  const logMeetingEvent = useCallback(async (eventType, eventData = {}) => {
    try {
      await api.post(`/meetings/${sessionId}/events`, {
        eventType,
        eventData: {
          ...eventData,
          rtcParticipantsCount: participants.length,
          rtmParticipantsCount: rtmParticipants.length,
          timeRemaining
        }
      });
    } catch (err) {
      console.error('Failed to log meeting event:', err);
    }
  }, [participants.length, rtmParticipants.length, timeRemaining]);

  const cleanup = useCallback(async () => {
    if (isCleaningUpRef.current) {
      console.log('🎥 Already cleaning up, skipping...');
      return;
    }

    isCleaningUpRef.current = true;

    try {
      console.log('🎥 Cleaning up meeting...');
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop and close local tracks
      // Use refs to avoid dependency issues
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
        setLocalAudioTrack(null);
      }

      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current.close();
        localVideoTrackRef.current = null;
        setLocalVideoTrack(null);
      }

      // ==========================================================
      // FIX 7: Use `unsubscribe` instead of `leave`
      // ==========================================================
      try {
        // OLD v1.x call:
        // if (rtmChannelRef.current) {
        //   await rtmChannelRef.current.leave();
        //   console.log('📨 RTM Channel left');
        // }

        // NEW v2.x call:
        if (rtmClientRef.current && credentials) { // Need credentials to know which channel to unsub from
          await rtmClientRef.current.unsubscribe(credentials.channelName);
          console.log('📨 RTM Channel unsubscribed (v2.x)');
        }

        if (rtmClientRef.current) {
          await rtmClientRef.current.logout();
          console.log('📨 RTM Client logged out (v2.x)');
        }
      } catch (rtmErr) {
        console.error('📨 RTM cleanup failed (v2.x):', rtmErr);
      } finally {
        rtmClientRef.current = null;
        rtmChannelRef.current = null; // This ref is no longer used, but good to null out
        setMessageQueue([]); // Clear any pending messages
      }

      // Leave RTC channel
      try {
        if (agoraClientRef.current) {
          await agoraClientRef.current.leave();
          console.log('🎥 RTC Client left');
        }
      } catch (rtcErr) {
        console.error('🎥 RTC cleanup failed:', rtcErr);
      } finally {
        agoraClientRef.current = null;
      }

      // Clear participants
      setParticipants([]);
      setRtmParticipants([]);
      console.log('🎥 Cleanup complete');
    } finally {
      isCleaningUpRef.current = false;
    }
  }, []); // Remove state dependencies

  const handleMeetingEnd = useCallback(async () => {
    try {
      console.log('🎥 Meeting ending - time limit reached');
      await logMeetingEvent('meeting_ended');
      toast.success('Meeting ended automatically after time limit');
      await cleanup(); // Await cleanup
      onMeetingEnd && onMeetingEnd();
    } catch (err) {
      console.error('🎥 Error ending meeting:', err);
    }
  }, [logMeetingEvent, cleanup, onMeetingEnd]);

  // Re-link startTimer to the memoized handleMeetingEnd
  useEffect(() => {
    if (timeRemaining === 0 && timeRemaining !== null) {
      handleMeetingEnd();
    }
  }, [timeRemaining, handleMeetingEnd]);

  // ENHANCED: Main initialization logic with comprehensive state dumps and logging
  const initializeMeeting = useCallback(async () => {
    const debugLog = (message, data = null, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'MEETING_INIT',
        message,
        data,
        level,
        sessionId
      };

      if (level === 'error') {
        console.error(`🎥 [${timestamp}] MEETING_INIT ERROR:`, message, data);
      } else if (level === 'warn') {
        console.warn(`🎥 [${timestamp}] MEETING_INIT WARN:`, message, data);
      } else {
        console.log(`🎥 [${timestamp}] MEETING_INIT:`, message, data);
      }

      // Store debug logs for potential export
      if (!window.meetingDebugLogs) window.meetingDebugLogs = [];
      window.meetingDebugLogs.push(logEntry);
    };

    // State dump function
    const dumpState = (context) => {
      const stateSnapshot = {
        loading,
        error,
        meetingStatus,
        participantsCount: participants.length,
        rtmParticipantsCount: rtmParticipants.length,
        credentialsSet: !!credentials,
        localAudioMuted,
        localVideoMuted,
        localAudioTrack: !!localAudioTrack,
        localVideoTrack: !!localVideoTrack,
        showChat,
        chatMessagesCount: chatMessages.length,
        timeRemaining,
        connectionQuality,
        isInitializing: isInitializingRef.current,
        isCleaningUp: isCleaningUpRef.current,
        agoraClientReady: !!agoraClientRef.current,
        rtmClientReady: !!rtmClientRef.current,
        rtmChannelReady: !!rtmChannelRef.current,
        context
      };

      debugLog('State dump', stateSnapshot);
      return stateSnapshot;
    };

    if (isInitializingRef.current) {
      debugLog('Already initializing, skipping...', dumpState('duplicate_init_check'));
      return;
    }

    isInitializingRef.current = true;
    dumpState('init_start');

    try {
      debugLog('Starting meeting initialization', { sessionId });
      setLoading(true);
      setError(null);

      // API call with enhanced error handling
      debugLog('Fetching meeting credentials from API');
      const response = await api.get(`/meetings/${sessionId}/credentials`);
      debugLog('Credentials API response received', {
        status: response.status,
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      });

      const { credentials: creds, session, meeting } = response.data.data || response.data;
      debugLog('Extracted credentials from response', {
        hasCredentials: !!creds,
        appId: creds?.appId ? '***' + creds.appId.slice(-4) : 'MISSING',
        channelName: creds?.channelName,
        hasToken: !!creds?.token,
        hasRtmToken: !!creds?.rtmToken,
        uid: creds?.uid,
        tokenLength: creds?.token?.length,
        rtmTokenLength: creds?.rtmToken?.length
      });

      // Validate credentials comprehensively
      const missingCreds = [];
      if (!creds) missingCreds.push('credentials object');
      else {
        if (!creds.appId) missingCreds.push('appId');
        if (!creds.channelName) missingCreds.push('channelName');
        if (!creds.token) missingCreds.push('token');
        if (!creds.rtmToken) missingCreds.push('rtmToken');
        if (!creds.uid) missingCreds.push('uid');
      }

      if (missingCreds.length > 0) {
        debugLog('Credential validation failed', { missingCreds }, 'error');
        throw new Error(`Invalid credentials received from server: missing ${missingCreds.join(', ')}`);
      }

      setCredentials(creds);
      setMeetingInfo({ session, meeting });
      setTimeRemaining(meeting.timeRemaining);
      dumpState('credentials_set');

      await new Promise(resolve => setTimeout(resolve, 10));

      debugLog('Creating Agora RTC client');
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;
      debugLog('Agora RTC client created successfully');

      // Enhanced event listeners with logging
      client.on('user-published', (user, mediaType) => {
        debugLog('RTC user-published event', { uid: user.uid, mediaType });
        handleUserPublished(user, mediaType);
      });
      client.on('user-unpublished', (user, mediaType) => {
        debugLog('RTC user-unpublished event', { uid: user.uid, mediaType });
        handleUserUnpublished(user, mediaType);
      });
      client.on('user-left', (user) => {
        debugLog('RTC user-left event', { uid: user.uid });
        handleUserLeft(user);
      });
      client.on('user-joined', (user) => {
        debugLog('RTC user-joined event', { uid: user.uid });
        handleUserJoined(user, creds.uid);
      });
      client.on('connection-state-change', (state, reason) => {
        debugLog('RTC connection-state-change event', { state, reason });
        handleConnectionStateChange(state, reason);
      });
      client.on('network-quality', (stats) => {
        debugLog('RTC network-quality event', stats);
        handleNetworkQuality(stats);
      });

      client.on('token-privilege-will-expire', () => {
        debugLog('RTC token privilege will expire soon', {}, 'warn');
      });
      client.on('token-privilege-did-expire', () => {
        debugLog('RTC token privilege expired', {}, 'error');
        setError('Meeting token expired. Please refresh and try again.');
      });

      debugLog('RTC event listeners set up');

      debugLog('Joining RTC channel', {
        appId: creds.appId ? '***' + creds.appId.slice(-4) : 'NOT SET',
        channelName: creds.channelName,
        tokenLength: creds.token ? creds.token.length : 0,
        uid: creds.uid
      });

      await client.join(creds.appId, creds.channelName, creds.token, creds.uid);
      debugLog('Successfully joined Agora RTC channel');
      dumpState('rtc_joined');

      await initializeRtm(creds);
      dumpState('rtm_initialized');

      debugLog('Creating local tracks');
      const localTracks = await createLocalTracks(creds);
      dumpState('tracks_created');

      debugLog('Publishing local tracks');
      await publishLocalTracks(localTracks);
      debugLog('Local tracks published');
      dumpState('tracks_published');

      setMeetingStatus('connected');
      debugLog('Meeting status set to connected');

      startTimer(meeting.timeRemaining);
      debugLog('Timer started', { timeRemaining: meeting.timeRemaining });

      await logMeetingEvent('user_joined');
      debugLog('Meeting initialization completed successfully');
      dumpState('init_complete');

      // Conditional breakpoint for debugging
      if (window.location.search.includes('debug=meeting')) {
        debugger; // Conditional breakpoint
        console.log('Meeting Debug Breakpoint: Initialization complete');
      }

    } catch (err) {
      debugLog('Failed to initialize meeting', {
        error: err.message,
        stack: err.stack,
        response: err.response?.data,
        status: err.response?.status,
        code: err.code
      }, 'error');

      dumpState('init_failed');

      // Enhanced error categorization and suggestions
      let errorMessage = 'Failed to join meeting';
      let suggestion = '';

      if (err.message.includes('credentials') || err.message.includes('token')) {
        errorMessage = 'Authentication failed';
        suggestion = 'Please refresh the page and try again. If the issue persists, contact support.';
        debugLog('Authentication failure detected', {}, 'error');
      } else if (err.message.includes('network') || err.response?.status >= 500) {
        errorMessage = 'Network or server error';
        suggestion = 'Check your internet connection and try again in a few moments.';
        debugLog('Network/server error detected', {}, 'error');
      } else if (err.response?.status === 403) {
        errorMessage = 'Access denied';
        suggestion = 'You may not have permission to join this meeting.';
        debugLog('Access denied error detected', {}, 'error');
      } else if (err.response?.status === 404) {
        errorMessage = 'Meeting not found';
        suggestion = 'The meeting may have ended or the link may be incorrect.';
        debugLog('Meeting not found error detected', {}, 'error');
      }

      setError(`${errorMessage}${suggestion ? ` - ${suggestion}` : ''}`);
      setMeetingStatus('error');
    } finally {
      setLoading(false);
      isInitializingRef.current = false;
      dumpState('init_cleanup');
    }
  }, [sessionId]); // Only depend on sessionId

  // ENHANCED: Main useEffect hook with comprehensive debugging and network failure detection
  useEffect(() => {
    const debugLog = (message, data = null, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'USE_EFFECT',
        message,
        data,
        level,
        sessionId
      };

      if (level === 'error') {
        console.error(`⚡ [${timestamp}] USE_EFFECT ERROR:`, message, data);
      } else if (level === 'warn') {
        console.warn(`⚡ [${timestamp}] USE_EFFECT WARN:`, message, data);
      } else {
        console.log(`⚡ [${timestamp}] USE_EFFECT:`, message, data);
      }

      // Store debug logs for potential export
      if (!window.effectDebugLogs) window.effectDebugLogs = [];
      window.effectDebugLogs.push(logEntry);
    };

    debugLog('Component mounted, checking Agora SDK availability', {
      agoraRTCVersion: AgoraRTC.VERSION,
      agoraRTMAvailable: typeof RTM !== 'undefined',
      sessionId,
      userAgent: navigator.userAgent,
      url: window.location.href
    });

    // Check for debug flags in URL
    const urlParams = new URLSearchParams(window.location.search);
    const debugFlags = {
      rtm: urlParams.has('debug') && urlParams.get('debug').includes('rtm'),
      chat: urlParams.has('debug') && urlParams.get('debug').includes('chat'),
      meeting: urlParams.has('debug') && urlParams.get('debug').includes('meeting'),
      connection: urlParams.has('debug') && urlParams.get('debug').includes('connection'),
      all: urlParams.has('debug') && urlParams.get('debug') === 'all'
    };

    if (Object.values(debugFlags).some(flag => flag)) {
      debugLog('Debug mode enabled', debugFlags, 'warn');
      console.warn('🎯 Debug mode active. Check console for detailed logs.');
      console.warn('🎯 Available debug logs: window.rtmDebugLogs, window.chatDebugLogs, window.meetingDebugLogs, window.connectionDebugLogs, window.effectDebugLogs');
    }

    // Enhanced browser compatibility check with specific failure suggestions
    const browserSupport = {
      webRTC: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      webSockets: typeof WebSocket !== 'undefined',
      promises: typeof Promise !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      userAgent: navigator.userAgent,
      browserName: (() => {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return 'Unknown';
      })()
    };

    debugLog('Browser compatibility check', browserSupport);

    if (!browserSupport.webRTC) {
      const suggestion = browserSupport.browserName === 'Unknown'
        ? 'Please use a modern browser like Chrome, Firefox, or Safari.'
        : `Please update ${browserSupport.browserName} or switch to Chrome/Firefox for video calls.`;

      debugLog('WebRTC not supported', { suggestion }, 'error');
      setError(`Your browser does not support video calls. ${suggestion}`);
      setLoading(false);
      return;
    }

    // Enhanced network connectivity check with detailed diagnostics
    const networkStatus = {
      online: navigator.onLine,
      connection: navigator.connection || navigator.mozConnection || navigator.webkitConnection,
      effectiveType: navigator.connection?.effectiveType,
      downlink: navigator.connection?.downlink,
      rtt: navigator.connection?.rtt
    };

    debugLog('Network connectivity check', networkStatus);

    if (!networkStatus.online) {
      debugLog('No network connectivity detected', networkStatus, 'error');
      setError('No internet connection detected. Please check your network and refresh the page.');
      setLoading(false);
      return;
    }

    if (networkStatus.effectiveType === 'slow-2g' || networkStatus.effectiveType === '2g') {
      debugLog('Slow network detected', networkStatus, 'warn');
      toast.warn('Slow internet connection detected. Video quality may be affected.');
    }

    // Add comprehensive online/offline event listeners with recovery suggestions
    const handleOnline = () => {
      // Check if component is still mounted before proceeding
      if (!isMountedRef.current) {
        debugLog('Ignoring online event - component unmounted', {}, 'warn');
        return;
      }

      debugLog('Network came back online', {
        timestamp: new Date().toISOString(),
        wasOffline: true,
        rtmNeedsReconnect: !rtmClientRef.current,
        rtcNeedsReconnect: !agoraClientRef.current,
        currentRtcParticipants: participants.length,
        currentRtmParticipants: rtmParticipants.length
      });

      toast.success('Internet connection restored');

      // Suggest reconnection if services were disconnected
      if (!rtmClientRef.current || !agoraClientRef.current) {
        setTimeout(() => {
          // Double-check component is still mounted before showing toast
          if (!isMountedRef.current) return;

          toast.info('Reconnecting to meeting services...', { duration: 3000 });
          // Attempt to reinitialize if needed
          if (!isInitializingRef.current) {
            debugLog('Attempting automatic reconnection after network restore');
            initializeMeeting();
          }
        }, 2000);
      }
    };

    const handleOffline = () => {
      // Check if component is still mounted before proceeding
      if (!isMountedRef.current) {
        debugLog('Ignoring offline event - component unmounted', {}, 'warn');
        return;
      }

      debugLog('Network went offline', {
        timestamp: new Date().toISOString(),
        rtmWasConnected: !!rtmClientRef.current,
        rtcWasConnected: !!agoraClientRef.current,
        rtcParticipantsCount: participants.length,
        rtmParticipantsCount: rtmParticipants.length
      }, 'error');

      toast.error('Internet connection lost. Chat and video may be affected. Reconnecting automatically...');

      // Set connection status to reflect offline state
      setConnectionQuality('poor');
    };

    // Add connection quality monitoring
    const handleConnectionChange = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        debugLog('Network connection quality changed', {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt
        });

        // Update connection quality based on network info
        let quality = 'good';
        if (connection.effectiveType === '4g' && connection.downlink >= 5) quality = 'excellent';
        else if (connection.effectiveType === '4g' || (connection.effectiveType === '3g' && connection.downlink >= 1)) quality = 'good';
        else if (connection.effectiveType === '3g' || connection.effectiveType === 'slow-2g') quality = 'fair';
        else quality = 'poor';

        setConnectionQuality(quality);

        if (quality === 'poor') {
          toast.warn('Poor network connection detected. Consider switching to a better network.');
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Add connection change listener if supported
    if (navigator.connection) {
      navigator.connection.addEventListener('change', handleConnectionChange);
    }

    // Initialize meeting
    debugLog('Starting meeting initialization');
    initializeMeeting();

    // Cleanup function
    return () => {
      debugLog('Component unmounting, cleaning up resources');

      // Mark component as unmounted to prevent stale closures
      isMountedRef.current = false;

      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (navigator.connection) {
        navigator.connection.removeEventListener('change', handleConnectionChange);
      }

      cleanup();

      // Export debug logs if debug mode is active
      if (window.location.search.includes('debug')) {
        const allLogs = {
          rtm: window.rtmDebugLogs || [],
          chat: window.chatDebugLogs || [],
          meeting: window.meetingDebugLogs || [],
          connection: window.connectionDebugLogs || [],
          effect: window.effectDebugLogs || []
        };

        console.log('📊 Debug logs export:', allLogs);
        debugLog('Debug logs exported to console', {
          totalLogs: Object.values(allLogs).reduce((sum, logs) => sum + logs.length, 0)
        });
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // Remove debug useEffects that can cause re-renders
  // These were causing additional re-render cycles

  const handleUserPublished = async (user, mediaType) => {
    try {
      const client = agoraClientRef.current;
      if (!client) return;

      console.log('🎥 User published:', { uid: user.uid, mediaType, hasAudioTrack: !!user.audioTrack, hasVideoTrack: !!user.videoTrack });

      await client.subscribe(user, mediaType);
      console.log('🎥 Successfully subscribed to user:', user.uid, 'mediaType:', mediaType);

      if (user.uid) {
        setParticipants(prev => {
          const existing = prev.find(p => p.uid === user.uid.toString());
          console.log('🎥 Updating participants - existing:', !!existing, 'current participants:', prev.length);

          if (existing) {
            const updated = prev.map(p =>
              p.uid === user.uid.toString()
                ? {
                    ...p,
                    [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: user[mediaType === 'audio' ? 'audioTrack' : 'videoTrack']
                  }
                : p
            );
            console.log('🎥 Updated existing participant:', updated.find(p => p.uid === user.uid));
            return updated;
          } else {
            const newParticipant = {
              uid: user.uid.toString(),
              audioTrack: mediaType === 'audio' ? user.audioTrack : null,
              videoTrack: mediaType === 'video' ? user.videoTrack : null,
              isLocal: false,
              audioMuted: false,
              videoMuted: false,
              name: `Participant ${user.uid}`
            };
            const newList = [...prev, newParticipant];
            console.log('🎥 Added new participant:', newParticipant, 'total participants:', newList.length);
            return newList;
          }
        });
      }

      if (mediaType === 'video' && user.videoTrack) {
        console.log('🎥 Video track published for user:', user.uid);
        setParticipants(prev => [...prev]); // Force re-render

        setTimeout(() => {
          const container = document.getElementById(`remote-video-${user.uid}`);
          console.log('🎥 Playing remote video for user:', user.uid, 'container found:', !!container);
          if (container) {
            user.videoTrack.play(container);
            console.log('🎥 Remote video playing for user:', user.uid);
            setParticipants(prev => prev.map(p =>
              p.uid === user.uid.toString() ? { ...p, videoTrack: user.videoTrack } : p
            ));
          } else {
            console.log('🎥 Remote video container not found for user:', user.uid, 'retrying...');
            setTimeout(() => {
              const retryContainer = document.getElementById(`remote-video-${user.uid}`);
              if (retryContainer && user.videoTrack) {
                user.videoTrack.play(retryContainer);
                console.log('🎥 Remote video playing for user (retry):', user.uid);
                setParticipants(prev => prev.map(p =>
                  p.uid === user.uid.toString() ? { ...p, videoTrack: user.videoTrack } : p
                ));
              }
            }, 1000);
          }
        }, 200);
      }

      if (mediaType === 'audio' && user.audioTrack) {
        console.log('🎥 Audio track published for user:', user.uid);
        user.audioTrack.play();
        setParticipants(prev => prev.map(p =>
          p.uid === user.uid.toString() ? { ...p, audioTrack: user.audioTrack } : p
        ));
      }
    } catch (err) {
      console.error('🎥 Failed to subscribe to user:', err);
    }
  };

  const handleUserUnpublished = (user, mediaType) => {
    if (user.uid) {
      setParticipants(prev =>
        prev.map(p =>
          p.uid === user.uid.toString()
            ? {
                ...p,
                [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: null
              }
            : p
        )
      );
    }
  };

  // Pass localId to compare
  const handleUserJoined = (user, localId) => {
    console.log('🎥 User joined:', user.uid, 'Local user:', localId);
    if (user.uid) {
      setParticipants(prev => {
        const existing = prev.find(p => p.uid === user.uid);
        if (!existing) {
          const newParticipant = {
            uid: user.uid.toString(),
            audioTrack: null,
            videoTrack: null,
            isLocal: user.uid.toString() === localId.toString(),
            audioMuted: false,
            videoMuted: false,
            name: user.uid.toString() === localId.toString() ? 'You' : `Participant ${user.uid}`
          };
          console.log('🎥 Added participant on join:', newParticipant);
          return [...prev, newParticipant];
        }
        return prev;
      });
    }
  };

  const handleUserLeft = (user) => {
    console.log('🎥 User left:', user.uid);
    if (user.uid) {
      setParticipants(prev => prev.filter(p => p.uid !== user.uid.toString()));
      const container = document.getElementById(`remote-video-${user.uid}`);
      if (container) {
        container.innerHTML = ''; // Clear container
      }
    }
  };

  const handleConnectionStateChange = (state, reason) => {
    const debugLog = (message, data = null, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'CONNECTION_STATE',
        message,
        data,
        level,
        sessionId
      };

      if (level === 'error') {
        console.error(`🔗 [${timestamp}] CONNECTION_STATE ERROR:`, message, data);
      } else if (level === 'warn') {
        console.warn(`🔗 [${timestamp}] CONNECTION_STATE WARN:`, message, data);
      } else {
        console.log(`🔗 [${timestamp}] CONNECTION_STATE:`, message, data);
      }

      // Store debug logs for potential export
      if (!window.connectionDebugLogs) window.connectionDebugLogs = [];
      window.connectionDebugLogs.push(logEntry);
    };

    const stateData = {
      state,
      reason,
      timestamp: new Date().toISOString(),
      rtcParticipantsCount: participants.length,
      rtmParticipantsCount: rtmParticipants.length,
      meetingStatus,
      connectionQuality,
      rtmReady: !!rtmClientRef.current && !!rtmChannelRef.current,
      rtcReady: !!agoraClientRef.current
    };

    debugLog('Connection state changed', stateData);

    let newStatus = 'connecting';
    let shouldLogEvent = false;
    let eventType = '';

    switch (state) {
      case 'CONNECTED':
        newStatus = 'connected';
        debugLog('Successfully connected to Agora RTC channel', stateData);
        shouldLogEvent = true;
        eventType = 'rtc_connected';
        break;
      case 'CONNECTING':
        newStatus = 'connecting';
        debugLog('Connecting to Agora RTC channel', stateData);
        break;
      case 'RECONNECTING':
        newStatus = 'reconnecting';
        debugLog('Reconnecting to Agora RTC channel', stateData, 'warn');
        shouldLogEvent = true;
        eventType = 'rtc_reconnecting';
        break;
      case 'DISCONNECTED':
        newStatus = 'disconnected';
        if (reason === 'LEAVE' || reason === 'DISCONNECTING') {
          debugLog('User left the RTC meeting', stateData);
          eventType = 'rtc_user_left';
        } else {
          debugLog('RTC connection lost', { ...stateData, reason }, 'error');
          eventType = 'rtc_connection_lost';
        }
        shouldLogEvent = true;
        break;
      default:
        newStatus = state.toLowerCase();
        debugLog('Unknown RTC connection state', stateData, 'warn');
    }

    setMeetingStatus(newStatus);

    // Log significant connection events
    if (shouldLogEvent && eventType) {
      logMeetingEvent(eventType, {
        previousState: meetingStatus,
        newState: newStatus,
        reason,
        rtcParticipantsCount: participants.length,
        rtmParticipantsCount: rtmParticipants.length,
        connectionQuality
      });
    }

    // Provide user feedback for connection issues
    if (state === 'DISCONNECTED' && reason !== 'LEAVE' && reason !== 'DISCONNECTING') {
      let suggestion = '';
      if (reason === 'NETWORK_ERROR') {
        suggestion = 'Check your internet connection.';
      } else if (reason === 'UID_BANNED') {
        suggestion = 'You have been removed from the meeting.';
      } else if (reason === 'TOKEN_EXPIRED') {
        suggestion = 'Your session has expired. Please refresh.';
      }

      if (suggestion) {
        toast.error(`Connection lost: ${suggestion}`);
      } else {
        toast.error('Connection lost. Attempting to reconnect...');
      }
    } else if (state === 'RECONNECTING') {
      toast.warn('Connection unstable. Reconnecting...');
    } else if (state === 'CONNECTED' && meetingStatus !== 'connected') {
      toast.success('Connected to meeting');
    }

    // Conditional breakpoint for debugging
    if (window.location.search.includes('debug=connection')) {
      debugger; // Conditional breakpoint
      console.log('Connection Debug Breakpoint:', stateData);
    }
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

  const sendChatMessage = async () => {
    const debugLog = (message, data = null, level = 'info') => {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'CHAT_SEND',
        message,
        data,
        level,
        sessionId,
        uid: credentials?.uid
      };

      if (level === 'error') {
        console.error(`💬 [${timestamp}] CHAT_SEND ERROR:`, message, data);
      } else if (level === 'warn') {
        console.warn(`💬 [${timestamp}] CHAT_SEND WARN:`, message, data);
      } else {
        console.log(`💬 [${timestamp}] CHAT_SEND:`, message, data);
      }

      // Store debug logs for potential export
      if (!window.chatDebugLogs) window.chatDebugLogs = [];
      window.chatDebugLogs.push(logEntry);
    };

    const messageText = newMessage.trim();

    debugLog('Send chat message attempt', {
      messageLength: messageText.length,
      hasMessage: !!messageText,
      channelReady: !!rtmChannelRef.current,
      clientReady: !!rtmClientRef.current,
      currentChatCount: chatMessages.length,
      messageQueueState: {
        pendingMessages: chatMessages.filter(m => m.status === 'pending').length,
        failedMessages: chatMessages.filter(m => m.status === 'failed').length,
        sendingMessages: chatMessages.filter(m => m.status === 'sending').length
      }
    });

    // Validate message content
    if (!messageText) {
      debugLog('Empty message validation failed', {}, 'warn');
      toast.error('Please enter a message.');
      return;
    }

    if (messageText.length > 1000) {
      debugLog('Message too long', { length: messageText.length }, 'warn');
      toast.error('Message too long (max 1000 characters).');
      return;
    }

    // ==========================================================
    // FIX 5: Update the readiness check
    // ==========================================================
    // OLD v1.x check:
    // if (!messageText ||!rtmChannelRef.current) {

    // NEW v2.x check:
    if (!messageText || !rtmClientRef.current) {
      debugLog('RTM client not ready for message send (v2.x)', {
        hasMessage: !!messageText,
        clientReady: !!rtmClientRef.current,
        connectionState: rtmClientRef.current?.connectionState || 'unknown',
        initializationInProgress: isInitializingRef.current
      }, 'error');

      toast.error('Chat is not connected. Please wait for connection to establish.');
      return;
    }

    // Enhanced message queue state tracking
    const queueStats = {
      pendingMessages: chatMessages.filter(m => m.status === 'pending').length,
      failedMessages: chatMessages.filter(m => m.status === 'failed').length,
      sendingMessages: chatMessages.filter(m => m.status === 'sending').length,
      sentMessages: chatMessages.filter(m => m.status === 'sent').length,
      totalMessages: chatMessages.length,
      queueItems: messageQueue.length,
      emptyMessagesDiscarded: messageQueue.filter(m => m.type === 'empty_message_received').length,
      duplicatesDiscarded: messageQueue.filter(m => m.type === 'duplicate_message_discarded').length
    };

    debugLog('Message queue state before send', queueStats);

    // Check for message queue issues and provide suggestions
    if (queueStats.pendingMessages > 0) {
      debugLog('Pending messages detected - may indicate previous send failures', {
        pendingCount: queueStats.pendingMessages,
        suggestion: 'Check network connectivity or RTM connection status'
      }, 'warn');
    }

    if (queueStats.failedMessages > 2) {
      debugLog('Multiple failed messages detected', {
        failedCount: queueStats.failedMessages,
        suggestion: 'Consider refreshing the page to reset RTM connection'
      }, 'error');
    }

    if (queueStats.emptyMessagesDiscarded > 0) {
      debugLog('Empty messages have been discarded', {
        emptyCount: queueStats.emptyMessagesDiscarded,
        suggestion: 'Check message validation on sender side'
      }, 'warn');
    }

    const message = {
      id: Date.now() + Math.random(), // More unique ID
      text: messageText,
      sender: credentials?.uid.toString() || 'You',
      senderName: 'You',
      timestamp: new Date(),
      status: 'sending' // Track send status
    };

    debugLog('Preparing to send message', {
      messageId: message.id,
      textLength: messageText.length,
      senderUid: message.sender,
      messagePreview: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
    });

    // Add message to local state immediately for better UX
    setChatMessages(prev => {
      const newChat = [...prev, { ...message, status: 'sending' }];
      debugLog('Message added to local chat state', {
        previousCount: prev.length,
        newCount: newChat.length,
        messageStatus: 'sending'
      });
      return newChat;
    });

    // Clear input immediately
    setNewMessage('');

    try {
      debugLog('Sending message via RTM publish (v2.x)', {
        channelName: credentials.channelName,
        messageId: message.id
      });

      // ==========================================================
      // FIX 6: Use `publish` instead of `sendMessage`
      // ==========================================================
      // OLD v1.x call:
      // await rtmChannelRef.current.sendMessage({ text: messageText });

      // NEW v2.x call:
      await rtmClientRef.current.publish(credentials.channelName, messageText);

      debugLog('Message sent successfully via RTM (v2.x)', {
        messageId: message.id,
        textLength: messageText.length,
        channelName: credentials.channelName
      });

      // Update message status to sent
      setChatMessages(prev => prev.map(msg =>
        msg.id === message.id ? { ...msg, status: 'sent', sentAt: new Date() } : msg
      ));

      // Conditional breakpoint for debugging
      if (window.location.search.includes('debug=chat')) {
        debugger; // Conditional breakpoint
        console.log('Chat Debug Breakpoint: Message sent successfully');
      }

    } catch (sendErr) {
      debugLog('RTM message send failed', {
        error: sendErr.message,
        code: sendErr.code,
        stack: sendErr.stack,
        messageId: message.id,
        textLength: messageText.length,
        channelState: rtmChannelRef.current ? 'exists' : 'null',
        clientState: rtmClientRef.current ? 'exists' : 'null'
      }, 'error');

      // Update message status to failed
      setChatMessages(prev => prev.map(msg =>
        msg.id === message.id ? { ...msg, status: 'failed', error: sendErr.message } : msg
      ));

      // Provide specific error messages and suggestions
      let errorMessage = 'Failed to send message';
      let suggestion = '';

      if (sendErr.message.includes('timeout')) {
        errorMessage = 'Message send timed out';
        suggestion = 'Check your internet connection and try again';
        debugLog('Timeout detected - possible network issue', {}, 'warn');
      } else if (sendErr.message.includes('network') || sendErr.message.includes('connection')) {
        errorMessage = 'Network error - message not sent';
        suggestion = 'Check your internet connection and try again';
        debugLog('Network-related send failure detected', {}, 'warn');
      } else if (sendErr.message.includes('permission') || sendErr.message.includes('auth')) {
        errorMessage = 'Authentication error - chat permissions revoked';
        suggestion = 'Try refreshing the page to reconnect';
        debugLog('Authentication-related send failure detected', {}, 'error');
      } else if (sendErr.message.includes('rate') || sendErr.message.includes('limit')) {
        errorMessage = 'Too many messages - rate limited';
        suggestion = 'Please wait a moment before sending another message';
        debugLog('Rate limiting detected', {}, 'warn');
      } else if (sendErr.code === 102) {
        errorMessage = 'Chat connection lost';
        suggestion = 'Please refresh to reconnect to chat';
        debugLog('Connection lost during send (code 102)', {}, 'error');
      } else if (sendErr.code === 4) {
        errorMessage = 'Invalid message format';
        suggestion = 'Please try sending your message again';
        debugLog('Invalid message format (code 4)', {}, 'warn');
      }

      toast.error(`${errorMessage}${suggestion ? `. ${suggestion}` : ''}`);

      // Re-queue the message for retry if it's a temporary failure
      if (sendErr.message.includes('network') || sendErr.message.includes('timeout') || sendErr.code === 102) {
        debugLog('Re-queuing message for retry', { messageId: message.id });
        setTimeout(() => {
          setChatMessages(prev => prev.map(msg =>
            msg.id === message.id ? { ...msg, status: 'pending' } : msg
          ));
        }, 2000);
      }
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
      await cleanup(); // Await the cleanup
      onClose && onClose();
    } catch (err) {
      console.error('Error leaving meeting:', err);
    }
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
    console.log('🎥 Rendering error state:', error);
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

  if (!credentials) {
    console.log('🎥 Waiting for credentials...');
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
      {/* ENHANCED: Header with debug information */}
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
          {/* Debug Info - only show if debug mode is active */}
          {window.location.search.includes('debug') && (
            <div className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
              RTM: {rtmClientRef.current ? '✅' : '❌'} | RTC: {agoraClientRef.current ? '✅' : '❌'} | RTC Participants: {participants.length} | RTM Participants: {rtmParticipants.length}
            </div>
          )}
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
          {/* Debug Export Button - only show if debug mode is active */}
          {window.location.search.includes('debug') && (
            <button
              onClick={() => {
                const debugData = {
                  rtmLogs: window.rtmDebugLogs || [],
                  chatLogs: window.chatDebugLogs || [],
                  meetingLogs: window.meetingDebugLogs || [],
                  connectionLogs: window.connectionDebugLogs || [],
                  effectLogs: window.effectDebugLogs || [],
                  currentState: {
                    meetingStatus,
                    participantsCount: participants.length,
                    rtmParticipantsCount: rtmParticipants.length,
                    chatMessagesCount: chatMessages.length,
                    rtmReady: !!rtmClientRef.current,
                    rtcReady: !!agoraClientRef.current,
                    connectionQuality,
                    timeRemaining
                  },
                  timestamp: new Date().toISOString(),
                  sessionId
                };

                const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `video-call-debug-${sessionId}-${new Date().toISOString().slice(0, 19)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log('📊 Debug data exported:', debugData);
                toast.success('Debug data exported to downloads');
              }}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
              title="Export debug logs"
            >
              📊
            </button>
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
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Local Video */}
            {participants.find(p => p.isLocal) && (
              <div key="local-video" className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-blue-500">
                <div ref={localVideoRef} className="w-full h-64 bg-gray-900"></div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm flex items-center space-x-2">
                  <span>{participants.find(p => p.isLocal)?.name}</span>
                  {localAudioMuted && <span className="text-red-400">🔇</span>}
                  {localVideoTrack && <span className="text-green-400">📹</span>}
                </div>
                <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                  {meetingInfo?.session?.title || 'Video Meeting'}
                </div>
              </div>
            )}

            {/* Remote Videos */}
            {participants.filter(p => !p.isLocal).map(participant => (
              <div key={`remote-${participant.uid}`} className="relative bg-gray-800 rounded-lg overflow-hidden">
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
              <div key={`empty-${index}`} className="bg-gray-800 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center h-64">
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
                <div key={message.id} className={`rounded-lg p-3 ${message.senderName === 'You' ? 'bg-blue-700 ml-auto' : 'bg-gray-700'}`} style={{ maxWidth: '85%' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium text-sm">{message.senderName}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400 text-xs">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {/* Message status indicator - only show in debug mode */}
                      {window.location.search.includes('debug') && message.status && (
                        <span className={`text-xs px-1 py-0.5 rounded ${
                          message.status === 'sent' ? 'bg-green-600 text-white' :
                          message.status === 'sending' ? 'bg-yellow-600 text-white' :
                          message.status === 'failed' ? 'bg-red-600 text-white' :
                          message.status === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-white'
                        }`}>
                          {message.status === 'sent' ? '✓' :
                           message.status === 'sending' ? '⏳' :
                           message.status === 'failed' ? '✗' :
                           message.status === 'pending' ? '⟲' : '?'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className={`text-gray-200 text-sm whitespace-pre-wrap ${
                    message.status === 'failed' ? 'line-through opacity-70' : ''
                  }`}>
                    {message.text}
                  </p>
                  {/* Error message for failed messages */}
                  {message.status === 'failed' && message.error && window.location.search.includes('debug') && (
                    <p className="text-red-400 text-xs mt-1 opacity-75">
                      Error: {message.error}
                    </p>
                  )}
                </div>
              ))}
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                  {/* Enhanced debug info for empty chat with queue state tracking */}
                  {window.location.search.includes('debug') && (
                    <div className="mt-4 text-xs text-gray-600 bg-gray-800 p-2 rounded">
                      <p>RTM Status: {rtmClientRef.current ? 'Connected' : 'Disconnected'}</p>
                      <p>Channel Status: {rtmChannelRef.current ? 'Joined' : 'Not Joined'}</p>
                      <p>Messages in Chat: {chatMessages.length}</p>
                      <p>Messages in Queue: {messageQueue.length}</p>
                      <p>Pending Messages: {chatMessages.filter(m => m.status === 'pending').length}</p>
                      <p>Failed Messages: {chatMessages.filter(m => m.status === 'failed').length}</p>
                      <p>Sending Messages: {chatMessages.filter(m => m.status === 'sending').length}</p>
                      <p>Empty Messages Discarded: {messageQueue.filter(m => m.type === 'empty_message_received').length}</p>
                      <p>Duplicate Messages Discarded: {messageQueue.filter(m => m.type === 'duplicate_message_discarded').length}</p>
                      <p>Messages Received: {messageQueue.filter(m => m.type === 'message_received').length}</p>
                    </div>
                  )}
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
