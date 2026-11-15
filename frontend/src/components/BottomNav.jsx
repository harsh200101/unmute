import { NavLink } from 'react-router-dom';
import { Compass, Calendar, Wallet, LayoutDashboard, User, LogIn, LifeBuoy } from 'lucide-react';
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
      className="lg:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.25rem)] max-w-md pointer-events-auto"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-1.5 rounded-full bg-card/95 dark:bg-slate-900/95 backdrop-blur-xl border border-border/80 shadow-[0_10px_30px_rgba(0,0,0,0.25)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.6)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-3 rounded-full transition-all duration-200 select-none active:scale-95 ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} strokeWidth={isActive ? 2.4 : 1.8} className="shrink-0 transition-transform" />
                  <span className="text-[10px] tracking-tight leading-tight mt-0.5 whitespace-nowrap">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
