import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-hot-toast';

const OAuthCallback = () => {
  const { handleOAuthCallback, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const processOAuthCallback = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Simulate progress for better UX
        setProgress(20);

        // Check for error in URL params
        const errorParam = searchParams.get('error');
        if (errorParam) {
          const errorDescription = searchParams.get('error_description') || 'OAuth authentication failed';
          throw new Error(decodeURIComponent(errorDescription));
        }

        setProgress(40);

        // Check required parameters
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        
        if (!code) {
          throw new Error('Authorization code not found in callback');
        }

        if (!state) {
          throw new Error('State parameter missing from callback');
        }

        setProgress(60);

        // Process OAuth callback through AuthContext
        const result = await handleOAuthCallback(searchParams);
        
        setProgress(80);

        if (result.success) {
          setProgress(100);
          
          // Small delay for smooth UX
          setTimeout(() => {
            // Redirect to intended destination or dashboard
            const redirectTo = localStorage.getItem('oauth_redirect') || '/dashboard';
            localStorage.removeItem('oauth_redirect');
            navigate(redirectTo, { replace: true });
          }, 1000);
        } else {
          throw new Error(result.error || 'OAuth login failed');
        }

      } catch (err) {
        console.error('OAuth callback error:', err);
        setError(err.message || 'Authentication failed');
        setLoading(false);
        
        // Show error toast
        toast.error(err.message || 'Login failed. Please try again.');
      }
    };

    // Add slight delay to prevent flash
    const timeoutId = setTimeout(processOAuthCallback, 500);

    return () => clearTimeout(timeoutId);
  }, [searchParams, handleOAuthCallback, navigate, isAuthenticated]);

  // Handle retry
  const handleRetry = () => {
    window.location.href = '/login';
  };

  // Handle manual redirect to login
  const handleBackToLogin = () => {
    // Clear any stored OAuth state
    localStorage.removeItem('oauth_state');
    localStorage.removeItem('oauth_redirect');
    
    window.location.href = '/login';
  };

  if (loading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center max-w-md mx-auto px-6">
          {/* Logo/Brand */}
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-8">
            <span className="text-white text-2xl font-bold">U</span>
          </div>

          {/* Main Loading Spinner */}
          <div className="mb-6">
            <LoadingSpinner size="xl" variant="gradient" />
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
            <div 
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {/* Status Messages */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">
              Completing Sign In
            </h2>
            <p className="text-gray-600">
              {progress <= 40 && "Verifying your credentials..."}
              {progress > 40 && progress <= 60 && "Authenticating with Google..."}
              {progress > 60 && progress <= 80 && "Setting up your account..."}
              {progress > 80 && "Almost done..."}
            </p>
          </div>

          {/* Security Note */}
          <div className="mt-8 p-4 bg-white/50 backdrop-blur-sm rounded-xl border border-white/20">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Secure authentication in progress</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-pink-50 to-orange-50">
        <div className="text-center max-w-md mx-auto px-6">
          {/* Error Icon */}
          <div className="mx-auto h-16 w-16 bg-red-100 rounded-2xl flex items-center justify-center mb-8">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>

          {/* Error Content */}
          <div className="space-y-4 mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Authentication Failed
            </h1>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-800 text-sm font-medium">
                {error}
              </p>
            </div>
            <p className="text-gray-600">
              There was an issue completing your sign-in. This might be due to:
            </p>
          </div>

          {/* Error Reasons */}
          <div className="text-left mb-8 bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Cancelled authentication process
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Network connectivity issues
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Temporary server problem
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                Invalid authentication state
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] shadow-lg hover:shadow-xl"
            >
              Try Again
            </button>
            
            <button
              onClick={handleBackToLogin}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-xl border border-gray-300 transition-colors"
            >
              Back to Login
            </button>
          </div>

          {/* Help Link */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Still having trouble?{' '}
              <a 
                href="/contact" 
                className="text-blue-600 hover:text-blue-700 font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact Support
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // This should not render as we redirect immediately on success
  return null;
};

export default OAuthCallback;
