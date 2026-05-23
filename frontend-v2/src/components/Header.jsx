import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import Button from './ui/Button.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Auto-close the drawer whenever the route changes (e.g. user taps a link).
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    if (menuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [menuOpen]);

  const isMentor = user?.role === 'mentor';
  const navItems = [
    { to: '/mentors',   label: 'Find mentors',  show: true },
    { to: '/dashboard', label: 'Dashboard',     show: !!user },
    { to: '/bookings',  label: 'Bookings',      show: !!user },
    { to: '/wallet',    label: 'Wallet',        show: !!user },
  ].filter((i) => i.show);

  // Mentor-only items get their own group in the drawer so the desktop nav
  // stays compact.
  const mentorItems = isMentor ? [
    { to: '/mentor/settings',     label: 'Mentor settings' },
    { to: '/mentor/availability', label: 'Availability' },
    { to: '/mentor/earnings',     label: 'Earnings' },
    { to: '/mentor/kyc',          label: 'KYC' },
    { to: '/mentor/reviews',      label: 'Reviews' },
  ] : [];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="inline-block h-6 w-6 rounded-md bg-slate-900" />
          <span className="font-semibold text-slate-900">unmute</span>
        </Link>

        {/* Desktop nav (≥640px) */}
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map((it) => <NavItem key={it.to} to={it.to}>{it.label}</NavItem>)}
        </nav>

        <div className="flex items-center gap-2">
          {!user && (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
              <Button size="sm" onClick={() => navigate('/register')}>Get started</Button>
            </>
          )}
          {user && (
            <>
              <NotificationBell />
              <Link
                to="/me/profile"
                className="text-sm text-slate-600 hover:text-slate-900 hidden md:inline ml-1 truncate max-w-[160px]"
              >
                {user.full_name}
              </Link>
              <Button
                variant="secondary" size="sm"
                className="hidden sm:inline-flex"
                onClick={async () => { await logout(); navigate('/'); }}
              >
                Sign out
              </Button>
            </>
          )}

          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-700 hover:bg-slate-100"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          {/* Backdrop — tap to close */}
          <div
            className="sm:hidden fixed inset-0 top-14 bg-slate-900/40 z-20"
            onClick={() => setMenuOpen(false)}
          />
          <div className="sm:hidden absolute left-0 right-0 top-14 z-30 bg-white border-b border-slate-200 shadow-lg">
            <nav className="px-4 py-3 flex flex-col gap-1">
              {navItems.map((it) => (
                <MobileNavItem key={it.to} to={it.to}>{it.label}</MobileNavItem>
              ))}
              {mentorItems.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                    Mentor
                  </p>
                  {mentorItems.map((it) => (
                    <MobileNavItem key={it.to} to={it.to}>{it.label}</MobileNavItem>
                  ))}
                </>
              )}
              {user && (
                <>
                  <hr className="my-2 border-slate-200" />
                  <MobileNavItem to="/me/profile">
                    Profile <span className="text-xs text-slate-500">({user.full_name})</span>
                  </MobileNavItem>
                  <button
                    onClick={async () => { setMenuOpen(false); await logout(); navigate('/'); }}
                    className="text-left px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Sign out
                  </button>
                </>
              )}
              {!user && (
                <>
                  <hr className="my-2 border-slate-200" />
                  <MobileNavItem to="/login">Sign in</MobileNavItem>
                  <MobileNavItem to="/register">Get started</MobileNavItem>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md text-sm font-medium ${
          isActive ? 'text-slate-900 bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function MobileNavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2.5 rounded-lg text-sm font-medium ${
          isActive ? 'text-slate-900 bg-slate-100' : 'text-slate-700 hover:bg-slate-50'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
