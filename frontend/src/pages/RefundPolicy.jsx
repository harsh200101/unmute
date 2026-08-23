import { Link } from 'react-router-dom';

export default function RefundPolicy() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
      <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-300 font-semibold">Legal</p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Refund Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Last updated: 23 August 2026</p>

      <Section n="1" title="No physical returns">
        <p>
          unmute is a digital mentorship platform. We do not ship physical products, so there are no return shipments, reverse logistics, or physical product exchanges.
        </p>
        <p className="mt-2">
          All sessions are delivered online through video. What you are purchasing is access to a live, time-bound conversation with a mentor, billed by the minute to your unmute wallet.
        </p>
      </Section>

      <Section n="2" title="Wallet &amp; billing model">
        <p>
          You top up your unmute wallet (INR) and are billed per minute while both parties are on the call, subject to a 15-minute minimum once both have joined. No-shows (where one party never joined) are not billed.
        </p>
      </Section>

      <Section n="3" title="General rule — no automatic refunds">
        <Callout tone="amber" title="User-to-user basis">
          By default, all wallet deductions are final. unmute does not guarantee refunds. Because mentors are independent users and sessions are consumed in real time, most completed or partially completed sessions are non-refundable.
        </Callout>
      </Section>

      <Section n="4" title="When a refund may be considered">
        <p>
          Refunds are only considered in the following exceptional, user-to-user scenarios:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Mentor no-show after join:</strong> If the mentor joined the call and then left without providing any session, the mentee may request a refund of the billed amount.</li>
          <li><strong>Technical failure on platform side:</strong> If the unmute platform experienced a verified outage or bug that prevented the session from occurring, affected users may request a refund.</li>
          <li><strong>Duplicate or erroneous wallet charge:</strong> If you were charged incorrectly due to a platform bug (e.g., billed for a cancelled booking that should not have been billed), you may request a correction.</li>
          <li><strong>Admin-disputed sessions:</strong> In cases of verified misconduct, harassment, or violation of our Terms by the other party during a session, admin may, at its sole discretion, issue a partial or full refund.</li>
        </ul>
      </Section>

      <Section n="5" title="What is NOT refundable">
        <ul className="list-disc pl-5 space-y-1">
          <li>Change of mind after the session has started or completed.</li>
          <li>Dissatisfaction with the mentor&apos;s advice, tone, or style (unless it crosses into verified misconduct).</li>
          <li>Mentee late cancellation (within 4 hours of the session). The ₹50 late-cancel penalty is compensatory, not refundable.</li>
          <li>Mentor late cancellation (within 4 hours). The mentee receives the ₹50 compensation; the cancelling mentor cannot reverse it.</li>
          <li>Wallet top-up fees charged by the payment processor (if any).</li>
          <li>Any amount already paid out to a mentor for a completed session, unless admin orders a clawback.</li>
        </ul>
      </Section>

      <Section n="6" title="Refund process">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Email <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a> within <strong>7 days</strong> of the transaction with your booking ID, wallet transaction ID, and a clear explanation.</li>
          <li>Our team will verify the claim against session logs, payment records, and platform metrics.</li>
          <li>If the claim falls under Section 4, admin will approve or deny the refund at its sole discretion.</li>
          <li>Approved refunds are credited back to your unmute wallet within <strong>15 days</strong>. They are not paid out to external bank accounts or cards.</li>
        </ol>
      </Section>

      <Section n="7" title="Platform-funded vs user-to-user refunds">
        <p>
          In most approved cases, the refund is funded by the platform, not the other user. However, if admin determines the other user is at fault (e.g., mentor no-show), the platform may claw back the amount from that user&apos;s wallet before issuing your refund.
        </p>
      </Section>

      <Section n="8" title="Cancellation vs refund">
        <p>
          Cancellation is handled separately from refunds. Free cancellation is available up to 4 hours before the session. Late cancellations incur a ₹50 penalty. See the <Link to="/terms" className="underline text-brand-700 dark:text-brand-300">Terms of Service</Link> for full cancellation rules.
        </p>
      </Section>

      <Section n="9" title="Contact">
        <p>
          Refund requests and questions: <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a>.
        </p>
      </Section>

      <p className="mt-12 text-xs text-slate-500 dark:text-slate-400">
        Read also: <Link to="/terms" className="underline">Terms of Service</Link> ·{' '}
        <Link to="/privacy" className="underline">Privacy Policy</Link>
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
