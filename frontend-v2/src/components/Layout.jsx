import { Outlet, Link } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import Header from './Header.jsx';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium">
            <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-brand-500 to-brand-700" />
            unmute
          </div>
          {/* Crisis link gets prominent placement — rose-toned so it stands out. */}
          <Link
            to="/crisis"
            className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-500/30 px-3 py-1 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors"
          >
            <LifeBuoy size={12} /> In crisis? Tap here
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/terms"   className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">Privacy</Link>
            <Link to="/crisis"  className="hover:text-slate-700 dark:hover:text-slate-200 hover:underline">Crisis resources</Link>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>Guidance &amp; mentorship · By the minute</span>
          </nav>
        </div>
        {/* Plain-English disclaimer. Not a substitute for licensed care. */}
        <div className="max-w-6xl mx-auto mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          unmute is a peer-mentoring &amp; guidance platform. It is <strong>not</strong> a substitute
          for licensed medical, psychological, or psychiatric care. If you are in crisis or need
          urgent help, please <Link to="/crisis" className="underline">use the crisis resources</Link>{' '}
          or contact local emergency services.
        </div>
      </footer>
    </div>
  );
}
