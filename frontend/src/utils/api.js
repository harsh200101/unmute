import axios from 'axios';
import { toast } from 'react-hot-toast';

// Environment configuration
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and handle requests
api.interceptors.request.use(
  (config) => {
    // Add access token to requests
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    // Add request timestamp for debugging
    config.metadata = { startTime: new Date() };

    // Log requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚀 ${config.method?.toUpperCase()} ${config.url}`, {
        data: config.data,
        params: config.params,
      });
    }

    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle responses and errors
api.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const endTime = new Date();
    const duration = endTime.getTime() - response.config.metadata.startTime.getTime();

    // Log successful responses in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} (${duration}ms)`, {
        status: response.status,
        data: response.data,
      });
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Calculate request duration
    const endTime = new Date();
    const duration = originalRequest?.metadata 
      ? endTime.getTime() - originalRequest.metadata.startTime.getTime()
      : 0;

    // Log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`❌ ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} (${duration}ms)`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data,
      });
    }

    // Handle different error scenarios
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Handle unauthorized - attempt token refresh
          if (!originalRequest._retry) {
            originalRequest._retry = true;

            try {
              const refreshToken = localStorage.getItem('refreshToken');
              if (refreshToken) {
                // Attempt to refresh token
                const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
                  refreshToken,
                });

                const { accessToken: newAccessToken, refreshToken: newRefreshToken } = refreshResponse.data.data;
                
                // Update stored tokens
                localStorage.setItem('accessToken', newAccessToken);
                if (newRefreshToken) {
                  localStorage.setItem('refreshToken', newRefreshToken);
                }

                // Retry original request with new token
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                return api(originalRequest);
              }
            } catch (refreshError) {
              console.error('Token refresh failed:', refreshError);
            }
          }

          // If refresh failed or no refresh token, logout user
          handleLogout();
          break;

        case 403:
          toast.error('Access denied. You don\'t have permission to perform this action.');
          break;

        case 404:
          if (!originalRequest.url.includes('/auth/')) {
            toast.error('The requested resource was not found.');
          }
          break;

        case 422:
          // Validation errors
          if (data?.errors) {
            const errorMessages = Object.values(data.errors).flat();
            errorMessages.forEach(message => toast.error(message));
          } else if (data?.message) {
            toast.error(data.message);
          }
          break;

        case 429:
          toast.error('Too many requests. Please slow down and try again.');
          break;

        case 500:
          toast.error('Server error. Please try again later.');
          break;

        case 502:
        case 503:
        case 504:
          toast.error('Service temporarily unavailable. Please try again later.');
          break;

        default:
          if (data?.message) {
            toast.error(data.message);
          } else {
            toast.error('An unexpected error occurred.');
          }
      }
    } else if (error.request) {
      // Network error
      if (error.code === 'ECONNABORTED') {
        toast.error('Request timeout. Please check your connection and try again.');
      } else {
        toast.error('Network error. Please check your internet connection.');
      }
    } else {
      // Other errors
      console.error('API Error:', error.message);
      toast.error('An unexpected error occurred.');
    }

    return Promise.reject(error);
  }
);

// Helper function to handle logout
const handleLogout = () => {
  // Clear all stored tokens and user data
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  
  // Redirect to login page
  window.location.href = '/login';
  
  toast.error('Your session has expired. Please log in again.');
};

// Utility functions for common API operations
export const apiUtils = {
  // Set default authorization header
  setAuthToken: (token) => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('accessToken', token);
    } else {
      delete api.defaults.headers.common['Authorization'];
      localStorage.removeItem('accessToken');
    }
  },

  // Clear auth data
  clearAuth: () => {
    delete api.defaults.headers.common['Authorization'];
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  // Get current auth token
  getAuthToken: () => {
    return localStorage.getItem('accessToken');
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('accessToken');
  },

  // Upload file with progress
  uploadFile: (url, file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);

    return api.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },

  // Download file
  downloadFile: async (url, filename) => {
    try {
      const response = await api.get(url, {
        responseType: 'blob',
      });

      // Create blob link to download
      const href = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download file');
    }
  },

  // Retry failed request
  retryRequest: (originalRequest, maxRetries = 3, delay = 1000) => {
    return new Promise((resolve, reject) => {
      let retries = 0;

      const attemptRequest = () => {
        api(originalRequest)
          .then(resolve)
          .catch((error) => {
            retries++;
            if (retries < maxRetries && error.response?.status >= 500) {
              setTimeout(attemptRequest, delay * retries);
            } else {
              reject(error);
            }
          });
      };

      attemptRequest();
    });
  },

  // Cancel all pending requests
  cancelAllRequests: () => {
    // This would require implementing a request tracking system
    console.log('Cancelling all pending requests...');
  },

  // Health check
  healthCheck: async () => {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      return { status: 'error', message: 'Service unavailable' };
    }
  }
};

// API endpoints for easy access
export const endpoints = {
  // Auth endpoints
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    logout: '/auth/logout',
    refresh: '/auth/refresh-token',
    profile: '/auth/profile',
    changePassword: '/auth/change-password',
    verifyEmail: '/auth/verify-email',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
  },

  // User endpoints
  users: {
    profile: '/users/profile',
    updateProfile: '/users/profile',
    uploadAvatar: '/users/upload-avatar',
    settings: '/users/settings',
  },

  // Session endpoints
  sessions: {
    list: '/sessions',
    create: '/sessions',
    details: (id) => `/sessions/details/${id}`,
    update: (id) => `/sessions/details/${id}`,
    delete: (id) => `/sessions/details/${id}`,
    join: (id) => `/sessions/details/${id}/join`,
    start: (id) => `/sessions/details/${id}/start`,
    complete: (id) => `/sessions/details/${id}/complete`,
    cancel: (id) => `/sessions/details/${id}/cancel`,
    reschedule: (id) => `/sessions/details/${id}/reschedule`,
    notes: (id) => `/sessions/details/${id}/notes`,
    review: (id) => `/sessions/${id}/review`,
    mentorReview: (id) => `/sessions/${id}/mentor-review`,
    mentorRecent: '/sessions/mentor/recent',
    menteeRecent: '/sessions/mentee/recent',
  },

  // Mentor endpoints
  mentors: {
    list: '/mentors',
    featured: '/mentors/featured',
    details: (id) => `/mentors/${id}`,
    reviews: (id) => `/mentors/${id}/reviews`,
    availability: (id) => `/mentors/${id}/availability`,
    apply: '/mentors/apply',
    profile: '/mentors/profile',
  },

  // Payment endpoints
  payments: {
    createIntent: '/payments/create-intent',
    verify: '/payments/verify',
    refund: '/payments/refund',
    history: '/payments/history',
    status: (transactionId) => `/payments/status/${transactionId}`,
  },

  // Wallet endpoints
  wallet: {
    balance: '/wallet/balance',
    transactions: '/wallet/transactions',
    topup: '/wallet/topup',
  },

  // Notification endpoints
  notifications: {
    list: '/notifications',
    markRead: (id) => `/notifications/${id}/read`,
    markAllRead: '/notifications/mark-all-read',
  }
};

// Request/Response logging for development
if (process.env.NODE_ENV === 'development') {
  // Add request ID for tracking
  api.interceptors.request.use((config) => {
    config.metadata = {
      ...config.metadata,
      requestId: Math.random().toString(36).substr(2, 9)
    };
    return config;
  });
}

export default api;
