import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { auth as authApi } from '../api/endpoints.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.forgotPassword(email);
      setDone(true);
      toast.success('If that email exists, a reset link is on the way.');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send reset');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 text-center">Forgot your password?</h1>
        <p className="text-center text-slate-600 mt-1">We'll email you a reset link.</p>

        <Card className="mt-6">
          <CardBody>
            {done ? (
              <p className="text-slate-700">
                If <strong>{email}</strong> is registered, a reset link has been sent. Check your inbox.
              </p>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <Field label="Your email" htmlFor="email">
                  <Input id="email" type="email" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
