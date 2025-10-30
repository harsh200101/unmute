import { toast } from 'react-hot-toast';

// ============================================================================
// DATE AND TIME HELPERS
// ============================================================================

/**
 * Format date to human readable string
 * @param {string|Date} date - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '';

  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
    ...options
  };

  try {
    return new Date(date).toLocaleDateString('en-US', defaultOptions);
  } catch (error) {
    console.error('Date formatting error:', error);
    return '';
  }
};

/**
 * Format time to human readable string
 * @param {string|Date} date - Date/time to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted time string
 */
export const formatTime = (date, options = {}) => {
  if (!date) return '';

  const defaultOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
    ...options
  };

  try {
    return new Date(date).toLocaleTimeString('en-US', defaultOptions);
  } catch (error) {
    console.error('Time formatting error:', error);
    return '';
  }
};

/**
 * Format date and time together
 * @param {string|Date} date - Date/time to format
 * @returns {string} Formatted date and time string
 */
export const formatDateTime = (date) => {
  if (!date) return '';
  return `${formatDate(date)} at ${formatTime(date)}`;
};

/**
 * Get relative time (e.g., "2 hours ago", "in 3 days")
 * @param {string|Date} date - Date to compare
 * @returns {string} Relative time string
 */
export const getRelativeTime = (date) => {
  if (!date) return '';
  
  try {
    const now = new Date();
    const targetDate = new Date(date);
    const diffInSeconds = Math.floor((targetDate - now) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (Math.abs(diffInSeconds) < 60) {
      return 'just now';
    } else if (Math.abs(diffInMinutes) < 60) {
      return diffInMinutes > 0 ? `in ${diffInMinutes} minutes` : `${Math.abs(diffInMinutes)} minutes ago`;
    } else if (Math.abs(diffInHours) < 24) {
      return diffInHours > 0 ? `in ${diffInHours} hours` : `${Math.abs(diffInHours)} hours ago`;
    } else if (Math.abs(diffInDays) < 7) {
      return diffInDays > 0 ? `in ${diffInDays} days` : `${Math.abs(diffInDays)} days ago`;
    } else {
      return formatDate(date);
    }
  } catch (error) {
    console.error('Relative time calculation error:', error);
    return formatDate(date);
  }
};

/**
 * Check if date is today
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is today
 */
export const isToday = (date) => {
  if (!date) return false;
  const today = new Date();
  const checkDate = new Date(date);
  return today.toDateString() === checkDate.toDateString();
};

/**
 * Check if date is tomorrow
 * @param {string|Date} date - Date to check
 * @returns {boolean} True if date is tomorrow
 */
export const isTomorrow = (date) => {
  if (!date) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const checkDate = new Date(date);
  return tomorrow.toDateString() === checkDate.toDateString();
};

/**
 * Calculate duration between two dates
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {Object} Duration object with hours, minutes, etc.
 */
export const calculateDuration = (startDate, endDate) => {
  if (!startDate || !endDate) return { hours: 0, minutes: 0 };
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffInMs = end - start;
  
  return {
    milliseconds: diffInMs,
    seconds: Math.floor(diffInMs / 1000),
    minutes: Math.floor(diffInMs / (1000 * 60)),
    hours: Math.floor(diffInMs / (1000 * 60 * 60)),
    days: Math.floor(diffInMs / (1000 * 60 * 60 * 24))
  };
};

// ============================================================================
// STRING HELPERS
// ============================================================================

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
export const capitalizeFirst = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Capitalize each word in a string
 * @param {string} str - String to capitalize
 * @returns {string} Title case string
 */
export const toTitleCase = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.split(' ').map(capitalizeFirst).join(' ');
};

/**
 * Convert string to URL-friendly slug
 * @param {string} str - String to convert
 * @returns {string} URL slug
 */
export const slugify = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Truncate string to specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to append (default: '...')
 * @returns {string} Truncated string
 */
