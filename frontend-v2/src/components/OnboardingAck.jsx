import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Heart, LifeBuoy, ShieldAlert } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { me as meApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';

// One-time acknowledgement that unmute is not licensed care. Shown on first
// dashboard visit for a mentee (and an existing user who hasn't acknowledged
// yet). Persistence: `preferences.acknowledged_not_clinical_at` (ISO string).
//
// Mentors are exempt — they sign a stricter mentor TOS at apply time and
// know the model by the time they're on dashboard.
export default function OnboardingAck() {
  const { user, reloadMe } = useAuth();
  const [open, setOpen] = useState(false);
  const [understand, setUnderstand] = useState(false);
  const [busy, setBusy] = useState(false);

  // Show only for mentees who haven't acknowledged yet.
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'mentee') return;
    const acked = user.preferences?.acknowledged_not_clinical_at;
    if (!acked) setOpen(true);
  }, [user]);

  async function accept() {
    if (!understand) return;
    setBusy(true);
    try {
      await meApi.patch({
        preferences: {
          ...(user.preferences || {}),
          acknowledged_not_clinical_at: new Date().toISOString(),
        },
      });
      await reloadMe();
      setOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save acknowledgement');
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={() => {}} title={null} dismissible={false}>
      <div className="max-w-md">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
            <ShieldAlert size={20} />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Before you book</p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">A quick heads-up</h2>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            unmute is a <strong>peer mentoring &amp; guidance</strong> platform. Our mentors are real,
            caring people — but they are <strong>not</strong> licensed therapists, counsellors,
            psychologists, or psychiatrists.
          </p>
          <p>
            What we are: someone to talk to. A space to think out loud. Guidance from
            people who've been through it.
          </p>
          <p>
            What we're <strong>not</strong>: medical, psychological, or psychiatric care.
            No diagnoses. No prescriptions. No outcome promises.
          </p>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200/70 dark:border-rose-500/30 px-3 py-2.5 text-rose-900 dark:text-rose-200 text-sm">
            <p className="font-medium inline-flex items-center gap-1.5">
              <LifeBuoy size={14} /> If you're in crisis right now
            </p>
            <p className="mt-1 text-xs">
              Please use the{' '}
              <Link to="/crisis" className="underline font-semibold" onClick={() => setOpen(false)}>
                crisis resources
              </Link>
              {' '}— professional, 24×7, free.
            </p>
          </div>
        </div>

        <label className="mt-5 flex items-start gap-2.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={understand}
            onChange={(e) => setUnderstand(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700 dark:text-slate-300">
            I understand unmute is peer mentorship and <strong>not a substitute</strong> for licensed care.
          </span>
        </label>

        <div className="mt-5 flex justify-end items-center gap-3">
          <Link to="/terms" target="_blank" className="text-xs text-slate-500 dark:text-slate-400 hover:underline">
            Read full terms
          </Link>
          <Button onClick={accept} loading={busy} disabled={!understand}>
            <Heart size={14} /> I understand — continue
          </Button>
        </div>
      </div>
    </Modal>
  );
}
