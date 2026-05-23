import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';

export default function Landing() {
  return (
    <>
      {/* Hero with looping video */}
      <section className="relative h-[70vh] min-h-[480px] overflow-hidden bg-slate-900">
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          src="/videos/hero-video.mp4"
          poster="/images/hero-fallback.jpg"
          autoPlay muted loop playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/40 to-slate-900/80" />
        <div className="relative h-full flex items-center">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 w-full">
            <div className="max-w-2xl text-white">
              <p className="text-sm uppercase tracking-wider text-amber-300 font-semibold">
                Mentoring, by the minute
              </p>
              <h1 className="mt-3 text-4xl sm:text-5xl font-bold leading-tight">
                Talk to a real mentor. <br />Pay only for the minutes you use.
              </h1>
              <p className="mt-4 text-lg text-slate-200">
                Book a 1-on-1 video session with a verified expert. We charge per minute while
                both of you are on the call — no minimums, no surprise bills.
              </p>
              <div className="mt-6 flex gap-3">
                <Link to="/register">
                  <Button size="lg">Get started</Button>
                </Link>
                <Link to="/mentors">
                  <Button size="lg" variant="secondary" className="!bg-white/10 !border-white/20 !text-white hover:!bg-white/20">
                    Browse mentors
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three-up value props */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature
            img="/images/illustration-1.png"
            title="Per-minute pricing"
            body="Book a slot for free. We only charge while both you and the mentor are actually on the call. Leave the call any time — you stop paying instantly."
          />
          <Feature
            img="/images/illustration-2.png"
            title="Verified mentors only"
            body="Every mentor passes an admin review before they appear on the platform. KYC, profile, expertise — all checked."
          />
          <Feature
            img="/images/illustration-3.png"
            title="60-minute slots, hard cap"
            body="Every slot is exactly 60 minutes. No surprise charges, no overruns into the next session. You're always in control."
          />
        </div>
      </section>

      <section className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Ready to talk to someone who's done it?</h2>
          <p className="mt-2 text-slate-600">Sign up free. Top up your wallet. Book a slot in 60 seconds.</p>
          <div className="mt-6">
            <Link to="/register">
              <Button size="lg">Create your account</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Feature({ img, title, body }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="aspect-[16/9] bg-slate-100">
        <img src={img} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
