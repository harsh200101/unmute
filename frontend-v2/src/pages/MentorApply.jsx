import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowUpRight } from 'lucide-react';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Label } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import MultiStepForm from '../components/ui/multi-step-form.jsx';
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
  const [agreedToMentorTOS, setAgreedToMentorTOS] = useState(false);

  // Wizard state — 4 steps: Pricing → Profile → Areas → Mentor terms.
  const TOTAL_STEPS = 4;
  const [step, setStep] = useState(1);

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

  // Per-step validation. Returns an error string (block) or null (advance).
  function validateStep(s) {
    if (s === 1 && !pricing_tier_id)                return 'Pick a pricing tier.';
    if (s === 2 && (!headline.trim() || !bio.trim())) return 'Headline and bio are required.';
    if (s === 4 && !agreedToMentorTOS)              return 'Please confirm the mentor terms.';
    return null;
  }

  async function submitApplication() {
    setBusy(true);
    setErr(null);
    try {
      const langs = languages.split(',').map((x) => x.trim()).filter(Boolean);
      await mentorsApi.apply({
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
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Submission failed');
    } finally {
      setBusy(false);
    }
  }

  function onNext() {
    const problem = validateStep(step);
    if (problem) { setErr(problem); return; }
    setErr(null);
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      submitApplication();
    }
  }

  function onBack() {
    setErr(null);
    if (step > 1) setStep(step - 1);
  }

  if (loadingInit) return <PageSpinner />;

  if (existing) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Card>
          <CardBody className="text-center">
            <h1 className="text-xl font-bold text-foreground">You're already a mentor here</h1>
            <p className="mt-1 text-muted-foreground">
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
          <h1 className="text-xl font-bold text-foreground">Verify your email first</h1>
          <p className="mt-1 text-muted-foreground">Mentor applications require a verified email address.</p>
          <Button className="mt-4" onClick={() => navigate('/verify-email')}>Verify email</Button>
        </CardBody></Card>
      </div>
    );
  }

  const expertise = tags.filter((t) => t.kind === 'expertise');
  const audience  = tags.filter((t) => t.kind === 'audience');

  const isFinalStep = step === TOTAL_STEPS;
  const nextLabel   = isFinalStep ? 'Submit application' : 'Next';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex justify-center">
      <MultiStepForm
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        title="Apply to mentor"
        description="Admin reviews each application within 1-2 business days."
        onBack={onBack}
        onNext={onNext}
        onClose={() => navigate(-1)}
        nextButtonText={nextLabel}
        nextLoading={busy}
        nextDisabled={isFinalStep && !agreedToMentorTOS}
        size="default"
        footerContent={
          <Link to="/terms" target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
            Mentor terms <ArrowUpRight size={14} />
          </Link>
        }
      >
        {/* ---------- Step 1: Pricing ---------- */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Pricing</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick a tier. Mentees pay per minute while you're both in the call.
              </p>
            </div>
            {tiers.map((t) => {
              const isOn = String(t.id) === String(pricing_tier_id);
              return (
                <label
                  key={t.id}
                  className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-3 cursor-pointer transition-colors ${
                    isOn
                      ? 'border-ring bg-accent'
                      : 'border-border hover:border-ring/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio" name="tier" value={t.id}
                      checked={isOn}
                      onChange={() => setTier(t.id)}
                    />
                    <div>
                      <div className="font-medium text-foreground">{t.display_name}</div>
                      <div className="text-xs text-muted-foreground">You earn 70% of every minute.</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{formatPerMinute(t.per_minute_paise)}</div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">
                      ~₹{(t.per_minute_paise * 0.7 / 100).toFixed(0)}/min to you
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        {/* ---------- Step 2: Profile ---------- */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Profile</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                The headline and bio mentees see on your profile card.
              </p>
            </div>
            <Field label="Headline" htmlFor="headline">
              <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
                placeholder="Career mentor — transitions, confidence, public speaking" required />
            </Field>
            <Field label="Bio" htmlFor="bio">
              <textarea
                id="bio" rows={6} value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your background, what you mentor on, your approach, and who you've worked with…"
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
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
          </div>
        )}

        {/* ---------- Step 3: Areas ---------- */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Areas you help with</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick anything that fits. Mentees use these to find you. Optional.
              </p>
            </div>
            <TagGroup title="What you help with" items={expertise} selected={selectedTags} toggle={toggleTag} />
            <TagGroup title="Who you serve"      items={audience}   selected={selectedTags} toggle={toggleTag} />
          </div>
        )}

        {/* ---------- Step 4: Mentor terms ---------- */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Mentor terms — please read</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                These apply to every mentor on unmute. Confirm to submit.
              </p>
            </div>
            <Card>
              <CardBody className="bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 rounded-2xl">
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  <li>I will offer <strong>guidance and mentorship</strong> only — not therapy, counselling, diagnosis, or medical treatment.</li>
                  <li>I will <strong>not</strong> use clinical language (e.g. "therapy", "diagnose", "treat", "cure", named disorders like "PTSD/OCD/ADHD") in my profile or sessions. Profiles using such language are auto-blocked.</li>
                  <li>I am an independent contractor — not an employee of unmute.</li>
                  <li>If a mentee shows signs of crisis, I will refer them to the{' '}
                    <Link to="/crisis" target="_blank" className="underline font-semibold">crisis resources</Link>.
                  </li>
                  <li>I have read and accept the <Link to="/terms" target="_blank" className="underline font-semibold">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="underline font-semibold">Privacy Policy</Link>.</li>
                </ul>
                <label className="mt-4 flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToMentorTOS}
                    onChange={(e) => setAgreedToMentorTOS(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 dark:border-amber-700 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-amber-900 dark:text-amber-200 font-medium">
                    I agree to the mentor terms above.
                  </span>
                </label>
              </CardBody>
            </Card>
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}
      </MultiStepForm>
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
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-foreground border-border hover:border-ring/50'
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
