import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck, MailWarning, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth as authApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from './ui/Card.jsx';
import Button from './ui/Button.jsx';

/**
 * Email verification status + resend control.
 *
 * Why this exists: the mentee profile page (/me/profile) had no verification
 * awareness at all, and the dashboard's "Resend link" was a plain
 * <Link to="/verify-email"> that landed on a page with an EMPTY resend input
 * (the emailed link carried no ?email= param). A mentee who lost the original
 * email had nowhere to go — they had to remember and retype their own address.
 *
 * This card is self-contained: it always knows the signed-in user's address
 * (from the auth context, never a typed field), so "resend" is always one click.
 */
export default function EmailVerificationCard({ className }) {
  const { user, reloadMe } = useAuth();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  if (!user?.email) return null;

  const verified = !!user.email_verified;

  async function resend() {
    setSending(true);
    try {
      await authApi.resendVerification(user.email);
      setSentTo(user.email);
      toast.success('Verification email sent');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not send verification email');
    } finally {
      setSending(false);
    }
  }

  // The user clicks the emailed link in another tab; re-fetch /me so the card
  // flips to "verified" without them having to sign out and back in.
  async function checkAgain() {
    setChecking(true);
    try {
      await reloadMe();
    } catch (e) {
      toast.error('Could not refresh your status');
    } finally {
      setChecking(false);
    }
  }

  if (verified) {
    return (
      <Card className={className}>
        <CardBody className="flex items-start gap-3">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Email verified</h2>
            <p className="text-sm text-muted-foreground mt-0.5 break-words">
              {user.email} is confirmed. Booking and mentor applications are unlocked.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your email <strong className="text-foreground break-words">{user.email}</strong> is
              not confirmed yet. Verification is required before you can book a session or apply
              to mentor.
            </p>
          </div>
        </div>

        {sentTo ? (
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3">
            <p className="text-sm text-emerald-900 dark:text-emerald-100">
              ✓ Sent to <strong className="break-words">{sentTo}</strong>
            </p>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-1">
              Check your inbox <strong>and spam folder</strong> — the first email from a new sender
              often lands in spam. Click the link inside, then tap “I've verified”.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={resend} loading={sending} size="sm">
            <Send className="h-4 w-4" />
            {sentTo ? 'Resend verification email' : 'Send verification email'}
          </Button>
          <Button variant="secondary" size="sm" onClick={checkAgain} loading={checking}>
            I've verified — check again
          </Button>
          <Link
            to={`/verify-email?email=${encodeURIComponent(user.email)}`}
            className="inline-flex items-center text-sm underline self-center"
          >
            Open verification page
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
