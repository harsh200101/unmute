import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Clock, Wallet, Sparkles, Video, ArrowRight,
  Star, TrendingUp, Bell, Shield, Settings, Banknote, MessageSquare,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  bookings as bookingsApi,
  wallet as walletApi,
  notifications as notifsApi,
  reviews as reviewsApi,
} from '../api/endpoints.js';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Avatar from '../components/Avatar.jsx';
import { formatINR, formatDate, relativeTime } from '../lib/format.js';

// Modern, data-rich dashboard. Mobile-first stack; on ≥768px reorganises
// into a 12-col grid. All data is live from existing endpoints. Failures
// degrade silently — a card that can't load just shows an empty state.
export default function Dashboard() {
  const { user } = useAuth();
  const firstName = user.full_name.split(' ')[0];

  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      walletApi.me().catch(() => null),
      bookingsApi.listMine({ limit: 30 }).catch(() => ({ items: [] })),
      notifsApi.list({ limit: 5 }).catch(() => ({ items: [] })),
      reviewsApi.received({ limit: 3 }).catch(() => ({ items: [] })),
    ]).then(([w, b, n, r]) => {
      if (cancelled) return;
      setWallet(w);
      setBookings(b.items || []);
      setNotifs(n.items || []);
      setReviews(r.items || []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // For mentees: walletApi.me() returns { balance_paise: ... } or similar.
  // For mentors: same endpoint, but the mentor's earnings live under
  // `balances.mentor` (kept across both roles). Derive once.
  const menteeBalance = wallet?.balance_paise ?? wallet?.balances?.mentee ?? 0;
  const mentorBalance = wallet?.balances?.mentor ?? 0;

  const now = Date.now();
  const upcoming = useMemo(
    () => bookings
      .filter((b) => ['scheduled', 'in_call'].includes(b.status) && new Date(b.slot_end_at).getTime() > now)
      .sort((a, b) => new Date(a.slot_start_at) - new Date(b.slot_start_at)),
    [bookings, now]
  );
  const nextBooking = upcoming[0];
  const completedCount = bookings.filter((b) => b.status === 'completed').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Hero greeting */}
      <HeroGreeting user={user} firstName={firstName} />

      {/* Stats strip — adapts: 2 cols mobile, 4 cols desktop */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat
          icon={<Wallet size={18} />}
          label={user.role === 'mentor' ? 'Wallet' : 'Wallet'}
          value={wallet ? formatINR(menteeBalance) : '—'}
          tone="brand"
          href="/wallet"
        />
        <Stat
          icon={<Calendar size={18} />}
          label="Upcoming"
          value={upcoming.length}
          tone="sky"
          href="/bookings"
        />
        <Stat
          icon={<Sparkles size={18} />}
          label="Sessions done"
          value={completedCount}
          tone="emerald"
          href="/bookings"
        />
        {user.role === 'mentor' ? (
          <Stat
            icon={<TrendingUp size={18} />}
            label="Earnings"
            value={wallet ? formatINR(mentorBalance) : '—'}
            tone="amber"
            href="/mentor/earnings"
          />
        ) : (
          <Stat
            icon={<Bell size={18} />}
            label="Unread"
            value={notifs.filter((n) => !n.read_at).length}
            tone="amber"
            href="/me/notifications"
          />
        )}
      </div>

      {/* Main column layout */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left column — primary content */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">
          {/* Next session — big hero card if there is one */}
          {nextBooking ? (
            <NextSessionCard booking={nextBooking} user={user} />
          ) : (
            <EmptyNextSessionCard role={user.role} />
          )}

          {/* Recent activity */}
          <ActivityCard notifications={notifs} />

          {/* Recent reviews — only if mentor or any received */}
          {reviews.length > 0 && <RecentReviewsCard reviews={reviews} />}
        </div>

        {/* Right column — quick actions / mentor tools */}
        <div className="lg:col-span-4 space-y-4 sm:space-y-6">
          <QuickActions user={user} />
          {user.role === 'mentor' && <MentorTools mentorBalance={mentorBalance} />}
          {user.role === 'mentee' && <BecomeMentorCTA />}
          {user.role === 'admin' && <AdminCTA />}
        </div>
      </div>

      {!loading && <FootnoteCard />}
    </div>
  );
}

// -- Hero greeting ----------------------------------------------------------

function HeroGreeting({ user, firstName }) {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white px-5 sm:px-8 py-6 sm:py-9 shadow-floaty">
      {/* Decorative blobs */}
      <div aria-hidden className="absolute -top-12 -right-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-brand-400/30 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-brand-200 text-sm font-medium">{part},</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">
            {firstName} 👋
          </h1>
          {!user.email_verified ? (
            // High-contrast amber callout — readable on top of the brand
            // gradient. The plain `text-brand-100/90` underneath was nearly
            // invisible against the indigo bg.
            <div className="mt-3 inline-flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 max-w-md">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse-soft" />
              <span>
                Please verify your email to unlock bookings.{' '}
                <Link to="/verify-email" className="underline font-semibold whitespace-nowrap">Resend link</Link>
              </span>
            </div>
          ) : (
            <p className="mt-2 text-white/90 text-sm sm:text-base max-w-md">
              {user.role === 'mentor'
                ? "Here's how your practice is doing today."
                : "Whatever you're feeling, you don't have to feel it alone."}
            </p>
          )}
        </div>
        <Avatar
          src={user.avatar_url}
          name={user.full_name}
          size={56}
          className="ring-2 ring-white/30 shrink-0 hidden sm:block !text-brand-900 !bg-white"
        />
      </div>
    </div>
  );
}

// -- Stat tile --------------------------------------------------------------

function Stat({ icon, label, value, tone = 'brand', href }) {
  const tones = {
    brand:   'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    sky:     'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  };
  const Comp = href ? Link : 'div';
  return (
    <Comp to={href || undefined}
      className="block bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-soft p-3 sm:p-4 hover:shadow-elev hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className={`inline-flex items-center justify-center h-9 w-9 rounded-xl ${tones[tone] || tones.brand}`}>
        {icon}
      </div>
      <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums truncate">
        {value}
      </p>
    </Comp>
  );
}

// -- Next session card ------------------------------------------------------

function NextSessionCard({ booking, user }) {
  const isMentor = user.id === booking.mentor.id;
  const other = isMentor ? booking.mentee : booking.mentor;
  const startMs = new Date(booking.slot_start_at).getTime();
  const minutesUntil = Math.round((startMs - Date.now()) / 60000);
  const canJoin = minutesUntil <= 5 && Date.now() < new Date(booking.slot_end_at).getTime();

  let countdownLabel;
  if (canJoin)              countdownLabel = 'Open to join now';
  else if (minutesUntil < 60)        countdownLabel = `Starts in ${minutesUntil} min`;
  else if (minutesUntil < 60 * 24)   countdownLabel = `Starts in ${Math.round(minutesUntil / 60)} hr`;
  else                                countdownLabel = `In ${Math.round(minutesUntil / (60 * 24))} days`;

  return (
    <Card className="overflow-hidden">
      <div className={`px-5 sm:px-6 py-2 text-xs font-medium ${canJoin ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300'}`}>
        {canJoin ? '● Live — both can join' : 'Your next session'}
      </div>
      <CardBody>
        <div className="flex items-start gap-4">
          <Avatar src={other.avatar_url} name={other.full_name} size={52} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">{isMentor ? 'with mentee' : 'with mentor'}</p>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{other.full_name}</h3>
            <div className="mt-1 flex items-center flex-wrap gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} /> {formatDate(booking.slot_start_at)}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-slate-100">
                <Clock size={14} /> {countdownLabel}
              </span>
            </div>
            {booking.mentee_title && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 line-clamp-2 italic">"{booking.mentee_title}"</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {canJoin ? (
            <Link to={`/meetings/${booking.uuid}`} className="flex-1 sm:flex-none">
              <Button className="w-full sm:w-auto">
                <Video size={16} /> Join meeting
              </Button>
            </Link>
          ) : (
            <Link to={`/bookings/${booking.uuid}`} className="flex-1 sm:flex-none">
              <Button variant="secondary" className="w-full sm:w-auto">
                View details <ArrowRight size={14} />
              </Button>
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function EmptyNextSessionCard({ role }) {
  return (
    <Card>
      <CardBody className="text-center py-10">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 flex items-center justify-center">
          <Calendar size={22} />
        </div>
        <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">
          {role === 'mentor' ? 'No upcoming sessions' : "Let's book your first session"}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto">
          {role === 'mentor'
            ? 'When a mentee books with you, it will show up here.'
            : 'Find a counsellor or coach you vibe with. Pay only for the minutes you talk.'}
        </p>
        {role !== 'mentor' && (
          <Link to="/mentors" className="inline-block mt-4">
            <Button>Browse mentors</Button>
          </Link>
        )}
      </CardBody>
    </Card>
  );
}

// -- Activity ---------------------------------------------------------------

const NOTIF_ICON = {
  booking_confirmed:    Calendar,
  booking_cancelled:    Calendar,
  review_received:      Star,
  kyc_approved:         Shield,
  kyc_rejected:         Shield,
  mentor_approved:      Sparkles,
  mentor_rejected:      Sparkles,
  topup_succeeded:      Wallet,
  refund_issued:        Banknote,
  withdrawal_succeeded: Banknote,
  withdrawal_failed:    Banknote,
};

function ActivityCard({ notifications }) {
  return (
    <Card>
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2>
        <Link to="/me/notifications" className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline">
          See all
        </Link>
      </div>
      {notifications.length === 0 ? (
        <CardBody className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
          Nothing yet. Activity from your sessions, wallet, and reviews shows here.
        </CardBody>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n) => {
            const Icon = NOTIF_ICON[n.kind] || Bell;
            return (
              <li key={n.id} className={`flex items-start gap-3 px-5 sm:px-6 py-3 ${!n.read_at ? 'bg-brand-50/40 dark:bg-brand-500/10' : ''}`}>
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center">
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{relativeTime(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// -- Recent reviews (for mentors mainly) ------------------------------------

function RecentReviewsCard({ reviews }) {
  return (
    <Card>
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent reviews</h2>
        <Link to="/me/reviews/received" className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline">See all</Link>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {reviews.map((r) => (
          <li key={r.id} className="px-5 sm:px-6 py-3">
            <div className="flex items-center gap-2 text-amber-500">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={14} fill={n <= r.rating ? 'currentColor' : 'transparent'} />
              ))}
              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">{relativeTime(r.created_at)}</span>
            </div>
            {r.body && <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-200 line-clamp-2">"{r.body}"</p>}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">— {r.is_anonymous ? 'Anonymous' : (r.reviewer?.full_name || 'A mentee')}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// -- Quick actions ----------------------------------------------------------

function QuickActions({ user }) {
  return (
    <Card>
      <CardBody>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Quick actions</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <QA to="/mentors" icon={<Sparkles size={16} />} label="Browse mentors" />
          <QA to="/bookings" icon={<Calendar size={16} />} label="My bookings" />
          <QA to="/wallet" icon={<Wallet size={16} />} label="Wallet" />
          <QA to="/me/profile" icon={<Settings size={16} />} label="Profile" />
        </div>
      </CardBody>
    </Card>
  );
}
function QA({ to, icon, label }) {
  return (
    <Link to={to}
      className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600 transition-colors">
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

// -- Mentor tools -----------------------------------------------------------

function MentorTools({ mentorBalance }) {
  return (
    <Card>
      <CardBody>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Mentor tools</h2>
        <div className="mt-3 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200/60 p-3 dark:from-emerald-500/10 dark:to-emerald-600/5 dark:border-emerald-500/20">
          <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Available to withdraw</p>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mt-1 tabular-nums">{formatINR(mentorBalance)}</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Minus pending withdrawals</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <QA to="/mentor/settings"     icon={<Settings size={16} />}     label="Profile" />
          <QA to="/mentor/availability" icon={<Calendar size={16} />}     label="Availability" />
          <QA to="/mentor/earnings"     icon={<Banknote size={16} />}     label="Earnings" />
          <QA to="/mentor/reviews"      icon={<MessageSquare size={16} />} label="Reviews" />
          <QA to="/mentor/kyc"          icon={<Shield size={16} />}        label="KYC" />
        </div>
      </CardBody>
    </Card>
  );
}

// -- Mentee become-mentor CTA ----------------------------------------------

function BecomeMentorCTA() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-5 shadow-elev">
      <div aria-hidden className="absolute -top-10 -right-6 h-32 w-32 rounded-full bg-brand-500/30 blur-3xl" />
      <div className="relative">
        <Sparkles size={18} className="text-amber-300" />
        <h3 className="mt-2 font-semibold">Become a mentor</h3>
        <p className="mt-1 text-sm text-slate-300">Set your rate, keep 70%. Admin reviews in 1-2 business days.</p>
        <Link to="/mentor/apply" className="inline-block mt-3">
          <Button size="sm" className="!bg-white !text-slate-900 hover:!bg-slate-100">
            Apply <ArrowRight size={14} />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function AdminCTA() {
  return (
    <Card>
      <CardBody>
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Admin</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Mentor approvals, KYC, refunds, audit log.</p>
        <Link to="/admin" className="block mt-3">
          <Button className="w-full">Open admin panel</Button>
        </Link>
      </CardBody>
    </Card>
  );
}

// -- Footnote ---------------------------------------------------------------

function FootnoteCard() {
  return (
    <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
      Built with care for the moments that matter.
    </p>
  );
}
