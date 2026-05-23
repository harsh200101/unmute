import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        unmute · 1-on-1 mentoring per minute
      </footer>
    </div>
  );
}
