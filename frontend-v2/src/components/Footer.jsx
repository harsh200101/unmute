import { Link } from 'react-router-dom';
import { Mail, MapPin, LifeBuoy } from 'lucide-react';
import Logo from './Logo.jsx';

/* -------------------------------------------------------------------------- */
/* App footer.                                                                */
/* Four-column layout (brand + three link clusters) + a thin disclaimer bar.  */
/* All surfaces ride the semantic design tokens so light/dark mode "just      */
/* works". The Crisis link gets the prominent pulsing indicator because the   */
/* /crisis page is the most important safety surface on the platform.        */
/* -------------------------------------------------------------------------- */

const productLinks = [
  { text: 'Find mentors',   to: '/mentors' },
  { text: 'Become a mentor', to: '/mentor/apply' },
  { text: 'My bookings',    to: '/bookings' },
  { text: 'Wallet',         to: '/wallet' },
];

const companyLinks = [
  { text: 'Terms',          to: '/terms' },
  { text: 'Privacy',        to: '/privacy' },
];

const supportLinks = [
  { text: 'Crisis resources', to: '/crisis', urgent: true },
];

const contactInfo = [
  { icon: Mail,   text: 'support@unmute.app', href: 'mailto:support@unmute.app' },
  { icon: MapPin, text: 'Made in India', isAddress: true },
];

export default function Footer() {
  return (
    <footer className="bg-secondary dark:bg-secondary/20 mt-16 w-full place-self-end rounded-t-xl">
      <div className="mx-auto max-w-screen-xl px-4 pt-16 pb-6 sm:px-6 lg:px-8 lg:pt-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* --------------------------- Brand column --------------------------- */}
          <div>
            <Link
              to="/"
              className="flex items-center justify-center gap-2 sm:justify-start text-foreground"
              aria-label="unmute — home"
            >
              <Logo size={32} />
              <span className="text-2xl font-semibold tracking-tight">unmute</span>
            </Link>

            <p className="text-foreground/60 mt-6 max-w-md text-center leading-relaxed sm:max-w-xs sm:text-left">
              Talk to a verified mentor or guide. By the minute, judgement-free, in your language —
              peer mentorship, not therapy.
            </p>

            {/* Prominent crisis CTA — keeps the safety surface easy to find. */}
            <Link
              to="/crisis"
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors"
            >
              <LifeBuoy size={14} />
              In crisis? Tap here
            </Link>
          </div>

          {/* ------------------------- Link clusters --------------------------- */}
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 lg:col-span-2">
            <FooterColumn title="For users">
              {productLinks.map(({ text, to }) => (
                <FooterRouterLink key={to} to={to}>{text}</FooterRouterLink>
              ))}
            </FooterColumn>

            <FooterColumn title="Company">
              {companyLinks.map(({ text, to }) => (
                <FooterRouterLink key={to} to={to}>{text}</FooterRouterLink>
              ))}
            </FooterColumn>

            <FooterColumn title="Support">
              {supportLinks.map(({ text, to, urgent }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className={
                      urgent
                        ? 'group flex justify-center gap-1.5 sm:justify-start'
                        : 'text-secondary-foreground/70 hover:text-foreground transition-colors'
                    }
                  >
                    <span className="text-secondary-foreground/70 group-hover:text-foreground transition-colors">
                      {text}
                    </span>
                    {urgent && (
                      <span className="relative flex size-2 mt-1.5">
                        <span className="bg-destructive absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                        <span className="bg-destructive relative inline-flex size-2 rounded-full" />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </FooterColumn>

            <FooterColumn title="Contact">
              {contactInfo.map(({ icon: Icon, text, href, isAddress }) => (
                <li key={text}>
                  {href ? (
                    <a
                      className="flex items-center justify-center gap-1.5 sm:justify-start hover:text-foreground transition-colors"
                      href={href}
                    >
                      <Icon className="text-primary size-5 shrink-0" />
                      <span className="text-secondary-foreground/70 flex-1">{text}</span>
                    </a>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5 sm:justify-start">
                      <Icon className="text-primary size-5 shrink-0" />
                      {isAddress ? (
                        <address className="text-secondary-foreground/70 -mt-0.5 flex-1 not-italic">
                          {text}
                        </address>
                      ) : (
                        <span className="text-secondary-foreground/70 flex-1">{text}</span>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </FooterColumn>
          </div>
        </div>

        {/* Disclaimer + copyright */}
        <div className="mt-12 border-t border-border pt-6 space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            unmute is a peer-mentoring &amp; guidance platform. It is{' '}
            <strong>not</strong> a substitute for licensed medical, psychological, or psychiatric
            care. If you are in crisis or need urgent help, please{' '}
            <Link to="/crisis" className="underline">use the crisis resources</Link>{' '}
            or contact local emergency services.
          </p>
          <div className="text-center sm:flex sm:justify-between sm:text-left">
            <p className="text-xs text-secondary-foreground/70">
              &copy; {new Date().getFullYear()} unmute · All rights reserved
            </p>
            <p className="mt-2 sm:mt-0 text-xs text-secondary-foreground/70">
              Guidance &amp; mentorship · By the minute
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Helper: a labelled column with a `<ul>` of link items.
function FooterColumn({ title, children }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-lg font-medium text-foreground">{title}</p>
      <ul className="mt-6 space-y-3 text-sm">{children}</ul>
    </div>
  );
}

// Helper: a routed link inside a FooterColumn `<ul>`.
function FooterRouterLink({ to, children }) {
  return (
    <li>
      <Link
        to={to}
        className="text-secondary-foreground/70 hover:text-foreground transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}
