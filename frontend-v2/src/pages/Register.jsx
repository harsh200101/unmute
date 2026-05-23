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
