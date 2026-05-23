import { Phone, MessageCircle, Globe, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

// Crisis resources page. Lists the actual professional helplines a user
// should call if they are in immediate distress. unmute is NOT one of them
// — we explicitly say so up top.

export default function Crisis() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 animate-fade-in">
      <div className="rounded-3xl bg-gradient-to-br from-rose-50 to-rose-100/60 border border-rose-200/70 p-5 sm:p-7 dark:from-rose-500/10 dark:to-rose-600/5 dark:border-rose-500/30">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-rose-900 dark:text-rose-100">
              Need urgent help?
            </h1>
            <p className="mt-2 text-sm sm:text-base text-rose-900/90 dark:text-rose-100/90 leading-relaxed">
              If you or someone you know is in immediate danger, please contact a
              qualified professional or emergency service right now. <strong>unmute is
              peer mentorship — not a crisis line.</strong>
            </p>
          </div>
        </div>
      </div>

      <h2 className="mt-10 text-xl font-semibold text-slate-900 dark:text-slate-100">India — free, confidential helplines</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        All free; most operate in multiple languages.
      </p>

      <ul className="mt-5 space-y-3">
        <HelplineCard
          name="iCall"
          who="Run by TISS, Mumbai. Counsellors trained in mental-health first response."
          phone="+91 9152987821"
          hours="Mon-Sat · 8 AM – 10 PM IST"
          email="icall@tiss.edu"
          web="https://icallhelpline.org"
        />
        <HelplineCard
          name="Vandrevala Foundation"
          who="24×7 toll-free national helpline."
          phone="+91 1860 2662 345 / +91 1800 2333 330"
          hours="24×7"
          web="https://vandrevalafoundation.com"
        />
        <HelplineCard
          name="iCare (Aasra)"
          who="Suicide-prevention helpline based in Mumbai. 24×7."
          phone="+91 9820466726"
          hours="24×7"
          web="http://www.aasra.info"
        />
        <HelplineCard
          name="NIMHANS Helpline"
          who="Govt. of India · National toll-free helpline operated by NIMHANS, Bengaluru."
          phone="1800-599-0019"
          hours="24×7 · 13 languages"
          web="https://www.nimhans.ac.in"
        />
        <HelplineCard
          name="Sneha India"
          who="Suicide-prevention helpline, Chennai. Active listening volunteers."
          phone="+91 44 24640050"
          hours="24×7"
          web="https://snehaindia.org"
        />
      </ul>

      <h2 className="mt-12 text-xl font-semibold text-slate-900 dark:text-slate-100">If you're outside India</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        These directories list verified crisis lines worldwide.
      </p>
      <ul className="mt-4 space-y-2">
        <ExternalLink
          name="Befrienders Worldwide"
          desc="Search by country."
          url="https://www.befrienders.org"
        />
        <ExternalLink
          name="findahelpline.com"
          desc="Search by country + topic."
          url="https://findahelpline.com"
        />
        <ExternalLink
          name="International Association for Suicide Prevention"
          desc="Crisis centres directory."
          url="https://www.iasp.info/suicidalthoughts"
        />
      </ul>

      <div className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        <p className="font-semibold text-slate-900 dark:text-slate-100">A note on unmute</p>
        <p className="mt-2">
          The mentors and guides on unmute are real people who care, but they aren't
          licensed clinicians and they aren't on-call 24×7. If something is urgent
          — please use the resources above. After the crisis passes, we'll be here
          when you want to talk things through.
        </p>
        <p className="mt-4">
          <Link to="/" className="underline text-brand-700 dark:text-brand-300">Back to home</Link>
        </p>
      </div>
    </article>
  );
}

function HelplineCard({ name, who, phone, hours, email, web }) {
  return (
    <li className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-soft">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{name}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{who}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 dark:text-brand-300 hover:underline">
          <Phone size={14} /> {phone}
        </a>
        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> {hours}
        </span>
        {email && (
          <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:underline">
            <MessageCircle size={14} /> {email}
          </a>
        )}
        {web && (
          <a href={web} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:underline">
            <Globe size={14} /> Website
          </a>
        )}
      </div>
    </li>
  );
}

function ExternalLink({ name, desc, url }) {
  return (
    <li>
      <a href={url} target="_blank" rel="noreferrer noopener"
         className="inline-flex items-center gap-2 text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline">
        <Globe size={14} /> {name}
      </a>
      <span className="text-sm text-slate-500 dark:text-slate-400"> — {desc}</span>
    </li>
  );
}
