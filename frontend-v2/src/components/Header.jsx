import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu, X, Sun, Moon, Monitor,
  User as UserIcon, LayoutDashboard, Wallet as WalletIcon,
  Settings as SettingsIcon, Calendar as CalendarIcon, LineChart, LogOut,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTheme } from '../theme/ThemeProvider.jsx';
import Button from './ui/Button.jsx';
import StaggeredDropdown from './ui/staggered-dropdown.jsx';
import NavHeader from './ui/nav-header.jsx';
import Avatar from './Avatar.jsx';
import Logo from './Logo.jsx';
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
    <header className="glass border-b border-border sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 shrink-0 group" aria-label="unmute — home">
          <Logo size={32} className="transition-transform group-hover:scale-105" />
          <span className="font-semibold text-foreground tracking-tight">unmute</span>
        </Link>

        {/* Desktop nav (≥640px) — pill with sliding cursor (NavHeader). */}
        <div className="hidden sm:block">
          <NavHeader items={navItems} />
        </div>

        <div className="flex items-center gap-2">
          {!user && (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
              <Button size="sm" onClick={() => navigate('/register')}>Get started</Button>
            </>
          )}
          <ThemeToggle />
          {user && (
            <>
              <NotificationBell />
              <StaggeredDropdown
                align="right"
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-full p-0.5 hover:bg-muted transition-colors">
                    <Avatar
                      src={user.avatar_url}
                      name={user.full_name}
                      size={32}
                    />
                  </span>
                }
                triggerClassName="inline-flex items-center"
                items={buildUserMenuItems({ isMentor, onSignOut: async () => { await logout(); navigate('/'); } })}
              />
            </>
          )}

          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
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
            className="sm:hidden fixed inset-0 top-14 bg-foreground/40 z-20"
            onClick={() => setMenuOpen(false)}
          />
          <div className="sm:hidden absolute left-0 right-0 top-14 z-30 bg-popover text-popover-foreground border-b border-border shadow-lg">
            <nav className="px-4 py-3 flex flex-col gap-1">
              {navItems.map((it) => (
                <MobileNavItem key={it.to} to={it.to}>{it.label}</MobileNavItem>
              ))}
              {mentorItems.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Mentor
                  </p>
                  {mentorItems.map((it) => (
                    <MobileNavItem key={it.to} to={it.to}>{it.label}</MobileNavItem>
                  ))}
                </>
              )}
              {user && (
                <>
                  <hr className="my-2 border-border" />
                  <MobileNavItem to="/me/profile">
                    Profile <span className="text-xs text-muted-foreground">({user.full_name})</span>
                  </MobileNavItem>
                  <button
                    onClick={async () => { setMenuOpen(false); await logout(); navigate('/'); }}
                    className="text-left px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10"
                  >
                    Sign out
                  </button>
                </>
              )}
              {!user && (
                <>
                  <hr className="my-2 border-border" />
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

function MobileNavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground hover:bg-muted'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

// Items shown in the avatar dropdown when the user is signed in.
// Mentor-only entries are appended conditionally so non-mentor users get a
// short list. Sign out always sits at the bottom with the destructive style.
function buildUserMenuItems({ isMentor, onSignOut }) {
  const common = [
    { type: 'link',   to: '/me/profile', label: 'Profile',     icon: UserIcon },
    { type: 'link',   to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
    { type: 'link',   to: '/wallet',     label: 'Wallet',      icon: WalletIcon },
  ];
  const mentor = [
    { type: 'divider' },
    { header: true,   label: 'Mentor' },
    { type: 'link',   to: '/mentor/settings',     label: 'Settings',     icon: SettingsIcon },
    { type: 'link',   to: '/mentor/availability', label: 'Availability', icon: CalendarIcon },
    { type: 'link',   to: '/mentor/earnings',     label: 'Earnings',     icon: LineChart },
  ];
  const trailer = [
    { type: 'divider' },
    { type: 'button', onClick: onSignOut, label: 'Sign out', icon: LogOut, variant: 'destructive' },
  ];
  return isMentor ? [...common, ...mentor, ...trailer] : [...common, ...trailer];
}

// Three-state theme switcher: light → dark → system → light…
// Shows the icon for the *current effective* theme; tap label rotates choices.
function ThemeToggle() {
  const { choice, effective, cycle } = useTheme();
  // Icon reflects what's currently applied; tooltip shows the active mode.
  const Icon = effective === 'dark' ? Moon : Sun;
  const label =
    choice === 'system' ? `System (${effective})` :
    choice === 'dark'   ? 'Dark mode' : 'Light mode';
  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={`Theme: ${label}. Tap to change.`}
      className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {choice === 'system'
        ? <Monitor size={18} />
        : <Icon size={18} />}
    </button>
  );
}
