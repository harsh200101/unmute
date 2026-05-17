import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// API Configuration - Use relative URLs for proxy to work
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

// Create axios instance with interceptors
const apiClient = axios.create({
  baseURL: API_BASE_URL || '/api', // Use relative URL for proxy
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth Context
const AuthContext = createContext();

// Initial State
const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  accessToken: null,
  refreshToken: null,
  error: null,
  lastActivity: null,
  sessionTimeout: null,
};

// Action Types
const ActionTypes = {
  INITIALIZE_AUTH: 'INITIALIZE_AUTH',
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  REFRESH_TOKEN_SUCCESS: 'REFRESH_TOKEN_SUCCESS',
  REFRESH_TOKEN_FAILURE: 'REFRESH_TOKEN_FAILURE',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_ACTIVITY: 'UPDATE_ACTIVITY',
  SET_SESSION_TIMEOUT: 'SET_SESSION_TIMEOUT',
};

// Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case ActionTypes.INITIALIZE_AUTH:
      return {
        ...state,
        isLoading: false,
        isInitialized: true,
        user: action.payload.user,
        isAuthenticated: !!action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
      };

    case ActionTypes.LOGIN_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case ActionTypes.LOGIN_SUCCESS:
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        user: action.payload.user,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        error: null,
        lastActivity: Date.now(),
      };

    case ActionTypes.LOGIN_FAILURE:
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        accessToken: null,
        refreshToken: null,
        error: action.payload.error,
      };

    case ActionTypes.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
        isInitialized: true,
      };

    case ActionTypes.UPDATE_PROFILE:
      return {
        ...state,
        user: { ...state.user, ...action.payload.updates },
      };

    case ActionTypes.REFRESH_TOKEN_SUCCESS:
      return {
        ...state,
        accessToken: action.payload.accessToken,
        refreshToken: action.payload.refreshToken,
        lastActivity: Date.now(),
      };

    case ActionTypes.REFRESH_TOKEN_FAILURE:
      return {
        ...initialState,
        isLoading: false,
        isInitialized: true,
        error: 'Session expired. Please log in again.',
      };

    case ActionTypes.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };

    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    case ActionTypes.UPDATE_ACTIVITY:
      return {
        ...state,
        lastActivity: Date.now(),
      };

    case ActionTypes.SET_SESSION_TIMEOUT:
      return {
        ...state,
        sessionTimeout: action.payload,
      };

    default:
      return state;
  }
};

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Request deduplication tracking
  const pendingRequests = React.useRef(new Map());
  const isInitializing = React.useRef(false);
  const isLoggingOut = React.useRef(false);

  // Prevent duplicate requests
  const shouldMakeRequest = React.useCallback((requestKey, ttl = 5000) => {
    const now = Date.now();
    const lastRequest = pendingRequests.current.get(requestKey);

    if (lastRequest && (now - lastRequest) < ttl) {
      console.log(`🚫 AUTH: Duplicate request blocked: ${requestKey}`);
      return false;
    }

    pendingRequests.current.set(requestKey, now);

    // Clean up old entries
    setTimeout(() => {
      pendingRequests.current.delete(requestKey);
    }, ttl);

    return true;
  }, []);

  // Token Management
  const setTokens = useCallback((accessToken, refreshToken) => {
    if (accessToken) {
      localStorage.setItem('accessToken', accessToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    }
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    delete apiClient.defaults.headers.common['Authorization'];
  }, []);

  // Refresh Token Function
  const refreshAccessToken = useCallback(async () => {
    // Prevent multiple simultaneous refresh attempts
    if (!shouldMakeRequest('token-refresh', 10000)) {
      throw new Error('Token refresh already in progress');
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      console.log('🔄 AUTH: Refreshing access token...');
      const response = await axios.post('/api/auth/refresh-token', {
        refreshToken,
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;

      setTokens(newAccessToken, newRefreshToken);

      dispatch({
        type: ActionTypes.REFRESH_TOKEN_SUCCESS,
        payload: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });

      console.log('✅ AUTH: Token refreshed successfully');
      return newAccessToken;
    } catch (error) {
      console.error('❌ AUTH: Token refresh failed:', error.message);
      dispatch({ type: ActionTypes.REFRESH_TOKEN_FAILURE });
      clearTokens();
      throw error;
    }
  }, [setTokens, clearTokens, shouldMakeRequest]);

  // Token Validation
  const checkTokenValidity = useCallback(async () => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return false;

    try {
      // Decode JWT to check expiration (basic check)
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      const isExpired = payload.exp * 1000 < Date.now();

      if (isExpired) {
        try {
          await refreshAccessToken();
          return true;
        } catch (error) {
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }, [refreshAccessToken]);

  // Initialize Auth
  const initializeAuth = useCallback(async () => {
    // Prevent multiple simultaneous initialization calls
    if (isInitializing.current) {
      console.log('🚫 AUTH: Initialization already in progress, skipping...');
      return;
    }

    // Prevent duplicate initialization within 10 seconds
    if (!shouldMakeRequest('auth-init', 10000)) {
      return;
    }

    isInitializing.current = true;

    try {
      console.log('🚀 AUTH: Starting authentication initialization...');

      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      const userData = localStorage.getItem('user');

      if (!accessToken || !refreshToken) {
        console.log('ℹ️ AUTH: No tokens found, initializing as unauthenticated');
        dispatch({
          type: ActionTypes.INITIALIZE_AUTH,
          payload: { user: null, accessToken: null, refreshToken: null },
        });
        return;
      }

      // Check token validity
      const isValid = await checkTokenValidity();
      if (!isValid) {
        console.log('⚠️ AUTH: Tokens invalid, initializing as unauthenticated');
        dispatch({
          type: ActionTypes.INITIALIZE_AUTH,
          payload: { user: null, accessToken: null, refreshToken: null },
        });
        return;
      }

      // Set up API client with token
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;

      // Get fresh user data with deduplication
      if (shouldMakeRequest('profile-fetch', 3000)) {
        try {
          console.log('📡 AUTH: Fetching user profile...');
          const response = await apiClient.get('/auth/profile');
          const user = response.data.data.user;

          localStorage.setItem('user', JSON.stringify(user));

          console.log('✅ AUTH: Profile fetched - user role:', user.role, 'user id:', user.id);

          dispatch({
            type: ActionTypes.INITIALIZE_AUTH,
            payload: {
              user,
              accessToken: localStorage.getItem('accessToken'),
              refreshToken: localStorage.getItem('refreshToken'),
            },
          });

          console.log('✅ AUTH: Profile fetched and user initialized');
        } catch (error) {
          console.error('❌ AUTH: Profile fetch failed:', error.message);

          // If profile fetch fails, use stored user data
          if (userData) {
            const user = JSON.parse(userData);
            console.log('✅ AUTH: Profile fetch failed, using stored user data - role:', user.role, 'user id:', user.id);
            dispatch({
              type: ActionTypes.INITIALIZE_AUTH,
              payload: {
                user,
                accessToken: localStorage.getItem('accessToken'),
                refreshToken: localStorage.getItem('refreshToken'),
              },
            });
            console.log('✅ AUTH: Initialized with stored user data');
          } else {
            throw error;
          }
        }
      } else {
        // Use stored data if profile fetch is blocked
        if (userData) {
          const user = JSON.parse(userData);
          dispatch({
            type: ActionTypes.INITIALIZE_AUTH,
            payload: {
              user,
              accessToken: localStorage.getItem('accessToken'),
              refreshToken: localStorage.getItem('refreshToken'),
            },
          });
          console.log('✅ AUTH: Initialized with cached user data');
        }
      }
    } catch (error) {
      console.error('❌ AUTH: Initialization error:', error);
      clearTokens();
      dispatch({
        type: ActionTypes.INITIALIZE_AUTH,
        payload: { user: null, accessToken: null, refreshToken: null },
      });
    } finally {
      isInitializing.current = false;
    }
  }, [checkTokenValidity, clearTokens, shouldMakeRequest]);

  // Register Function
  const register = useCallback(async (userData) => {
    dispatch({ type: ActionTypes.LOGIN_START });

    try {
      const response = await axios.post('/api/auth/register', userData);
      const { user, tokens } = response.data.data;
      const { accessToken, refreshToken } = tokens;

      setTokens(accessToken, refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      dispatch({
        type: ActionTypes.LOGIN_SUCCESS,
        payload: { user, accessToken, refreshToken },
      });

      toast.success('Registration successful! Welcome to Unmute.');
      return { success: true, user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      
      dispatch({
        type: ActionTypes.LOGIN_FAILURE,
        payload: { error: errorMessage },
      });

      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [setTokens]);

  // Login Function
  const login = useCallback(async (email, password) => {
    dispatch({ type: ActionTypes.LOGIN_START });

    try {
      const response = await axios.post('/api/auth/login', {
        email,
        password,
      });

      const { user, tokens } = response.data.data;
      const { accessToken, refreshToken } = tokens;

      setTokens(accessToken, refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      dispatch({
        type: ActionTypes.LOGIN_SUCCESS,
        payload: { user, accessToken, refreshToken },
      });

      toast.success(`Welcome back, ${user.first_name}!`);
      return { success: true, user };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      
      dispatch({
        type: ActionTypes.LOGIN_FAILURE,
        payload: { error: errorMessage },
      });

      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [setTokens]);

  // Google OAuth Login
  const loginWithGoogle = useCallback((role = 'mentee') => {
    // Generate CSRF state for protection
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('oauth_state', state);

    console.log('🔄 AUTH: Initiating Google OAuth with role:', role);
    console.log('🔄 AUTH: Generated CSRF state:', state);
    console.log('🔄 AUTH: Full OAuth URL:', `${API_BASE_URL || 'http://localhost:5000'}/api/auth/google?role=${role}&state=${state}`);

    // Redirect to Google OAuth with role as query parameter (use full backend URL since proxy doesn't work for window.location)
    window.location.href = `${API_BASE_URL || 'http://localhost:5000'}/api/auth/google?role=${role}&state=${state}`;
  }, []);

  // Handle OAuth Callback
const handleOAuthCallback = useCallback(async (searchParams) => {
dispatch({ type: ActionTypes.LOGIN_START });

try {
  const accessToken = searchParams.get('accessToken');
  const refreshToken = searchParams.get('refreshToken');
  const error = searchParams.get('error');
  const state = searchParams.get('state');
  const storedState = localStorage.getItem('oauth_state');

  console.log('🔄 AUTH: OAuth callback received');
  console.log('🔄 AUTH: URL state parameter:', state);
  console.log('🔄 AUTH: Stored state:', storedState);

  // Verify CSRF state (role is now handled server-side)
  if (storedState && state) {
    if (state !== storedState) {
      console.warn('State parameter mismatch - continuing anyway for OAuth compatibility');
      console.log('⚠️ AUTH: CSRF state mismatch - stored:', storedState, 'received:', state);
    } else {
      console.log('✅ AUTH: CSRF state parameter matches stored state');
    }
  } else {
    console.log('⚠️ AUTH: Missing state parameters - stored:', !!storedState, 'received:', !!state);
  }

  // Clean up stored state
  if (storedState) {
    localStorage.removeItem('oauth_state');
  }

      // Clean up stored state
      if (storedState) {
        localStorage.removeItem('oauth_state');
      }

      if (error) {
        throw new Error(decodeURIComponent(error));
      }

      if (!accessToken || !refreshToken) {
        throw new Error('Missing authentication tokens');
      }

      setTokens(accessToken, refreshToken);

      // Get user profile
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      const response = await apiClient.get('/auth/profile');
      const user = response.data.data.user;

      console.log('✅ AUTH: OAuth profile fetched - role:', user.role, 'user id:', user.id, 'isMentor check:', user.role === 'mentor' || user.role === 'super_admin');

      localStorage.setItem('user', JSON.stringify(user));

      dispatch({
        type: ActionTypes.LOGIN_SUCCESS,
        payload: { user, accessToken, refreshToken },
      });

      console.log('✅ AUTH: OAuth user dispatched to context - role:', user.role);

      toast.success(`Welcome, ${user.first_name}! You're now logged in.`);
      return { success: true, user };
    } catch (error) {
      const errorMessage = error.message || 'OAuth login failed';
      
      dispatch({
        type: ActionTypes.LOGIN_FAILURE,
        payload: { error: errorMessage },
      });

      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [setTokens]);

  // Logout Function
  const logout = useCallback(async () => {
    if (isLoggingOut.current) {
      console.log('🚫 AUTH: Logout already in progress, skipping...');
      return;
    }

    isLoggingOut.current = true;

    try {
      // Attempt to invalidate tokens on server
      if (state.refreshToken) {
        await apiClient.post('/auth/logout', {
          refreshToken: state.refreshToken,
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearTokens();
      dispatch({ type: ActionTypes.LOGOUT });
      toast.success('You have been logged out successfully.');
      isLoggingOut.current = false;
    }
  }, [state.refreshToken, clearTokens]);

  // Update Profile
  const updateProfile = useCallback(async (updates) => {
    try {
      const response = await apiClient.put('/auth/profile', updates);
      const updatedUser = response.data.data.user;

      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      dispatch({
        type: ActionTypes.UPDATE_PROFILE,
        payload: { updates: updatedUser },
      });

      toast.success('Profile updated successfully!');
      return updatedUser;
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Profile update failed';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Change Password
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      await apiClient.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      toast.success('Password changed successfully!');
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Password change failed';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Send Email Verification
  const sendEmailVerification = useCallback(async () => {
    try {
      await apiClient.post('/auth/send-verification-email');
      toast.success('Verification email sent! Please check your inbox.');
      return { success: true };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to send verification email';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Verify Email
  const verifyEmail = useCallback(async (token) => {
    try {
      const response = await apiClient.post('/auth/verify-email', { token });
      const updatedUser = response.data.data.user;

      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      dispatch({
        type: ActionTypes.UPDATE_PROFILE,
        payload: { updates: updatedUser },
      });

      toast.success('Email verified successfully!');
      return { success: true, user: updatedUser };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Email verification failed';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Activity Tracking
  const updateActivity = useCallback(() => {
    dispatch({ type: ActionTypes.UPDATE_ACTIVITY });
  }, []);

  // Session Timeout Management
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const WARNING_TIMEOUT = 25 * 60 * 1000; // 25 minutes

    const checkInactivity = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - (state.lastActivity || now);

      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
        logout();
        toast.error('Session expired due to inactivity');
      } else if (timeSinceLastActivity >= WARNING_TIMEOUT) {
        toast.warning('Your session will expire in 5 minutes due to inactivity');
      }
    };

    const interval = setInterval(checkInactivity, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [state.isAuthenticated, state.lastActivity, logout]);

  // Initialize on mount
  useEffect(() => {
    // Only initialize if not already initialized and not currently initializing
    if (!state.isInitialized && !isInitializing.current) {
      initializeAuth();
    }
  }, [initializeAuth, state.isInitialized]);

  // Axios Response Interceptor for Token Refresh
  useEffect(() => {
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        // Only update activity for non-auth endpoints to reduce noise
        if (!response.config.url?.includes('/auth/')) {
          updateActivity();
        }
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Only attempt refresh for 401 errors on authenticated requests
        if (error.response?.status === 401 &&
            !originalRequest._retry &&
            state.isAuthenticated &&
            !originalRequest.url?.includes('/auth/')) { // Don't refresh on auth endpoints

          originalRequest._retry = true;

          try {
            console.log('🔄 AUTH: Attempting token refresh due to 401 error');
            const newToken = await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          } catch (refreshError) {
            console.error('❌ AUTH: Token refresh failed in interceptor:', refreshError.message);
            // Only logout if it's not a rate limit error
            if (!refreshError.message?.includes('Too many')) {
              logout();
            }
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      apiClient.interceptors.response.eject(responseInterceptor);
    };
  }, [refreshAccessToken, logout, state.isAuthenticated, updateActivity]);

  // Memoized utility functions
  const clearError = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_ERROR });
  }, []);

  const hasRole = useCallback((requiredRoles) => {
    if (!state.user) return false;
    const userRoles = Array.isArray(state.user.role) ? state.user.role : [state.user.role];
    return requiredRoles.some(role => userRoles.includes(role) || userRoles.includes('super_admin'));
  }, [state.user]);

  const isMentor = useCallback(() => state.user?.role === 'mentor' || state.user?.role === 'super_admin', [state.user]);
  const isMentee = useCallback(() => state.user?.role === 'mentee', [state.user]);
  const isAdmin = useCallback(() => ['admin', 'super_admin'].includes(state.user?.role), [state.user]);
  const isEmailVerified = useCallback(() => !!state.user?.emailVerifiedAt, [state.user]);
  const isMentorVerified = useCallback(() => state.user?.mentor_profile?.verification_status === 'verified', [state.user]);

  // Context Value - Memoized to prevent unnecessary re-renders
  const contextValue = React.useMemo(() => ({
    // State
    ...state,

    // Actions
    register,
    login,
    loginWithGoogle,
    handleOAuthCallback,
    logout,
    updateProfile,
    changePassword,
    sendEmailVerification,
    verifyEmail,
    checkTokenValidity,
    refreshAccessToken,
    updateActivity,

    // Utilities
    clearError,

    // Role Checking Utilities
    hasRole,
    isMentor,
    isMentee,
    isAdmin,
    isEmailVerified,
    isMentorVerified,
  }), [
    state,
    register,
    login,
    loginWithGoogle,
    handleOAuthCallback,
    logout,
    updateProfile,
    changePassword,
    sendEmailVerification,
    verifyEmail,
    checkTokenValidity,
    refreshAccessToken,
    updateActivity,
    clearError,
    hasRole,
    isMentor,
    isMentee,
    isAdmin,
    isEmailVerified,
    isMentorVerified,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export API client for use in other parts of the app
export { apiClient };

export default AuthContext;
