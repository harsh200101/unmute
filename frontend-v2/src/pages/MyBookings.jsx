import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, ArrowUpRight, AlertCircle, X as XIcon,
  Clock as ClockIcon, Filter, Sparkles,
} from 'lucide-react';
import { bookings as bookingsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import StaggeredDropdown from '../components/ui/staggered-dropdown.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate, relativeTime } from '../lib/format.js';
import { STATUS_META, getDisplayStatus } from '../lib/booking-status.js';

const STATUS_FILTERS = [
  { value: '',                    label: 'All statuses' },
  { value: 'scheduled',           label: 'Scheduled' },
  { value: 'in_call',             label: 'In call' },
  { value: 'completed',           label: 'Completed' },
  { value: 'no_show',             label: 'No show' },
  { value: 'cancelled_by_mentee', label: 'Cancelled by me' },
];

export default function MyBookings() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bookingsApi.listMine({ status: statusFilter || undefined, limit: 100 })
      .then((r) => { if (!cancelled) setItems(r.items || []); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up = items.filter((b) =>
      ['scheduled','in_call'].includes(b.status) && new Date(b.slot_end_at).getTime() > now
    );
    const dn = items.filter((b) =>
      !['scheduled','in_call'].includes(b.status) || new Date(b.slot_end_at).getTime() <= now
    );
    return { upcoming: up, past: dn };
  }, [items]);

  const selectedFilter = STATUS_FILTERS.find((f) => f.value === statusFilter) || STATUS_FILTERS[0];

  const filterItems = STATUS_FILTERS.map((f) => ({
    type: 'button',
    onClick: () => setStatusFilter(f.value),
    label: f.label,
    icon: f.value === '' ? XIcon : (STATUS_META[f.value]?.icon || Filter),
  }));

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      {/* ----- Hero ----- */}
      <header className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-medium">
          <Sparkles size={12} /> Your sessions
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          My <span className="bg-gradient-to-br from-brand-600 to-brand-800 dark:from-brand-400 dark:to-brand-200 bg-clip-text text-transparent">bookings</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Upcoming and past sessions. Tap any to view notes, reschedule, or join the call.
        </p>
      </header>

      {/* ----- Filter bar ----- */}
      <div className="bg-card border border-border rounded-2xl shadow-soft p-3 sm:p-4 mb-6 flex items-center gap-3">
        <Filter size={16} className="text-muted-foreground ml-1" />
        <span className="text-sm text-muted-foreground hidden sm:inline">Filter</span>
        <StaggeredDropdown
          label={selectedFilter.label}
          variant="outline"
          size="sm"
          align="left"
          items={filterItems}
        />
        {statusFilter && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter('')}>
            Clear
          </Button>
        )}
        <p className="ml-auto text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? 'booking' : 'bookings'}
        </p>
      </div>

      {/* ----- Upcoming ----- */}
      <section className="mb-10">
        <SectionHeader label="Upcoming" count={upcoming.length} />
        {upcoming.length === 0 ? (
          <EmptyState
            title="No upcoming bookings"
            description="Book a session to see it here."
            cta={<Link to="/mentors"><Button size="md">Find a mentor</Button></Link>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((b) => <BookingRow key={b.uuid} booking={b} me={user} />)}
          </div>
        )}
      </section>

      {/* ----- Past ----- */}
      <section>
        <SectionHeader label="Past" count={past.length} />
        {past.length === 0 ? (
          <EmptyState title="No past bookings yet" description="When sessions wrap, they'll show up here." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map((b) => <BookingRow key={b.uuid} booking={b} me={user} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-baseline gap-2 mb-4">
      <h2 className="text-lg font-semibold text-foreground">{label}</h2>
      <span className="text-sm text-muted-foreground">· {count}</span>
    </div>
  );
}

function EmptyState({ title, description, cta }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl py-10 px-6 text-center">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-muted text-muted-foreground mb-3">
        <CalendarDays size={20} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function BookingRow({ booking, me }) {
  const youAreMentor = me.id === booking.mentor.id;
  const other  = youAreMentor ? booking.mentee : booking.mentor;
  // Use the centralized helper so "scheduled" bookings whose end-time has
  // passed render as "Past · pending wrap-up" instead of stale "Scheduled".
  const status = getDisplayStatus(booking);
  const StatusIcon = status.icon;
  const hasPendingReschedule = !!booking.reschedule_to_at;

  return (
    <Link
      to={`/bookings/${booking.uuid}`}
      className="group relative block bg-card text-card-foreground border border-border rounded-2xl p-5 shadow-soft hover:shadow-elev hover:border-primary/40 transition-all duration-300"
    >
      {/* Soft hover wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tl from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />

      <div className="relative">
        {/* Status pill — top */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
            <StatusIcon size={12} />
            {status.label}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ClockIcon size={12} />
            {relativeTime(booking.slot_start_at)}
          </span>
        </div>

        {/* Identity + date */}
        <div className="flex items-start gap-3">
          <Avatar src={other.avatar_url} name={other.full_name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {youAreMentor ? 'Session with mentee' : 'Session with mentor'}
            </p>
            <p className="font-semibold text-foreground truncate">{other.full_name}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatDate(booking.slot_start_at)}
            </p>
          </div>
        </div>

        {/* Reschedule notice */}
        {hasPendingReschedule && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-1 text-xs">
            <AlertCircle size={12} />
            Reschedule proposed → {formatDate(booking.reschedule_to_at)}
          </div>
        )}

        {/* CTA — slides on hover */}
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-end text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
          View details <ArrowUpRight size={14} className="ml-1" />
        </div>
      </div>
    </Link>
  );
}
