import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Shield, Clock, Sparkles } from 'lucide-react';
import Button from '../components/ui/Button.jsx';

export default function Landing() {
  return (
    <div className="overflow-x-hidden">
      {/* ----------------- HERO ----------------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-brand-100/40">
        {/* Floating decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-300/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Copy */}
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-brand-200/70 px-3 py-1 text-xs font-medium text-brand-700 shadow-soft">
                <Heart size={12} /> Mental health support, on your terms
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.05]">
                Talk to someone <br className="hidden sm:block" />
                <span className="bg-gradient-to-br from-brand-600 to-brand-800 bg-clip-text text-transparent">who gets it.</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Book a 1-on-1 video session with a verified counsellor or coach.
                Pay only for the minutes you talk — no minimums, no commitment.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3 sm:gap-3 justify-center lg:justify-start">
                <Link to="/register" className="contents">
                  <Button size="lg" className="w-full sm:w-auto">
                    Get started <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link to="/mentors" className="contents">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    Browse mentors
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex items-center justify-center lg:justify-start gap-5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Shield size={13} /> Verified mentors</span>
                <span className="inline-flex items-center gap-1.5"><Clock size={13} /> No commitment</span>
                <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> Per-minute</span>
              </div>
            </div>

            {/* Hero visual — looping video in a tilted, framed card */}
            <div className="relative">
              <div className="relative mx-auto max-w-md lg:max-w-none aspect-[4/5] sm:aspect-[5/4] lg:aspect-square rounded-3xl overflow-hidden shadow-floaty ring-1 ring-slate-900/5 lg:rotate-1 hover:rotate-0 transition-transform duration-500">
                <video
                  className="h-full w-full object-cover"
                  src="/videos/hero-video.mp4"
                  poster="/images/hero-fallback.jpg"
                  autoPlay muted loop playsInline
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-xs font-medium text-brand-200">A safe space</p>
                  <p className="text-base font-semibold">Real conversations, on your time.</p>
                </div>
              </div>
              {/* Floating stat pill */}
              <div className="hidden sm:flex absolute -bottom-5 -left-3 lg:-left-6 items-center gap-3 bg-white rounded-2xl shadow-floaty px-4 py-3 ring-1 ring-slate-900/5">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pay only for what you use</p>
                  <p className="text-sm font-semibold text-slate-900">By the minute · 60 min cap</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------- VALUE PROPS ----------------- */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Built for moments that matter</h2>
          <p className="mt-3 text-slate-600">No subscriptions. No long commitments. Just real human conversations when you need them.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <Feature
            icon={<Clock />}
            tone="brand"
            title="Pay by the minute"
            body="Booking is free. We only charge while you and your mentor are both on the call. Leave anytime — billing stops the second you do."
          />
          <Feature
            icon={<Shield />}
            tone="emerald"
            title="Verified mentors, real people"
            body="Every counsellor and coach passes admin review. Identity, training, and approach — all checked before they appear here."
          />
          <Feature
            icon={<Heart />}
            tone="rose"
            title="Talk up to 60 minutes"
            body="Sessions cap at 60 minutes. No surprise charges, no overruns. End early when you've said what you needed to say."
          />
        </div>
      </section>

      {/* ----------------- HOW IT WORKS ----------------- */}
      <section className="bg-gradient-to-br from-slate-50 to-brand-50/40 border-y border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Three steps. Sixty seconds.</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <Step n="1" title="Find someone you vibe with" body="Browse verified counsellors, peer coaches, and therapists. Filter by topic, language, or audience." />
            <Step n="2" title="Pick a time, top up" body="Open slots show in your timezone. Top up your wallet — pay only for the minutes you talk." />
            <Step n="3" title="Show up & talk" body="Join the video room 5 min before. End anytime. Bills stop the second the call ends." />
          </div>
        </div>
      </section>

      {/* ----------------- FINAL CTA ----------------- */}
      <section className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Whatever you're carrying — <br className="hidden sm:block" />
            <span className="bg-gradient-to-br from-brand-600 to-brand-800 bg-clip-text text-transparent">you don't have to carry it alone.</span>
          </h2>
          <p className="mt-4 text-slate-600 max-w-xl mx-auto">
            Sign up free. Book a session in 60 seconds. Talk for as long — or as little — as you need.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="contents">
              <Button size="lg" className="w-full sm:w-auto">
                Create your account <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/mentors" className="contents">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Browse mentors first
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, body, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <div className="group bg-white border border-slate-200/80 rounded-2xl p-6 shadow-soft hover:shadow-elev hover:border-slate-300 transition-all">
      <div className={`inline-flex items-center justify-center h-12 w-12 rounded-2xl ${tones[tone]} group-hover:scale-105 transition-transform`}>
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-soft">
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-brand-600 text-white font-semibold">{n}</div>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
    </div>
  );
}
