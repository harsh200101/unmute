import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookings as bookingsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Avatar from '../components/Avatar.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate, formatTime, relativeTime } from '../lib/format.js';

const STATUS_LABEL = {
  scheduled: { label: 'Scheduled', tone: 'bg-blue-50 text-blue-700' },
  in_call: { label: 'In call', tone: 'bg-emerald-50 text-emerald-700' },
  completed: { label: 'Completed', tone: 'bg-slate-100 text-slate-700' },
  no_show: { label: 'No show', tone: 'bg-amber-50 text-amber-700' },
  cancelled_by_mentee: { label: 'Cancelled', tone: 'bg-rose-50 text-rose-700' },
  cancelled_by_mentor: { label: 'Cancelled (mentor)', tone: 'bg-rose-50 text-rose-700' },
  cancelled_admin: { label: 'Cancelled (admin)', tone: 'bg-rose-50 text-rose-700' },
};

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

  if (loading) return <PageSpinner />;

  const now = Date.now();
  const upcoming = items.filter((b) =>
    ['scheduled','in_call'].includes(b.status) && new Date(b.slot_end_at).getTime() > now
  );
  const past = items.filter((b) =>
    !['scheduled','in_call'].includes(b.status) || new Date(b.slot_end_at).getTime() <= now
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My bookings</h1>
          <p className="text-slate-600 mt-1">Upcoming and past sessions.</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_call">In call</option>
          <option value="completed">Completed</option>
          <option value="no_show">No show</option>
          <option value="cancelled_by_mentee">Cancelled by me</option>
        </select>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <Card><CardBody className="text-center py-8 text-slate-500">
            No upcoming bookings. <Link to="/mentors" className="underline text-slate-900">Find a mentor</Link>
          </CardBody></Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b) => <Row key={b.uuid} booking={b} me={user} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Past ({past.length})
        </h2>
        {past.length === 0 ? (
          <Card><CardBody className="text-center py-6 text-slate-500">No past bookings yet.</CardBody></Card>
        ) : (
          <div className="space-y-3">
            {past.map((b) => <Row key={b.uuid} booking={b} me={user} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ booking, me }) {
  const youAreMentor = me.id === booking.mentor.id;
  const other = youAreMentor ? booking.mentee : booking.mentor;
  const status = STATUS_LABEL[booking.status] || { label: booking.status, tone: 'bg-slate-100 text-slate-700' };
  const hasPendingReschedule = !!booking.reschedule_to_at;

  return (
    <Card>
      <CardBody className="!py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={other.full_name} size={42} />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">
              {youAreMentor ? 'with ' : 'with '}{other.full_name}
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(booking.slot_start_at)} ({relativeTime(booking.slot_start_at)})
            </p>
            {hasPendingReschedule && (
              <p className="text-xs text-amber-700 mt-1">
                Reschedule proposed → {formatDate(booking.reschedule_to_at)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.tone}`}>{status.label}</span>
          <Link to={`/bookings/${booking.uuid}`}>
            <Button size="sm" variant="secondary">View</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
