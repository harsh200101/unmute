import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance with interceptors
const apiClient = axios.create({
  baseURL: API_BASE_URL,
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
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
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

      return newAccessToken;
    } catch (error) {
      dispatch({ type: ActionTypes.REFRESH_TOKEN_FAILURE });
      clearTokens();
      throw error;
    }
  }, [setTokens, clearTokens]);

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
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      const userData = localStorage.getItem('user');

      if (!accessToken || !refreshToken) {
        dispatch({
          type: ActionTypes.INITIALIZE_AUTH,
          payload: { user: null, accessToken: null, refreshToken: null },
        });
        return;
      }

      // Check token validity
      const isValid = await checkTokenValidity();
      if (!isValid) {
        dispatch({
          type: ActionTypes.INITIALIZE_AUTH,
          payload: { user: null, accessToken: null, refreshToken: null },
        });
        return;
      }

      // Set up API client with token
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;

      // Get fresh user data
      try {
        const response = await apiClient.get('/auth/profile');
        const user = response.data.data;
        
        localStorage.setItem('user', JSON.stringify(user));
        
        dispatch({
          type: ActionTypes.INITIALIZE_AUTH,
          payload: {
            user,
            accessToken: localStorage.getItem('accessToken'),
            refreshToken: localStorage.getItem('refreshToken'),
          },
        });
      } catch (error) {
        // If profile fetch fails, use stored user data
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
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      clearTokens();
      dispatch({
        type: ActionTypes.INITIALIZE_AUTH,
        payload: { user: null, accessToken: null, refreshToken: null },
      });
    }
  }, [checkTokenValidity, clearTokens]);

  // Register Function
  const register = useCallback(async (userData) => {
    dispatch({ type: ActionTypes.LOGIN_START });

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/register`, userData);
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
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
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
  const loginWithGoogle = useCallback(() => {
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('oauth_state', state);
    
    // Redirect to Google OAuth
    window.location.href = `${API_BASE_URL}/auth/google?state=${state}`;
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

      // Verify state for CSRF protection
      if (state !== storedState) {
        throw new Error('Invalid state parameter');
      }

      localStorage.removeItem('oauth_state');

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
      const user = response.data.data;

      localStorage.setItem('user', JSON.stringify(user));

      dispatch({
        type: ActionTypes.LOGIN_SUCCESS,
        payload: { user, accessToken, refreshToken },
      });

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
    }
  }, [state.refreshToken, clearTokens]);

  // Update Profile
  const updateProfile = useCallback(async (updates) => {
    try {
      const response = await apiClient.put('/auth/profile', updates);
      const updatedUser = response.data.data;

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
      const updatedUser = response.data.data;

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
    initializeAuth();
  }, [initializeAuth]);

  // Axios Response Interceptor for Token Refresh
  useEffect(() => {
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        updateActivity();
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry && state.isAuthenticated) {
          originalRequest._retry = true;

          try {
            await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
            return apiClient(originalRequest);
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            logout();
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
  const isEmailVerified = useCallback(() => !!state.user?.email_verified_at, [state.user]);
  const isMentorVerified = useCallback(() => state.user?.mentor_profile?.verification_status === 'verified', [state.user]);

  // Context Value
  const contextValue = {
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
  };

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
