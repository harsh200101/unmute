import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Check, Globe2, Briefcase } from 'lucide-react';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Label } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatPerMinute } from '../lib/format.js';

const COMMON_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hinglish', label: 'Hinglish' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'kn', label: 'Kannada' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ml', label: 'Malayalam' },
];

const EXP_OPTIONS = [
  { label: '1–2 years', value: 2 },
  { label: '3–5 years', value: 4 },
  { label: '5–8 years', value: 6 },
  { label: '8–12 years', value: 10 },
  { label: '12+ years', value: 15 },
];

const HEADLINE_SUGGESTIONS = [
  'Career Growth & Job Transitions',
  'Software Engineering & Tech Architecture',
  'Product Management & Startup Strategy',
  'College to First Job Guidance',
  'Confidence, Communication & Public Speaking',
];

export default function MentorSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [mentor, setMentor] = useState(null);

  // Editable form state
  const [pricing_tier_id, setTier] = useState('');
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPriceRupees, setCustomPriceRupees] = useState(15);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState(0);
  const [linkedin, setLinkedin] = useState('');
  const [selectedLangs, setSelectedLangs] = useState(['en']);
  const [selectedTags, setSelTags] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

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
        setSelectedLangs(m.languages && m.languages.length ? m.languages : ['en']);
        setSelTags(new Set((m.tags || []).map((tg) => tg.id)));
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const expertise = useMemo(() => allTags.filter((t) => t.kind === 'expertise'), [allTags]);
  const audience = useMemo(() => allTags.filter((t) => t.kind === 'audience'), [allTags]);

  function toggleLanguage(code) {
    if (selectedLangs.includes(code)) {
      if (selectedLangs.length === 1) {
        toast.error('Please keep at least one language.');
        return;
      }
      setSelectedLangs(selectedLangs.filter((c) => c !== code));
    } else {
      setSelectedLangs([...selectedLangs, code]);
    }
  }

  function toggleTag(id) {
    const next = new Set(selectedTags);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelTags(next);
  }

  function fillBioTemplate() {
    const expText = years > 0 ? `${years}+` : 'several';
    setBio(
      `Hi! I have ${expText} years of experience in my industry. In our sessions, we can dive deep into your specific career roadmap, interview prep, or day-to-day challenges.\n\nMy approach is practical, direct, and judgement-free. Let's get you unstuck and moving forward.`
    );
    toast.success('Sample bio template inserted!');
  }

  async function save(e) {
    e.preventDefault();
    setErr(null);
    if (!pricing_tier_id && !isCustomPrice) return setErr('Pick a pricing option');
    if (!headline.trim()) return setErr('Headline is required');
    if (!bio.trim()) return setErr('Bio is required');

    setSaving(true);
    try {
      let effectiveTierId = pricing_tier_id;
      if (isCustomPrice) {
        const targetPaise = customPriceRupees * 100;
        let closest = tiers[0];
        let minDiff = Infinity;
        for (const t of tiers) {
          const diff = Math.abs(t.per_minute_paise - targetPaise);
          if (diff < minDiff) {
            minDiff = diff;
            closest = t;
          }
        }
        effectiveTierId = closest?.id || pricing_tier_id;
      }

      await mentorsApi.patchMine({
        pricing_tier_id: Number(effectiveTierId),
        headline: headline.trim(),
        bio: bio.trim(),
        years_experience: Number(years) || 0,
        linkedin_url: linkedin.trim() || null,
        languages: selectedLangs.length ? selectedLangs : ['en'],
        tag_ids: [...selectedTags],
      });
      toast.success('Mentor profile updated successfully');
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) return <PageSpinner />;

  if (!mentor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Card><CardBody className="text-center">
          <h1 className="text-xl font-bold text-foreground">You're not a mentor yet</h1>
          <p className="mt-1 text-muted-foreground">Apply first - admin reviews each profile.</p>
          <Button className="mt-4" onClick={() => navigate('/mentor/apply')}>Apply to mentor</Button>
        </CardBody></Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Mentor settings</h1>
        <p className="text-muted-foreground mt-1">
          Update your pricing, profile, specialties, and audience. Changes go live immediately.
        </p>
        <div className="mt-2">
          <StatusPill status={mentor.verification_status} />
        </div>
      </header>

      <form onSubmit={save} className="space-y-6">
        {/* --- Pricing tier --- */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-foreground">Pricing</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Choose your rate. You earn 70% of every minute billed.
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiers.map((t) => {
                const checked = !isCustomPrice && String(t.id) === String(pricing_tier_id);
                const rateRupees = t.per_minute_paise / 100;
                return (
                  <div
                    key={t.id}
                    onClick={() => { setIsCustomPrice(false); setTier(String(t.id)); }}
                    className={`flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-all ${
                      checked
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-foreground">{t.display_name}</div>
                      <div className="text-xs text-muted-foreground">₹{rateRupees * 60}/hr equivalent</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                        ~₹{(rateRupees * 0.7).toFixed(1)}/min to you
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-foreground">₹{rateRupees}/min</div>
                    </div>
                  </div>
                );
              })}

              {/* Custom rate */}
              <div
                onClick={() => setIsCustomPrice(true)}
                className={`p-3.5 border rounded-xl cursor-pointer transition-all ${
                  isCustomPrice
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground">Custom Rate</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary">Custom</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Enter your exact per-minute amount</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                  ~₹{(customPriceRupees * 0.7).toFixed(1)}/min to you
                </div>
              </div>
            </div>

            {isCustomPrice && (
              <div className="p-4 rounded-xl border border-border bg-muted/30 mt-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Custom Rate:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-bold text-primary">₹{customPriceRupees}</span>
                    <span className="text-xs text-muted-foreground">/ minute</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={customPriceRupees}
                  onChange={(e) => setCustomPriceRupees(Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                  <span>₹5/min</span>
                  <span>₹25/min</span>
                  <span>₹50/min</span>
                  <span>₹75/min</span>
                  <span>₹100/min</span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* --- Profile --- */}
        <Card>
          <CardHeader><h2 className="font-semibold text-foreground">Profile & Specialties</h2></CardHeader>
          <CardBody className="space-y-5">
            <div>
              <Field label="Headline" htmlFor="hd">
                <Input
                  id="hd"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  required
                  placeholder="Career mentor — transitions, confidence, public speaking"
                />
              </Field>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Sparkles size={12} className="text-primary" /> Click to auto-fill headline:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HEADLINE_SUGGESTIONS.map((sug) => (
                    <button
                      type="button"
                      key={sug}
                      onClick={() => setHeadline(sug)}
                      className="px-2.5 py-1 rounded-full text-xs bg-muted hover:bg-primary/10 hover:text-primary text-foreground/80 border border-border transition-colors text-left"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Experience Pills */}
            <div>
              <Label>Years of Experience</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {EXP_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => setYears(opt.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      years === opt.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Languages Pills */}
            <div>
              <Label className="flex items-center gap-1.5">
                <Globe2 size={14} className="text-primary" /> Languages You Mentor In
              </Label>
              <p className="text-[11px] text-muted-foreground mb-2">Tap to toggle languages:</p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_LANGUAGES.map((lang) => {
                  const isSelected = selectedLangs.includes(lang.code);
                  return (
                    <button
                      type="button"
                      key={lang.code}
                      onClick={() => toggleLanguage(lang.code)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {isSelected && <Check size={12} />}
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bio with Template */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="bio">About You & Your Mentorship Approach</Label>
                <button
                  type="button"
                  onClick={fillBioTemplate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles size={13} /> Auto-fill template
                </button>
              </div>
              <textarea
                id="bio"
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                required
                placeholder="Share your background, what you mentor on, your approach…"
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Field label="LinkedIn URL (optional)" htmlFor="li">
              <Input
                id="li"
                type="url"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/yourname"
              />
            </Field>
          </CardBody>
        </Card>

        {/* --- Categories with Clarified Labels --- */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-foreground">Mentorship Topics & Target Audience</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Mentees use these to find and match with you. Pick anything that fits.
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <TagGroup
              title="Topics & Skills You Guide On"
              subtitle="The specific domains, subjects, and skills you advise on."
              items={expertise}
              selected={selectedTags}
              toggle={toggleTag}
            />
            <TagGroup
              title="Who This Mentorship Is For"
              subtitle="The target groups of people who benefit most from your sessions."
              items={audience}
              selected={selectedTags}
              toggle={toggleTag}
            />
          </CardBody>
        </Card>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => navigate('/dashboard')}>Cancel</Button>
          <Button type="submit" loading={saving}>Save changes</Button>
        </div>
      </form>
    </div>
  );
}

function TagGroup({ title, subtitle, items, selected, toggle }) {
  return (
    <div className="bg-muted/30 border border-border p-4 rounded-xl">
      <div className="mb-2.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => {
          const isOn = selected.has(t.id);
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                isOn
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card text-foreground border-border hover:border-primary/50'
              }`}
            >
              {isOn ? '✓ ' : '+ '}
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
    pending: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
    suspended: { label: 'Suspended', cls: 'bg-slate-100 text-slate-800 border-slate-200' },
  };
  const it = map[status] || { label: status, cls: 'bg-muted text-foreground border-border' };
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${it.cls}`}>
      {it.label}
    </span>
  );
}
