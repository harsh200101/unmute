import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth as authApi } from '../api/endpoints.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, PasswordInput } from '../components/ui/Field.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success('Password reset. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (e) {
      setErr(e.response?.data?.error || 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Set a new password</h1>
        <Card className="mt-6">
          <CardBody>
            {!token ? (
              <p className="text-rose-700">No reset token in this link. Request a new one.</p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <Field label="New password" htmlFor="pw">
                  <PasswordInput id="pw" autoComplete="new-password" minLength={8} required
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Field label="Confirm new password" htmlFor="pw2">
                  <PasswordInput id="pw2" autoComplete="new-password" minLength={8} required
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
                {err && <p className="text-sm text-rose-600">{err}</p>}
                <Button type="submit" className="w-full" loading={busy}>Reset password</Button>
              </form>
            )}
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-sm">
          <Link to="/forgot-password" className="underline">Request a new link</Link>
        </p>
      </div>
    </div>
  );
}
