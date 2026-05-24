import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth as authApi } from '../api/endpoints.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialEmail = params.get('email') || '';
  const initialToken = params.get('token') || '';

  const [status, setStatus] = useState(initialToken ? 'verifying' : 'idle');
  const [error, setError] = useState(null);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialToken) return;
    let cancelled = false;
    (async () => {
      try {
        await authApi.verifyEmail(initialToken);
        if (!cancelled) {
          setStatus('verified');
          toast.success('Email verified. You can sign in now.');
          setTimeout(() => navigate('/login', { replace: true }), 1200);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('failed');
          setError(e.response?.data?.error || 'Verification failed');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [initialToken, navigate]);

  async function resend(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.resendVerification(email);
      toast.success('If that email is registered, a fresh link is on its way.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not resend');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Verify your email</h1>

        <Card className="mt-6">
          <CardBody className="space-y-4">
            {status === 'verifying' && <p className="text-slate-600">Verifying your link…</p>}
            {status === 'verified' && <p className="text-emerald-700">✓ Verified. Redirecting to sign in…</p>}
            {status === 'failed' && (
              <p className="text-rose-700">{error || 'This link is no longer valid.'}</p>
            )}
            {status === 'idle' && (
              <p className="text-slate-600">
                We sent a verification link to your email. Click it to activate your account.
              </p>
            )}

            <form onSubmit={resend} className="space-y-3 pt-2 border-t border-slate-200">
              <Field label="Didn't get it? Resend to:" htmlFor="email">
                <Input id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Button type="submit" variant="secondary" className="w-full" loading={busy}>
                Resend verification email
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-600">
          <Link to="/login" className="underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
