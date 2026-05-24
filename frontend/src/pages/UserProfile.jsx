import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, EyeOff } from 'lucide-react';
import { me as meApi, auth as authApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, PasswordInput } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';

export default function UserProfile() {
  const { user, reloadMe } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    meApi.get()
      .then((r) => { if (!cancelled) setProfile(r.user); })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !profile) return <PageSpinner />;

  function patch(k, v) { setProfile((p) => ({ ...p, [k]: v })); }

  // Per-field "share with mentor" flag. Default = true. Stored under
  // preferences.share_with_mentor on the user.
  const share = profile.preferences?.share_with_mentor || {};
  function isShared(field) { return share[field] !== false; }
  function setShared(field, value) {
    setProfile((p) => ({
      ...p,
      preferences: {
        ...(p.preferences || {}),
        share_with_mentor: {
          ...((p.preferences || {}).share_with_mentor || {}),
          [field]: value,
        },
      },
    }));
  }

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await meApi.patch({
        full_name: profile.full_name,
        bio: profile.bio || null,
        phone: profile.phone || null,
        date_of_birth: profile.date_of_birth || null,
        gender: profile.gender || null,
        marital_status: profile.marital_status || null,
        location_city: profile.location_city || null,
        location_country: profile.location_country || 'IN',
        preferred_language: profile.preferred_language || 'en',
        preferences: profile.preferences || {},
      });
      toast.success('Profile saved');
      await reloadMe();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
      <p className="text-slate-600 mt-1">Your account details. Email and role are managed by admin.</p>

      <form onSubmit={onSave} className="mt-6 space-y-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Account</h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name" htmlFor="name">
              <Input id="name" value={profile.full_name} onChange={(e) => patch('full_name', e.target.value)} required />
            </Field>
            <Field label="Email (read-only)" htmlFor="email">
              <Input id="email" value={profile.email} disabled />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={profile.phone || ''} onChange={(e) => patch('phone', e.target.value)} placeholder="+91 ..." />
            </Field>
            <Field label="Bio" htmlFor="bio">
              <Input id="bio" value={profile.bio || ''} onChange={(e) => patch('bio', e.target.value)} placeholder="One-line tagline" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Personal</h2>
            <p className="text-xs text-slate-500 mt-1">
              All optional. Use the <strong>Share with mentor</strong> toggle on each field to control
              what your mentor sees before a session. Untoggled fields stay private to you.
            </p>
          </CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SharedField
              label="Date of birth"
              shareKey="age"
              shareLabel="Share age with mentor"
              isShared={isShared('age')}
              setShared={(v) => setShared('age', v)}
            >
              <Input id="dob" type="date" value={(profile.date_of_birth || '').slice(0, 10)}
                onChange={(e) => patch('date_of_birth', e.target.value || null)} />
            </SharedField>

            <SharedField
              label="Gender"
              shareKey="gender"
              shareLabel="Share gender with mentor"
              isShared={isShared('gender')}
              setShared={(v) => setShared('gender', v)}
            >
              <select id="gender" value={profile.gender || ''} onChange={(e) => patch('gender', e.target.value || null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other / self-describe</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </SharedField>

            <SharedField
              label="Marital status"
              shareKey="marital_status"
              shareLabel="Share marital status with mentor"
              isShared={isShared('marital_status')}
              setShared={(v) => setShared('marital_status', v)}
            >
              <select id="ms" value={profile.marital_status || ''} onChange={(e) => patch('marital_status', e.target.value || null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="single">Single</option>
                <option value="in_relationship">In a relationship</option>
                <option value="married">Married</option>
                <option value="separated">Separated</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </SharedField>

            <SharedField
              label="City"
              shareKey="city"
              shareLabel="Share city with mentor"
              isShared={isShared('city')}
              setShared={(v) => setShared('city', v)}
            >
              <Input id="city" value={profile.location_city || ''} onChange={(e) => patch('location_city', e.target.value)} />
            </SharedField>

            <Field label="Country (ISO)" htmlFor="cn">
              <Input id="cn" maxLength={2} value={profile.location_country || ''} onChange={(e) => patch('location_country', e.target.value.toUpperCase())} />
            </Field>
            <Field label="Preferred language (ISO)" htmlFor="lang">
              <Input id="lang" maxLength={5} value={profile.preferred_language || ''} onChange={(e) => patch('preferred_language', e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>

      <ChangePassword />
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (next !== confirm) return toast.error('New passwords do not match');
    if (next.length < 8) return toast.error('New password must be ≥ 8 characters');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      toast.success('Password changed');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Change failed');
    } finally { setBusy(false); }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Change password</h2>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-3 max-w-md">
          <Field label="Current password" htmlFor="cp">
            <PasswordInput id="cp" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="np">
            <PasswordInput id="np" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password" htmlFor="np2">
            <PasswordInput id="np2" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <Button type="submit" loading={busy}>Change password</Button>
        </form>
      </CardBody>
    </Card>
  );
}

// Field with an inline "Share with mentor" eye toggle. The toggle controls
// the per-field visibility flag in preferences.share_with_mentor; the actual
// data is still saved either way.
function SharedField({ label, shareLabel, isShared, setShared, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-slate-700">{label}</label>
        <button
          type="button"
          onClick={() => setShared(!isShared)}
          aria-pressed={isShared}
          title={shareLabel}
          className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
            isShared
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
          }`}
        >
          {isShared ? <Eye size={12} /> : <EyeOff size={12} />}
          {isShared ? 'Shared with mentor' : 'Hidden from mentor'}
        </button>
      </div>
      {children}
    </div>
  );
}