export const truncateString = (str, length = 100, suffix = '...') => {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= length) return str;
  return str.substring(0, length).trim() + suffix;
};

/**
 * Extract initials from name
 * @param {string} name - Full name
 * @param {number} maxInitials - Maximum number of initials
 * @returns {string} Initials
 */
export const getInitials = (name, maxInitials = 2) => {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .split(' ')
    .filter(word => word.length > 0)
    .slice(0, maxInitials)
    .map(word => word.charAt(0).toUpperCase())
    .join('');
};

/**
 * Generate random string
 * @param {number} length - Length of string
 * @param {string} chars - Characters to use
 * @returns {string} Random string
 */
export const generateRandomString = (length = 10, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate phone number (basic validation)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone
 */
export const isValidPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
  return phoneRegex.test(phone.trim());
};

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with score and feedback
 */
export const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') {
    return { score: 0, feedback: 'Password is required', isValid: false };
  }

  let score = 0;
  const feedback = [];

  // Length check
  if (password.length >= 8) {
    score += 25;
  } else {
    feedback.push('At least 8 characters');
  }

  // Uppercase check
  if (/[A-Z]/.test(password)) {
    score += 25;
  } else {
    feedback.push('At least one uppercase letter');
  }

  // Lowercase check
  if (/[a-z]/.test(password)) {
    score += 25;
  } else {
    feedback.push('At least one lowercase letter');
  }

  // Number check
  if (/\d/.test(password)) {
    score += 12.5;
  } else {
    feedback.push('At least one number');
  }

  // Special character check
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 12.5;
  } else {
    feedback.push('At least one special character');
  }

  const strength = score === 100 ? 'Very Strong' : 
                   score >= 75 ? 'Strong' : 
                   score >= 50 ? 'Medium' : 
                   score >= 25 ? 'Weak' : 'Very Weak';

  return {
    score,
    strength,
    feedback,
    isValid: score >= 50
  };
};

// ============================================================================
// NUMBER AND CURRENCY HELPERS
// ============================================================================

/**
 * Format number as currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @param {string} locale - Locale code
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = 'INR', locale = 'en-IN') => {
  if (typeof amount !== 'number') return '₹0';
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  } catch (error) {
    console.error('Currency formatting error:', error);
    return `₹${amount.toFixed(2)}`;
  }
};

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (num) => {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString();
};

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @param {number} decimals - Number of decimal places
 * @returns {number} Percentage
 */
export const calculatePercentage = (value, total, decimals = 2) => {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100 * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * Generate random number between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random number
 */
export const randomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// ============================================================================
// ARRAY AND OBJECT HELPERS
// ============================================================================

/**
 * Remove duplicates from array
 * @param {Array} arr - Array to deduplicate
 * @param {string} key - Key to deduplicate by (for objects)
 * @returns {Array} Deduplicated array
 */
export const removeDuplicates = (arr, key = null) => {
  if (!Array.isArray(arr)) return [];
  
  if (key) {
    const seen = new Set();
    return arr.filter(item => {
      const value = item[key];
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  
  return [...new Set(arr)];
};

/**
 * Group array by key
 * @param {Array} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
export const groupBy = (arr, key) => {
  if (!Array.isArray(arr)) return {};
  
  return arr.reduce((groups, item) => {
    const group = item[key];
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {});
};

/**
 * Sort array by key
 * @param {Array} arr - Array to sort
 * @param {string} key - Key to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted array
 */
export const sortBy = (arr, key, direction = 'asc') => {
  if (!Array.isArray(arr)) return [];
  
  return [...arr].sort((a, b) => {
    let aVal = a[key];
    let bVal = b[key];
    
    // Handle string comparison
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (direction === 'desc') {
      return bVal > aVal ? 1 : -1;
    }
    return aVal > bVal ? 1 : -1;
  });
};

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(deepClone);
  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

// ============================================================================
// MENTORING PLATFORM SPECIFIC HELPERS
// ============================================================================

/**
 * Calculate session price based on duration and hourly rate
 * @param {number} durationMinutes - Session duration in minutes
 * @param {number} hourlyRate - Hourly rate
 * @returns {number} Total session price
 */
export const calculateSessionPrice = (durationMinutes, hourlyRate) => {
  if (!durationMinutes || !hourlyRate) return 0;
  return Math.round((durationMinutes / 60) * hourlyRate * 100) / 100;
};

/**
 * Get session status badge properties
 * @param {string} status - Session status
 * @returns {Object} Badge properties
 */
export const getSessionStatusBadge = (status) => {
  const badges = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳', label: 'Pending' },
    scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '📅', label: 'Scheduled' },
    confirmed: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅', label: 'Confirmed' },
    in_progress: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '🔴', label: 'In Progress' },
    completed: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '✨', label: 'Completed' },
    cancelled_by_mentee: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌', label: 'Cancelled' },
    cancelled_by_mentor: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌', label: 'Cancelled' },
    no_show_mentee: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻', label: 'No Show' },
    no_show_mentor: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '👻', label: 'No Show' },
    disputed: { bg: 'bg-red-100', text: 'text-red-800', icon: '⚠️', label: 'Disputed' },
    refunded: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '💰', label: 'Refunded' }
  };
  
  return badges[status] || badges.pending;
};

