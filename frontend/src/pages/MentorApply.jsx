import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowUpRight, Sparkles, Check, Globe2, Briefcase, IndianRupee } from 'lucide-react';
import { mentors as mentorsApi, catalog } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Label } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import MultiStepForm from '../components/ui/multi-step-form.jsx';
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

export default function MentorApply() {
  const { user, reloadMe } = useAuth();
  const navigate = useNavigate();

  const [tiers, setTiers] = useState([]);
  const [tags, setTags] = useState([]);
  const [existing, setExisting] = useState(null);
  const [loadingInit, setLoadingInit] = useState(true);

  // Form state
  const [pricing_tier_id, setTier] = useState('');
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPriceRupees, setCustomPriceRupees] = useState(15);
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [years_experience, setYears] = useState(3);
  const [linkedin_url, setLinkedin] = useState('');
  const [selectedLangs, setSelectedLangs] = useState(['en', 'hi']);
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [agreedToMentorTOS, setAgreedToMentorTOS] = useState(false);

  // Wizard state — 4 steps: Pricing → Profile → Categories → Terms.
  const TOTAL_STEPS = 4;
  const [step, setStep] = useState(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([catalog.tiers(), catalog.tags(), mentorsApi.getMine().catch(() => null)])
      .then(([t, g, mine]) => {
        if (cancelled) return;
        setTiers(t.items || []);
        setTags(g.items || []);
        if (t.items?.length && !pricing_tier_id) {
          // Default to standard or second tier
          setTier(String(t.items[1]?.id || t.items[0]?.id));
        }
        if (mine?.mentor) setExisting(mine.mentor);
      })
      .finally(() => { if (!cancelled) setLoadingInit(false); });
    return () => { cancelled = true; };
  }, []);

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
    setSelectedTags(next);
  }

  function fillBioTemplate() {
    const expText = years_experience > 0 ? `${years_experience}+` : 'several';
    setBio(
      `Hi! I have ${expText} years of experience in my industry. In our sessions, we can dive deep into your specific career roadmap, interview prep, or day-to-day challenges.\n\nMy approach is practical, direct, and judgement-free. Let's get you unstuck and moving forward.`
    );
    toast.success('Sample bio template inserted!');
  }

  // Per-step validation
  function validateStep(s) {
    if (s === 1 && !pricing_tier_id && !isCustomPrice) return 'Please pick a pricing option.';
    if (s === 2 && (!headline.trim() || !bio.trim())) return 'Headline and bio are required.';
    if (s === 4 && !agreedToMentorTOS) return 'Please confirm the mentor terms.';
    return null;
  }

  async function submitApplication() {
    setBusy(true);
    setErr(null);
    try {
      // Find matching tier or closest tier if custom
      let effectiveTierId = pricing_tier_id;
      if (isCustomPrice) {
        // Map to closest existing tier
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

      await mentorsApi.apply({
        pricing_tier_id: Number(effectiveTierId),
        headline: headline.trim(),
        bio: bio.trim(),
        years_experience: Number(years_experience) || 0,
        linkedin_url: linkedin_url.trim() || null,
        languages: selectedLangs.length ? selectedLangs : ['en'],
        tag_ids: [...selectedTags],
      });
      toast.success('Application submitted! Admin will review shortly.');
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
    setStep(Math.max(1, step - 1));
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
            <Button className="mt-4" onClick={() => navigate('/mentor/settings')}>
              Manage mentor settings
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!user?.email_verified) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <Card>
          <CardBody className="py-8">
            <h2 className="text-lg font-bold text-foreground">Email verification required</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Please verify your email address before applying to become a mentor.
            </p>
            <Button className="mt-4" onClick={() => navigate('/verify-email')}>
              Verify email
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  const expertise = tags.filter((t) => t.kind === 'expertise');
  const audience = tags.filter((t) => t.kind === 'audience');

  const isFinalStep = step === TOTAL_STEPS;
  const nextLabel = isFinalStep ? 'Submit application' : 'Next';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex justify-center">
      <MultiStepForm
        currentStep={step}
        totalSteps={TOTAL_STEPS}
        title="Apply to Mentor"
        description="Fast 4-step setup. Click presets to build your profile in seconds."
        onBack={onBack}
        onNext={onNext}
        onClose={() => navigate(-1)}
        nextButtonText={nextLabel}
        nextLoading={busy}
        nextDisabled={isFinalStep && !agreedToMentorTOS}
        size="default"
        footerContent={
          <Link to="/terms" className="inline-flex items-center gap-1 text-primary hover:underline">
            Mentor terms <ArrowUpRight size={14} />
          </Link>
        }
      >
        {/* ---------- Step 1: Pricing ---------- */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Set Your Per-Minute Pricing</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick a quick preset or choose your custom rate. You keep 70% of every minute billed.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiers.map((t) => {
                const isOn = !isCustomPrice && String(t.id) === String(pricing_tier_id);
                const rateRupees = t.per_minute_paise / 100;
                return (
                  <div
                    key={t.id}
                    onClick={() => { setIsCustomPrice(false); setTier(String(t.id)); }}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                      isOn
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-foreground">{t.display_name}</div>
                      <div className="text-xs text-muted-foreground">₹{rateRupees * 60}/hr equivalent</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                        ~₹{(rateRupees * 0.7).toFixed(1)}/min to you
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-foreground">₹{rateRupees}</span>
                      <span className="text-xs text-muted-foreground">/min</span>
                    </div>
                  </div>
                );
              })}

              {/* Custom Price Card */}
              <div
                onClick={() => setIsCustomPrice(true)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  isCustomPrice
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                    : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-foreground">Custom Rate</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary">Custom</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Enter your exact per-minute amount</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  ~₹{(customPriceRupees * 0.7).toFixed(1)}/min to you
                </div>
              </div>
            </div>

            {/* Custom Price Slider/Input */}
            {isCustomPrice && (
              <div className="p-4 rounded-xl border border-border bg-muted/30 mt-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Your custom rate:</span>
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
          </div>
        )}

        {/* ---------- Step 2: Profile ---------- */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground">Profile & Specialties</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click chips to instantly fill or tweak your info.
              </p>
            </div>

            {/* Headline with Suggestions */}
            <div>
              <Field label="Headline" htmlFor="headline">
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Career Coach — Job transitions, resume strategy & mock interviews"
                  required
                />
              </Field>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Sparkles size={12} className="text-primary" /> Click a starter suggestion:
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

            {/* Years of Experience (Clickable Pills) */}
            <div>
              <Label>Years of Experience</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {EXP_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => setYears(opt.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      years_experience === opt.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Languages (Clickable Multi-select Pills) */}
            <div>
              <Label className="flex items-center gap-1.5">
                <Globe2 size={14} className="text-primary" /> Languages You Can Mentor In
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

            {/* Bio with Template Generator */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="bio">About You & Your Approach</Label>
                <button
                  type="button"
                  onClick={fillBioTemplate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles size={13} /> Auto-fill sample bio
                </button>
              </div>
              <textarea
                id="bio"
                rows={5}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your background, what you mentor on, your approach, and who you've worked with…"
                className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            {/* LinkedIn (Optional) */}
            <Field label="LinkedIn Profile (optional)" htmlFor="li">
              <Input
                id="li"
                type="url"
                value={linkedin_url}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/yourname"
              />
            </Field>
          </div>
        )}

        {/* ---------- Step 3: Categories & Audience ---------- */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">Mentorship Topics & Target Audience</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mentees use these tags to discover you. Click all that apply.
              </p>
            </div>

            <TagGroup
              title="Topics & Skills You Guide On"
              subtitle="The specific domains, subjects, and skills you mentor on."
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
          </div>
        )}

        {/* ---------- Step 4: Mentor Terms ---------- */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Mentor Code of Conduct & Terms</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                unmute provides peer guidance and mentorship, not clinical therapy.
              </p>
            </div>
            <Card>
              <CardBody className="bg-amber-50/60 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20 rounded-2xl">
                <ul className="list-disc pl-5 space-y-2 text-sm text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                  <li>I will offer <strong>guidance and mentorship</strong> only — not therapy, counselling, diagnosis, or medical treatment.</li>
                  <li>I will <strong>not</strong> use clinical medical claims in my profile or sessions. Profiles violating this are auto-blocked.</li>
                  <li>I am an independent mentor — not an employee of unmute.</li>
                  <li>If a mentee shows signs of crisis, I will refer them to the{' '}
                    <Link to="/crisis" className="underline font-semibold">crisis resources</Link>.
                  </li>
                  <li>I have read and accept the <Link to="/terms" className="underline font-semibold">Terms of Service</Link> and <Link to="/privacy" className="underline font-semibold">Privacy Policy</Link>.</li>
                </ul>
                <label className="mt-5 flex items-start gap-2.5 text-sm cursor-pointer pt-3 border-t border-amber-200/50 dark:border-amber-500/20">
                  <input
                    type="checkbox"
                    checked={agreedToMentorTOS}
                    onChange={(e) => setAgreedToMentorTOS(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 dark:border-amber-700 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-amber-900 dark:text-amber-200 font-semibold">
                    I agree to the mentor terms and code of conduct.
                  </span>
                </label>
              </CardBody>
            </Card>
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive font-medium">
            {err}
          </div>
        )}
      </MultiStepForm>
    </div>
  );
}

function TagGroup({ title, subtitle, items, selected, toggle }) {
  return (
    <div className="bg-card border border-border p-4 rounded-xl shadow-soft">
      <div className="mb-3">
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
