import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader, CardFooter } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Label } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatPerMinute } from '../lib/format.js';

export default function MentorApply() {
  const { user, reloadMe } = useAuth();
  const navigate = useNavigate();

  const [tiers, setTiers] = useState([]);
  const [tags, setTags] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);

  // Form state
  const [pricing_tier_id, setTier] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years_experience, setYears] = useState(0);
  const [linkedin_url, setLinkedin] = useState('');
  const [languages, setLanguages] = useState('en');
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([catalog.tiers(), catalog.tags(), mentorsApi.getMine().catch(() => null)])
      .then(([t, g, mine]) => {
        if (cancelled) return;
        setTiers(t.items);
        setTags(g.items);
        if (mine?.mentor) setExisting(mine.mentor);
      })
      .finally(() => { if (!cancelled) setLoadingInit(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleTag(id) {
    const next = new Set(selectedTags);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedTags(next);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!pricing_tier_id) { setErr('Pick a pricing tier'); return; }
    if (!headline.trim() || !bio.trim()) { setErr('Headline and bio are required'); return; }

    setBusy(true);
    try {
      const langs = languages.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await mentorsApi.apply({
        pricing_tier_id: Number(pricing_tier_id),
        headline: headline.trim(),
        bio: bio.trim(),
        years_experience: Number(years_experience) || 0,
        linkedin_url: linkedin_url.trim() || null,
        languages: langs.length ? langs : ['en'],
        tag_ids: [...selectedTags],
      });
      toast.success('Application submitted. Admin will review shortly.');
      await reloadMe();
      navigate('/dashboard');
    } catch (e) {
      setErr(e.response?.data?.error || 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  if (loadingInit) return <PageSpinner />;

  if (existing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Card>
          <CardBody className="text-center">
            <h1 className="text-xl font-bold text-slate-900">You're already a mentor here</h1>
            <p className="mt-1 text-slate-600">
              Your mentor profile is currently <strong>{existing.verification_status}</strong>.
            </p>
            <Button className="mt-4" onClick={() => navigate('/mentor/profile')}>
              Manage mentor profile
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!user?.email_verified) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Card><CardBody className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Verify your email first</h1>
          <p className="mt-1 text-slate-600">Mentor applications require a verified email address.</p>
          <Button className="mt-4" onClick={() => navigate('/verify-email')}>Verify email</Button>
        </CardBody></Card>
      </div>
    );
  }

  const expertise = tags.filter((t) => t.kind === 'expertise');
  const industries = tags.filter((t) => t.kind === 'industry');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Apply to mentor</h1>
      <p className="text-slate-600 mt-1">
        Tell us about yourself. Admin reviews each application within 1-2 business days.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Pricing</h2>
            <p className="text-xs text-slate-500 mt-1">Pick a tier. Mentees pay per minute while you're both in the call.</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {tiers.map((t) => (
              <label
                key={t.id}
                className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-3 cursor-pointer ${
                  String(t.id) === String(pricing_tier_id) ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio" name="tier" value={t.id}
                    checked={String(t.id) === String(pricing_tier_id)}
                    onChange={() => setTier(t.id)}
                  />
                  <div>
                    <div className="font-medium">{t.display_name}</div>
                    <div className="text-xs text-slate-500">You earn 70% of every minute.</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatPerMinute(t.per_minute_paise)}</div>
                  <div className="text-xs text-emerald-700">~₹{(t.per_minute_paise * 0.7 / 100).toFixed(0)}/min to you</div>
                </div>
              </label>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold text-slate-900">Profile</h2></CardHeader>
          <CardBody className="space-y-4">
            <Field label="Headline" htmlFor="headline">
              <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
                placeholder="Senior PM @ Stripe — career coaching for product folks" required />
            </Field>
            <Field label="Bio" htmlFor="bio">
              <textarea
                id="bio"
                rows={6}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your background, what you can help with, who you've worked with..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                required
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Years of experience" htmlFor="years">
                <Input id="years" type="number" min={0} max={70} value={years_experience}
                  onChange={(e) => setYears(e.target.value)} />
              </Field>
              <Field label="Languages (comma-sep, ISO codes)" htmlFor="langs">
                <Input id="langs" value={languages} onChange={(e) => setLanguages(e.target.value)}
                  placeholder="en, hi" />
              </Field>
            </div>
            <Field label="LinkedIn URL (optional)" htmlFor="li">
              <Input id="li" type="url" value={linkedin_url} onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/yourname" />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Expertise tags</h2>
            <p className="text-xs text-slate-500 mt-1">Pick anything that fits. Mentees use these to filter.</p>
          </CardHeader>
          <CardBody className="space-y-4">
            <TagGroup title="Expertise" items={expertise} selected={selectedTags} toggle={toggleTag} />
            <TagGroup title="Industries" items={industries} selected={selectedTags} toggle={toggleTag} />
          </CardBody>
        </Card>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={busy}>Submit application</Button>
        </div>
      </form>
    </div>
  );
}

function TagGroup({ title, items, selected, toggle }) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => {
          const isOn = selected.has(t.id);
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                isOn
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
              }`}
            >
              {t.display_name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
