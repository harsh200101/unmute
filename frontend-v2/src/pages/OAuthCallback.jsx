import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { auth as authApi, me as meApi } from '../api/endpoints.js';
import { setAccessToken } from '../api/client.js';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';

// Landing page the backend redirects to after Google OAuth.
// Backend has already set the refresh cookie. We just need to mint an access
// token + hydrate the user, then bounce to the requested next URL.

const ERROR_MESSAGES = {
  google_not_configured: 'Google sign-in is not configured on this server.',
  google_email_unverified: 'Your Google email is not verified by Google.',
  invalid_state: 'The login link expired or was tampered with. Please try again.',
  missing_code_or_state: 'Google did not return the expected parameters.',
  google_oauth_failed: 'Something went wrong signing in with Google.',
  access_denied: 'You declined the Google sign-in.',
};

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [error, setError] = useState(params.get('error'));

  useEffect(() => {
    if (params.get('error')) return; // already showing error
    let cancelled = false;
    (async () => {
      try {
        const r = await authApi.refresh();
        if (cancelled) return;
        setAccessToken(r.access_token);
        const m = await meApi.get();
        applySession({ access_token: r.access_token, user: m.user });
        const next = params.get('next') || '/dashboard';
        navigate(next, { replace: true });
      } catch (e) {
        if (!cancelled) setError('refresh_failed');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">Sign-in failed</h1>
          <p className="mt-2 text-slate-600">
            {ERROR_MESSAGES[error] || 'Something went wrong. Please try again.'}
          </p>
          <Link to="/login" className="inline-block mt-5">
            <Button>Back to sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  return <PageSpinner />;
}
