import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const ProtectedRoute = ({ 
  children, 
  requireAuth = true, 
  requiredRoles = [], 
  requireEmailVerification = false,
  requireMentorVerification = false,
  redirectTo = '/login',
  showAccessDenied = true 
}) => {
  const { user, isLoading, isAuthenticated, checkTokenValidity } = useAuth();
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState(null);

  // Real-time JWT validation
  useEffect(() => {
    const validateAccess = async () => {
      if (!requireAuth) {
        setIsValidating(false);
        return;
      }

      try {
        setIsValidating(true);
        setValidationError(null);

        // Check token validity
        const isValid = await checkTokenValidity();
        if (!isValid) {
          setValidationError('SESSION_EXPIRED');
          return;
        }

        // Role-based access control
        if (requiredRoles.length > 0 && user) {
          const userRoles = Array.isArray(user.role) ? user.role : [user.role];
          const hasRequiredRole = requiredRoles.some(role => 
            userRoles.includes(role) || userRoles.includes('super_admin')
          );
          
          if (!hasRequiredRole) {
            setValidationError('INSUFFICIENT_PERMISSIONS');
            return;
          }
        }

        // Email verification gate
        if (requireEmailVerification && user && !user.email_verified_at) {
          setValidationError('EMAIL_NOT_VERIFIED');
          return;
        }

        // Mentor verification gate
        if (requireMentorVerification && user && user.role === 'mentor') {
          if (!user.mentor_profile || user.mentor_profile.verification_status !== 'verified') {
            setValidationError('MENTOR_NOT_VERIFIED');
            return;
          }
        }

      } catch (error) {
        console.error('Access validation error:', error);
        setValidationError('VALIDATION_ERROR');
      } finally {
        setIsValidating(false);
      }
    };

    if (!isLoading) {
      validateAccess();
    }
  }, [
    user, 
    isLoading, 
    isAuthenticated, 
    requireAuth, 
    requiredRoles, 
    requireEmailVerification, 
    requireMentorVerification,
    checkTokenValidity
  ]);

  // Show loading spinner during initial auth check or validation
  if (isLoading || isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <LoadingSpinner size="lg" variant="gradient" />
          <p className="text-gray-600 mt-4 font-medium">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Handle authentication requirement
  if (requireAuth && !isAuthenticated) {
    // Smart redirect: save current location for post-login redirect
    return (
      <Navigate 
        to={redirectTo} 
        state={{ 
          from: location.pathname + location.search,
          message: 'Please log in to access this page'
        }} 
        replace 
      />
    );
  }

  // Handle validation errors with beautiful error states
  if (validationError && showAccessDenied) {
    return <AccessDeniedPage error={validationError} userRole={user?.role} />;
  }

  // Handle validation errors with simple redirect
  if (validationError && !showAccessDenied) {
    const getRedirectPath = () => {
      switch (validationError) {
        case 'EMAIL_NOT_VERIFIED':
          return '/verify-email';
        case 'MENTOR_NOT_VERIFIED':
          return '/mentor/verification-pending';
        case 'INSUFFICIENT_PERMISSIONS':
          return '/unauthorized';
        default:
          return redirectTo;
      }
    };

    return <Navigate to={getRedirectPath()} replace />;
  }

  // Render protected content
  return children;
};

// Beautiful Access Denied Component
const AccessDeniedPage = ({ error, userRole }) => {
  const getErrorContent = () => {
    switch (error) {
      case 'SESSION_EXPIRED':
        return {
          icon: '🔐',
          title: 'Session Expired',
          message: 'Your session has expired for security reasons. Please log in again.',
          actionText: 'Log In',
          actionPath: '/login',
          bgGradient: 'from-red-50 to-pink-100',
          iconBg: 'bg-red-100 text-red-600'
        };

      case 'EMAIL_NOT_VERIFIED':
        return {
          icon: '📧',
          title: 'Email Verification Required',
          message: 'Please verify your email address to access this feature. Check your inbox for the verification link.',
          actionText: 'Verify Email',
          actionPath: '/verify-email',
          bgGradient: 'from-amber-50 to-orange-100',
          iconBg: 'bg-amber-100 text-amber-600'
        };

      case 'MENTOR_NOT_VERIFIED':
        return {
          icon: '👨‍🏫',
          title: 'Mentor Verification Pending',
          message: 'Your mentor application is under review. You\'ll receive an email once it\'s approved.',
          actionText: 'View Status',
          actionPath: '/mentor/verification-status',
          bgGradient: 'from-blue-50 to-indigo-100',
          iconBg: 'bg-blue-100 text-blue-600'
        };

      case 'INSUFFICIENT_PERMISSIONS':
        return {
          icon: '🚫',
          title: 'Access Restricted',
          message: `This area is restricted to ${userRole === 'mentee' ? 'mentors and administrators' : 'administrators'} only.`,
          actionText: 'Go Home',
          actionPath: '/dashboard',
          bgGradient: 'from-purple-50 to-violet-100',
          iconBg: 'bg-purple-100 text-purple-600'
        };

      default:
        return {
          icon: '⚠️',
          title: 'Access Error',
          message: 'There was an error verifying your access permissions. Please try again.',
          actionText: 'Retry',
          actionPath: '/dashboard',
          bgGradient: 'from-gray-50 to-slate-100',
          iconBg: 'bg-gray-100 text-gray-600'
        };
    }
  };

  const errorContent = getErrorContent();

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br ${errorContent.bgGradient} px-4`}>
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center border border-white/20 backdrop-blur-sm">
          {/* Icon */}
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${errorContent.iconBg} mb-6`}>
            <span className="text-2xl">{errorContent.icon}</span>
          </div>
          
          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {errorContent.title}
          </h1>
          
          {/* Message */}
          <p className="text-gray-600 mb-8 leading-relaxed">
            {errorContent.message}
          </p>
          
          {/* Action Buttons */}
          <div className="space-y-4">
            <button
              onClick={() => window.location.href = errorContent.actionPath}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            >
              {errorContent.actionText}
            </button>
            
            <button
              onClick={() => window.history.back()}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all duration-200"
            >
              Go Back
            </button>
          </div>
          
          {/* Help Link */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Need help?{' '}
              <a href="/support" className="text-blue-600 hover:text-blue-700 font-medium">
                Contact Support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtectedRoute;
