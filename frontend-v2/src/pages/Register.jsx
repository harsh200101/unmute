import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await register({ full_name, email, password });
      toast.success('Account created. Check your email to verify.');
      navigate('/verify-email?email=' + encodeURIComponent(email), { replace: true });
    } catch (e) {
      setErr(e.response?.data?.error || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Create your account</h1>
        <p className="text-center text-slate-600 mt-1">It takes 30 seconds.</p>

        <Card className="mt-6">
          <CardBody>
            <a
              href="/api/auth/google?next=/dashboard"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <GoogleIcon /> Continue with Google
            </a>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <span className="flex-1 h-px bg-slate-200" /> or <span className="flex-1 h-px bg-slate-200" />
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Full name" htmlFor="name">
                <Input id="name" required value={full_name} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" type="password" autoComplete="new-password" minLength={8} required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              <Button type="submit" className="w-full" loading={busy}>Create account</Button>
              <p className="text-xs text-slate-500">
                By signing up you agree to our terms. Passwords must be at least 8 characters.
              </p>
            </form>
          </CardBody>
        </Card>

        <p className="mt-4 text-sm text-slate-600 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-slate-900 underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}
