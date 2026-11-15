import { NavLink, Link } from 'react-router-dom';
import { Compass, Calendar, Wallet, LayoutDashboard, User, LogIn, LifeBuoy, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function BottomNav() {
  const { user } = useAuth();
  const isMentor = user?.role === 'mentor';

  const navItems = user
    ? [
        { to: '/mentors', label: 'Explore', icon: Compass },
        { to: '/bookings', label: 'Bookings', icon: Calendar },
        { to: '/wallet', label: 'Wallet', icon: Wallet },
        { to: isMentor ? '/mentor/availability' : '/dashboard', label: isMentor ? 'Availability' : 'Dashboard', icon: LayoutDashboard },
        { to: '/me/profile', label: 'Profile', icon: User },
      ]
    : [
        { to: '/', label: 'Home', icon: Compass },
        { to: '/mentors', label: 'Mentors', icon: Compass },
        { to: '/crisis', label: 'Crisis', icon: LifeBuoy },
        { to: '/login', label: 'Sign in', icon: LogIn },
      ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="lg:hidden fixed left-1/2 -translate-x-1/2 z-40 w-auto max-w-[calc(100%-1rem)] pointer-events-auto"
      style={{
        bottom: 'max(0.75rem, calc(0.5rem + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-full bg-background/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-border/80 shadow-[0_12px_36px_rgba(0,0,0,0.18)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.65)]">
        {/* Floating AI/Crisis Quick Action button (Image 1 style) */}
        <Link
          to="/crisis"
          className="relative group shrink-0 w-8.5 h-8.5 rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-indigo-500 text-white flex items-center justify-center shadow-sm active:scale-90 transition-transform ml-0.5"
          title="24/7 Crisis Help & Support"
          aria-label="Crisis Help"
        >
          <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
        </Link>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `transition-all duration-300 select-none active:scale-95 ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 font-semibold px-3 sm:px-3.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs shadow-sm'
                      : 'flex flex-col items-center justify-center px-2 sm:px-2.5 py-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 font-medium'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={isActive ? 16 : 18}
                      strokeWidth={isActive ? 2.4 : 1.8}
                      className="shrink-0 transition-transform"
                    />
                    {isActive ? (
                      <span className="text-xs font-semibold whitespace-nowrap tracking-tight animate-in fade-in duration-200">
                        {item.label}
                      </span>
                    ) : (
                      <span className="text-[10px] tracking-tight leading-tight mt-0.5 whitespace-nowrap">
                        {item.label}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
