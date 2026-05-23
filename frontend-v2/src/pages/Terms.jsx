import { Link } from 'react-router-dom';

// Terms of Service.
//
// This is plain-language. Not a substitute for an actual lawyer-reviewed
// document, but covers the key liability-management clauses the user
// flagged: not licensed care, no outcome promise, session content private
// between parties, billing rules, cancellation, and dispute basics.

export default function Terms() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
      <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-300 font-semibold">Legal</p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Last updated: 24 May 2026</p>

      <Callout tone="amber" title="Not licensed care">
        unmute is a peer-mentoring &amp; guidance platform. Mentors on unmute are
        <strong> not</strong> licensed therapists, counsellors, psychologists, or
        psychiatrists, and unmute is not a substitute for medical, psychological,
        or psychiatric care. If you are in crisis, please use <Link to="/crisis" className="underline">crisis resources</Link>.
      </Callout>

      <Section n="1" title="What unmute is">
        <p>
          unmute connects mentees with mentors for one-on-one video conversations.
          Sessions are 60 minutes maximum. You pay <strong>by the minute</strong> only while
          both parties are on the call, subject to a 15-minute minimum once both
          have joined.
        </p>
      </Section>

      <Section n="2" title="Account &amp; eligibility">
        <ul className="list-disc pl-5 space-y-1">
          <li>You must be 18+ to create an account, or 13+ with a parent/guardian's consent.</li>
          <li>You agree to provide accurate information and keep your password private.</li>
          <li>One account per person. We may suspend accounts that we suspect are duplicate or fraudulent.</li>
        </ul>
      </Section>

      <Section n="3" title="What mentors are (and are not)">
        <ul className="list-disc pl-5 space-y-1">
          <li>Mentors are individuals offering <strong>guidance, mentorship, and peer support</strong> based on their lived experience and stated background.</li>
          <li>Mentors are independent contractors, <strong>not employees</strong> of unmute.</li>
          <li>Mentors are <strong>not</strong> permitted to use clinical, diagnostic, or treatment language (e.g. "therapy", "diagnose", "treat", "cure", named disorders, "PTSD/OCD/ADHD", etc.) anywhere in their profile or sessions. Profiles using such language are blocked at submission and again at admin review.</li>
          <li>Mentors do not, and cannot, provide medical, psychological, psychiatric, legal, or financial professional advice through unmute.</li>
        </ul>
      </Section>

      <Section n="4" title="Session content &amp; privacy">
        <ul className="list-disc pl-5 space-y-1">
          <li>What happens during a session is <strong>between you and your mentor</strong>. unmute does not record, monitor, or review live audio/video of your sessions.</li>
          <li>Mentors may take written notes after a session (for their own continuity of care across mentors you choose to keep). You can review these in your account at any time.</li>
          <li>You may opt out of sharing any demographic profile field with mentors. See your <Link to="/me/profile" className="underline text-brand-700 dark:text-brand-300">profile</Link>.</li>
          <li>We follow the <Link to="/privacy" className="underline text-brand-700 dark:text-brand-300">Privacy Policy</Link> for everything else.</li>
        </ul>
      </Section>

      <Section n="5" title="No outcome promises">
        <p>
          unmute and its mentors do not promise any particular outcome from a
          session — clinical, emotional, professional, or otherwise. Use unmute
          at your own discretion. If at any point you feel a mentor is the wrong
          fit, end the session and book with someone else.
        </p>
      </Section>

      <Section n="6" title="Payments, refunds &amp; cancellation">
        <ul className="list-disc pl-5 space-y-1">
          <li>Mentees top up a wallet (in INR) and are billed per minute while both parties are on the call.</li>
          <li>A 15-minute minimum applies once both parties have joined. No-shows (where one party never joined) are not billed.</li>
          <li>Free cancellation up to 4 hours before the session. Within 4 hours, a ₹50 late-cancel fee applies, paid from the canceller's wallet to the other party.</li>
          <li>Refunds for failed or disputed sessions are handled by admin on a case-by-case basis.</li>
          <li>Mentor earnings: 70% of every billed minute goes to the mentor, 30% to the platform.</li>
        </ul>
      </Section>

      <Section n="7" title="Conduct">
        <p>
          Be respectful. No harassment, hate speech, threats, or illegal content. We may
          suspend or ban accounts that violate this clause, with or without notice. If you
          experience misconduct from a mentor or mentee, contact us at the support email below.
        </p>
      </Section>

      <Section n="8" title="Liability">
        <p>
          To the maximum extent permitted by law, unmute is not liable for any direct,
          indirect, incidental, or consequential damages arising from your use of the
          platform, including session content, mentor advice, missed sessions, or platform
          downtime. Our total liability is capped at the amount you have paid us in the
          three months preceding the claim.
        </p>
      </Section>

      <Section n="9" title="Changes">
        <p>
          We may update these Terms. Material changes will be flagged in-app or via email
          before they take effect. Continued use after a change means you accept the new
          Terms.
        </p>
      </Section>

      <Section n="10" title="Contact">
        <p>
          Questions, concerns, or complaints: <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a>.
        </p>
      </Section>

      <p className="mt-12 text-xs text-slate-500 dark:text-slate-400">
        Read also: <Link to="/privacy" className="underline">Privacy Policy</Link> ·{' '}
        <Link to="/crisis" className="underline">Crisis Resources</Link>
      </p>
    </article>
  );
}

function Section({ n, title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {n}. {title}
      </h2>
      <div className="mt-2 text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">{children}</div>
    </section>
  );
}

function Callout({ tone, title, children }) {
  const tones = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
    rose:  'bg-rose-50  border-rose-200  text-rose-900  dark:bg-rose-500/10  dark:border-rose-500/30  dark:text-rose-200',
  };
  return (
    <div className={`mt-6 rounded-2xl border p-4 sm:p-5 ${tones[tone] || tones.amber}`}>
      <p className="font-semibold">{title}</p>
      <p className="text-sm mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
