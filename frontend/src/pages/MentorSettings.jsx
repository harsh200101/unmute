import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Label } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatPerMinute } from '../lib/format.js';

// Mentor self-edit page. Distinct from MentorApply (one-time creation):
// this page expects an existing mentor profile and lets the mentor change
// pricing tier, headline/bio, languages, years, LinkedIn, and tags any time.

export default function MentorSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [tiers, setTiers]       = useState([]);
  const [allTags, setAllTags]   = useState([]);
  const [mentor, setMentor]     = useState(null);

  // Editable form state
  const [pricing_tier_id, setTier] = useState('');
  const [headline, setHeadline]    = useState('');
  const [bio, setBio]              = useState('');
  const [years, setYears]          = useState(0);
  const [linkedin, setLinkedin]    = useState('');
  const [languagesStr, setLangs]   = useState('en');
  const [selectedTags, setSelTags] = useState(new Set());
  const [saving, setSaving]        = useState(false);
  const [err, setErr]              = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      catalog.tiers(),
      catalog.tags(),
      mentorsApi.getMine().catch(() => null),
    ]).then(([t, g, mine]) => {
      if (cancelled) return;
      setTiers(t.items || []);
      setAllTags(g.items || []);
      if (mine?.mentor) {
        const m = mine.mentor;
        setMentor(m);
        setTier(String(m.pricing_tier?.id || ''));
        setHeadline(m.headline || '');
        setBio(m.bio || '');
        setYears(m.years_experience || 0);
        setLinkedin(m.linkedin_url || '');
        setLangs((m.languages || ['en']).join(', '));
        setSelTags(new Set((m.tags || []).map((tg) => tg.id)));
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const expertise = useMemo(() => allTags.filter((t) => t.kind === 'expertise'), [allTags]);
  const audience  = useMemo(() => allTags.filter((t) => t.kind === 'audience'),  [allTags]);

  function toggleTag(id) {
    const next = new Set(selectedTags);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelTags(next);
  }

  async function save(e) {
    e.preventDefault();
    setErr(null);
    if (!pricing_tier_id)      return setErr('Pick a pricing tier');
    if (!headline.trim())      return setErr('Headline is required');
    if (!bio.trim())           return setErr('Bio is required');

    setSaving(true);
    try {
      const langs = languagesStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      await mentorsApi.patchMine({
        pricing_tier_id: Number(pricing_tier_id),
        headline: headline.trim(),
        bio: bio.trim(),
        years_experience: Number(years) || 0,
        linkedin_url: linkedin.trim() || null,
        languages: langs.length ? langs : ['en'],
        tag_ids: [...selectedTags],
      });
      toast.success('Mentor profile updated');
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) return <PageSpinner />;

  if (!mentor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Card><CardBody className="text-center">
          <h1 className="text-xl font-bold text-slate-900">You're not a mentor yet</h1>
          <p className="mt-1 text-slate-600">Apply first — admin reviews each profile.</p>
          <Button className="mt-4" onClick={() => navigate('/mentor/apply')}>Apply to mentor</Button>
        </CardBody></Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Mentor settings</h1>
        <p className="text-slate-600 mt-1">
          Update your pricing, profile, languages, and categories. Changes go live immediately.
        </p>
        <div className="mt-2">
          <StatusPill status={mentor.verification_status} />
        </div>
      </header>

      <form onSubmit={save} className="space-y-6">
        {/* --- Pricing tier --- */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Pricing</h2>
            <p className="text-xs text-slate-500 mt-1">
              Choose the tier that fits your training and experience. You earn 70% of every minute billed.
            </p>
          </CardHeader>
          <CardBody className="space-y-2">
            {tiers.map((t) => {
              const checked = String(t.id) === String(pricing_tier_id);
              return (
                <label
                  key={t.id}
                  className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-3 cursor-pointer ${
                    checked ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input type="radio" name="tier" value={t.id} checked={checked}
                      onChange={() => setTier(String(t.id))} />
                    <div>
                      <div className="font-medium">{t.display_name}</div>
                      <div className="text-xs text-slate-500">You earn 70% of every minute.</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatPerMinute(t.per_minute_paise)}</div>
                    <div className="text-xs text-emerald-700">
                      ~₹{(t.per_minute_paise * 0.7 / 100).toFixed(0)}/min to you
                    </div>
                  </div>
                </label>
              );
            })}
          </CardBody>
        </Card>

        {/* --- Profile --- */}
        <Card>
          <CardHeader><h2 className="font-semibold text-slate-900">Profile</h2></CardHeader>
          <CardBody className="space-y-4">
            <Field label="Headline" htmlFor="hd">
              <Input id="hd" value={headline} onChange={(e) => setHeadline(e.target.value)} required
                placeholder="Career mentor — transitions, confidence, public speaking" />
            </Field>
            <Field label="Bio" htmlFor="bio">
              <textarea id="bio" rows={6} value={bio} onChange={(e) => setBio(e.target.value)} required
                placeholder="Share your background, what you mentor on, your approach…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Years of experience" htmlFor="yr">
                <Input id="yr" type="number" min={0} max={70} value={years}
                  onChange={(e) => setYears(e.target.value)} />
              </Field>
              <Field label="Languages (comma-separated ISO codes)" htmlFor="lg">
                <Input id="lg" value={languagesStr} onChange={(e) => setLangs(e.target.value)}
                  placeholder="en, hi, mr" />
              </Field>
            </div>
            <Field label="LinkedIn URL (optional)" htmlFor="li">
              <Input id="li" type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/yourname" />
            </Field>
          </CardBody>
        </Card>

        {/* --- Tags --- */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Categories</h2>
            <p className="text-xs text-slate-500 mt-1">
              Mentees use these to find you. Pick anything that fits.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <TagGroup title="What you help with" items={expertise} selected={selectedTags} toggle={toggleTag} />
            <TagGroup title="Who you serve"      items={audience}  selected={selectedTags} toggle={toggleTag} />
          </CardBody>
        </Card>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => navigate('/dashboard')}>Cancel</Button>
          <Button type="submit" loading={saving}>Save changes</Button>
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

function StatusPill({ status }) {
  const map = {
    approved: { label: 'Live on the platform', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending:  { label: 'Pending admin review',  cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
    rejected: { label: 'Rejected',              cls: 'bg-rose-50   text-rose-700   border-rose-200'   },
    suspended:{ label: 'Suspended',             cls: 'bg-rose-50   text-rose-700   border-rose-200'   },
  };
  const it = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${it.cls}`}>
      {it.label}
    </span>
  );
}