/**
 * Check if session can be joined
 * @param {Object} session - Session object
 * @returns {boolean} True if session can be joined
 */
export const canJoinSession = (session) => {
  if (!session || session.status !== 'confirmed') return false;
  
  const now = new Date();
  const sessionTime = new Date(session.scheduled_at);
  const timeDiff = sessionTime - now;
  
  // Allow joining 15 minutes before and during session
  return timeDiff <= 15 * 60 * 1000 && timeDiff >= -session.duration_minutes * 60 * 1000;
};

/**
 * Check if session can be cancelled
 * @param {Object} session - Session object
 * @returns {boolean} True if session can be cancelled
 */
export const canCancelSession = (session) => {
  if (!session) return false;
  
  const now = new Date();
  const sessionTime = new Date(session.scheduled_at);
  const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);
  
  return ['confirmed', 'in_progress'].includes(session.status) && hoursUntilSession > 24;
};

/**
 * Calculate refund amount based on cancellation policy
 * @param {Object} session - Session object
 * @returns {Object} Refund calculation
 */
export const calculateRefund = (session) => {
  if (!session) return { refundPercentage: 0, refundAmount: 0 };
  
  const now = new Date();
  const sessionTime = new Date(session.scheduled_at);
  const hoursUntilSession = (sessionTime - now) / (1000 * 60 * 60);

  let refundPercentage = 0;
  if (hoursUntilSession >= 24) {
    refundPercentage = 100; // Full refund
  } else if (hoursUntilSession >= 2) {
    refundPercentage = 50; // 50% refund
  } else {
    refundPercentage = 0; // No refund
  }

  const refundAmount = (session.price * refundPercentage) / 100;

  return {
    refundPercentage,
    refundAmount,
    hoursUntilSession: Math.max(0, hoursUntilSession)
  };
};

/**
 * Generate meeting room name
 * @param {string} mentorName - Mentor name
 * @param {string} menteeName - Mentee name
 * @param {string} sessionId - Session ID
 * @returns {string} Meeting room name
 */
export const generateMeetingRoomName = (mentorName, menteeName, sessionId) => {
  const mentorSlug = slugify(mentorName || 'mentor');
  const menteeSlug = slugify(menteeName || 'mentee');
  return `${mentorSlug}-${menteeSlug}-${sessionId}`;
};

// ============================================================================
// FILE AND UPLOAD HELPERS
// ============================================================================

/**
 * Validate file type
 * @param {File} file - File to validate
 * @param {Array} allowedTypes - Allowed MIME types
 * @returns {boolean} True if file type is allowed
 */
