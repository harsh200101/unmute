import { Outlet } from 'react-router-dom';
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
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-right">
            Guidance &amp; mentorship · By the minute
          </p>
        </div>
        {/* Plain-English disclaimer. Not a substitute for licensed care. */}
        <div className="max-w-6xl mx-auto mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
          unmute is a peer-mentoring &amp; guidance platform. It is <strong>not</strong> a substitute
          for licensed medical, psychological, or psychiatric care. If you are in crisis or need
          urgent help, please contact a qualified professional or local emergency services.
        </div>
      </footer>
    </div>
  );
}
