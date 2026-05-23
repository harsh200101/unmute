import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await login(email, password);
      toast.success('Welcome back');
      navigate(next, { replace: true });
    } catch (e) {
      setErr(e.response?.data?.error || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Welcome back</h1>
        <p className="text-center text-slate-600 mt-1">Sign in to continue.</p>

        <Card className="mt-6">
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Email" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Password" htmlFor="password">
                <Input id="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
            </form>
          </CardBody>
        </Card>

        <div className="mt-4 flex justify-between text-sm text-slate-600">
          <Link to="/forgot-password" className="hover:text-slate-900 underline">Forgot password?</Link>
          <Link to="/register" className="hover:text-slate-900 underline">Create account</Link>
        </div>
      </div>
    </div>
  );
}
