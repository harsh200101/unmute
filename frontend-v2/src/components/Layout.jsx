import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200/70 bg-white/60 backdrop-blur-sm py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
            <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-brand-500 to-brand-700" />
            unmute
          </div>
          <p className="text-xs text-slate-500">Mental health support · By the minute · Made with care.</p>
        </div>
      </footer>
    </div>
  );
}
