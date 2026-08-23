import { Link } from 'react-router-dom';

export default function ReturnPolicy() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
      <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-300 font-semibold">Legal</p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Return Policy
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Last updated: 23 August 2026</p>

      <Section n="1" title="Scope">
        <p>
          This Return Policy applies to all products purchased through the Platform. By placing an order, you agree to be bound by this policy. Please read it carefully before making a purchase.
        </p>
      </Section>

      <Section n="2" title="Return eligibility">
        <p>
          You may return a product purchased on the Platform within <strong>7 days</strong> of receipt, provided that:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>The product is in its original condition, unused, unwashed, and with all original tags and packaging intact.</li>
          <li>You have the original invoice or proof of purchase.</li>
          <li>The product is not listed as non-returnable under Section 5 below.</li>
        </ul>
      </Section>

      <Section n="3" title="Return timeframe">
        <p>
          Return requests must be initiated within <strong>7 days</strong> of the date of delivery. Requests made after this period will not be accepted.
        </p>
      </Section>

      <Section n="4" title="Return process">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Contact our customer support team at <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a> with your order ID and reason for return.</li>
          <li>Our team will review your request and, if approved, provide return instructions and a return authorization.</li>
          <li>Pack the item securely in its original packaging along with all accessories and documentation.</li>
          <li>Ship the item back to the address provided by our support team. We recommend using a trackable shipping service.</li>
          <li>Once we receive and inspect the returned item, we will process your refund or replacement as applicable.</li>
        </ol>
      </Section>

      <Section n="5" title="Non-returnable items">
        <p>
          The following items cannot be returned:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Perishable goods such as flowers, food items, or other consumables.</li>
          <li>Products that have been used, damaged, or altered after delivery.</li>
          <li>Products purchased on sale or clearance, unless they arrive damaged or defective.</li>
          <li>Products that are specifically marked as non-returnable at the time of purchase.</li>
        </ul>
      </Section>

      <Section n="6" title="Refunds and replacements">
        <p>
          Once your return is received and inspected, we will notify you of the status of your return. If approved:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Refunds will be processed to the original payment method within <strong>15 days</strong> of approval.</li>
          <li>Replacements will be shipped once the returned item is received and inspected, subject to availability.</li>
          <li>Shipping costs for returns are the responsibility of the customer unless the return is due to a defective or incorrect item.</li>
        </ul>
      </Section>

      <Section n="7" title="Damaged or defective items">
        <p>
          If you receive a damaged or defective product, please report it to our customer service team within <strong>7 days</strong> of receipt. We will arrange for a replacement or refund after verifying the issue with the seller/merchant listed on the Platform.
        </p>
      </Section>

      <Section n="8" title="Product not as described">
        <p>
          If the product you receive is significantly different from what was shown on the Platform or does not match the description, please notify our customer service team within <strong>7 days</strong> of receiving the product. Our team will review your complaint and take appropriate action.
        </p>
      </Section>

      <Section n="9" title="Warranty claims">
        <p>
          Products that come with a manufacturer&apos;s warranty should be returned directly to the manufacturer in accordance with the warranty terms. Please refer to the manufacturer&apos;s warranty documentation for details.
        </p>
      </Section>

      <Section n="10" title="Contact">
        <p>
          If you have any questions about this Return Policy, please contact us at{' '}
          <a href="mailto:support@unmute.app" className="underline text-brand-700 dark:text-brand-300">support@unmute.app</a>.
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
