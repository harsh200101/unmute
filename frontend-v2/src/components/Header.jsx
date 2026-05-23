import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Button from './ui/Button.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-md bg-slate-900" />
          <span className="font-semibold text-slate-900">unmute</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1">
          <NavItem to="/mentors">Find mentors</NavItem>
          {user && <NavItem to="/dashboard">Dashboard</NavItem>}
          {user && <NavItem to="/bookings">Bookings</NavItem>}
          {user && <NavItem to="/wallet">Wallet</NavItem>}
        </nav>

        <div className="flex items-center gap-2">
          {!user && (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
              <Button size="sm" onClick={() => navigate('/register')}>Get started</Button>
            </>
          )}
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600 hidden sm:inline">{user.full_name}</span>
              <Button variant="secondary" size="sm" onClick={async () => { await logout(); navigate('/'); }}>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
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