export const isValidFileType = (file, allowedTypes = []) => {
  if (!file || !allowedTypes.length) return false;
  return allowedTypes.includes(file.type);
};

/**
 * Validate file size
 * @param {File} file - File to validate
 * @param {number} maxSizeMB - Maximum size in MB
 * @returns {boolean} True if file size is valid
 */
export const isValidFileSize = (file, maxSizeMB = 5) => {
  if (!file) return false;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

/**
 * Format file size to human readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file extension
 * @param {string} filename - File name
 * @returns {string} File extension
 */
export const getFileExtension = (filename) => {
  if (!filename || typeof filename !== 'string') return '';
  return filename.split('.').pop().toLowerCase();
};

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Handle API errors and show appropriate toast messages
 * @param {Error} error - Error object
 * @param {string} defaultMessage - Default error message
 */
export const handleApiError = (error, defaultMessage = 'An error occurred') => {
  console.error('API Error:', error);
  
  if (error?.response?.data?.message) {
    toast.error(error.response.data.message);
  } else if (error?.message) {
    toast.error(error.message);
  } else {
    toast.error(defaultMessage);
  }
};

/**
 * Safe JSON parse
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    console.warn('JSON parse error:', error);
    return fallback;
  }
};

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func.apply(null, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

/**
 * Safe localStorage get item
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Stored value or default
 */
export const getStorageItem = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn('Storage get error:', error);
    return defaultValue;
  }
};

/**
 * Safe localStorage set item
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 * @returns {boolean} Success status
 */
export const setStorageItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('Storage set error:', error);
    return false;
  }
};

/**
 * Safe localStorage remove item
 * @param {string} key - Storage key
 * @returns {boolean} Success status
 */
export const removeStorageItem = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('Storage remove error:', error);
    return false;
  }
};

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

export const SESSION_TYPES = {
  VIDEO: 'video',
  VOICE: 'voice', 
  CHAT: 'chat',
  IN_PERSON: 'in_person'
};

export const SESSION_STATUSES = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED_BY_MENTEE: 'cancelled_by_mentee',
  CANCELLED_BY_MENTOR: 'cancelled_by_mentor',
  NO_SHOW_MENTEE: 'no_show_mentee',
  NO_SHOW_MENTOR: 'no_show_mentor',
  DISPUTED: 'disputed',
  REFUNDED: 'refunded'
};

export const USER_ROLES = {
  MENTEE: 'mentee',
  MENTOR: 'mentor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

export const BADGE_LEVELS = {
  BRONZE: 'bronze',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
  DIAMOND: 'diamond'
};

export const FILE_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DOCUMENT: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  VIDEO: ['video/mp4', 'video/webm', 'video/ogg']
};

// Export default object with all helpers for convenience
export default {
  // Date helpers
  formatDate,
  formatTime,
  formatDateTime,
  getRelativeTime,
  isToday,
  isTomorrow,
  calculateDuration,
  
  // String helpers
  capitalizeFirst,
  toTitleCase,
  slugify,
  truncateString,
  getInitials,
  generateRandomString,
  
  // Validation helpers
  isValidEmail,
  isValidPhone,
  isValidUrl,
  validatePasswordStrength,
  
  // Number helpers
  formatCurrency,
  formatNumber,
  calculatePercentage,
  randomBetween,
  
  // Array helpers
  removeDuplicates,
  groupBy,
  sortBy,
  deepClone,
  
  // Mentoring helpers
  calculateSessionPrice,
  getSessionStatusBadge,
  canJoinSession,
  canCancelSession,
  calculateRefund,
  generateMeetingRoomName,
  
  // File helpers
  isValidFileType,
  isValidFileSize,
  formatFileSize,
  getFileExtension,
  
  // Error helpers
  handleApiError,
  safeJsonParse,
  debounce,
  throttle,
  
  // Storage helpers
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  
  // Constants
  SESSION_TYPES,
  SESSION_STATUSES,
  USER_ROLES,
  BADGE_LEVELS,
  FILE_TYPES
};
