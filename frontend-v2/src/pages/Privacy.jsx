import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
      <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-300 font-semibold">Legal</p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Last updated: 24 May 2026</p>

      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account</strong>: email, name, password (hashed), and (for Google sign-in) your Google ID + email.</li>
          <li><strong>Optional profile</strong>: bio, avatar URL, phone, city, country, language. For mentees, you can additionally provide date of birth, gender, and marital status — these are <strong>optional</strong> and each field has a per-field "share with mentor" toggle on your profile page.</li>
          <li><strong>Mentor application</strong>: headline, bio, LinkedIn, years of experience, languages, and pricing tier.</li>
          <li><strong>Bookings &amp; sessions</strong>: who you booked with, when, billing duration, mentor-written session notes.</li>
          <li><strong>Wallet &amp; payments</strong>: top-up amounts, transaction IDs (PhonePe), withdrawal requests. <strong>We do not store card or bank details</strong> — they live with the payment processor.</li>
          <li><strong>KYC (mentors only)</strong>: Aadhaar number, optional PAN and bank details. Encrypted at rest. Only visible to admin during review.</li>
          <li><strong>Reviews &amp; ratings</strong>: text + star rating you post about a session.</li>
          <li><strong>Operational</strong>: timestamps, IP for login/security audits, basic browser/device info.</li>
        </ul>
      </Section>

      <Section title="What we DON'T collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>We <strong>do not record</strong> the audio or video of any session.</li>
          <li>We <strong>do not monitor</strong> live sessions for content.</li>
          <li>We <strong>do not</strong> share your data with advertisers.</li>
          <li>We <strong>do not</strong> sell your data to anyone.</li>
        </ul>
      </Section>

      <Section title="How we use what we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li>To run the platform: matching mentees to mentors, scheduling, billing, payouts.</li>
          <li>To send you transactional emails (verification, booking confirmations, receipts, KYC decisions).</li>
          <li>To improve the product: aggregate, de-identified usage stats. We don't profile individuals.</li>
          <li>To meet legal obligations (tax, anti-fraud, lawful information requests).</li>
        </ul>
      </Section>

      <Section title="Who sees what">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Your mentor</strong> sees your name, the demographic fields you've opted to share, and the mentee-title/topic you typed when booking.</li>
          <li><strong>Future mentors</strong> you choose to book with can see prior session notes written about you — this is "continuity of care". You can review every note in your account.</li>
          <li><strong>Admin</strong> sees your account fields and KYC during reviews + dispute resolution. Admin actions are logged.</li>
          <li><strong>The public</strong> sees only your name on reviews you post (unless you select "Post anonymously" — then no name is shown).</li>
        </ul>
      </Section>

      <Section title="Security">
        <ul className="list-disc pl-5 space-y-1">
          <li>Passwords are hashed with bcrypt (12 rounds).</li>
          <li>KYC IDs are stored encrypted; only the last 4 digits surface in admin tools.</li>
          <li>All traffic in production is over HTTPS.</li>
          <li>We follow industry-standard practices, but no online system is 100% secure — please use a strong, unique password.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access</strong> — view all your data from your profile and bookings pages.</li>
          <li><strong>Correction</strong> — edit your profile fields anytime.</li>
          <li><strong>Deletion</strong> — email <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a> to request account deletion. We retain a minimal record of transactions for tax/legal compliance (typically 7 years in India), with personal identifiers redacted.</li>
          <li><strong>Portability</strong> — request a JSON export of your data.</li>
          <li><strong>Opt-out</strong> — toggle off "share with mentor" on any demographic field.</li>
        </ul>
      </Section>

      <Section title="Cookies / storage">
        <p>
          We use a small number of cookies and localStorage keys for: login session (refresh token cookie),
          theme choice, and notification poll throttling. We do <strong>not</strong> use third-party analytics
          or ad cookies.
        </p>
      </Section>

      <Section title="Children">
        <p>
          unmute is intended for ages 13+. Users under 18 require a parent/guardian to read these
          terms and consent. We do not knowingly collect data from children under 13.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Privacy questions, deletion requests, or data complaints:{' '}
          <a href="mailto:privacy@unmute.app" className="underline text-brand-700 dark:text-brand-300">privacy@unmute.app</a>
        </p>
      </Section>

      <p className="mt-12 text-xs text-slate-500 dark:text-slate-400">
        Read also: <Link to="/terms" className="underline">Terms of Service</Link> ·{' '}
        <Link to="/crisis" className="underline">Crisis Resources</Link>
      </p>
    </article>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-2 text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">{children}</div>
    </section>
  );
}
