import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Calendar, Video, Star } from 'lucide-react';
import { bookings as bookingsApi, availability as avApi, reviews as reviewsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Avatar from '../components/Avatar.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate, formatTime, formatPerMinute, relativeTime } from '../lib/format.js';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const JOIN_WINDOW_BEFORE_MS = 5 * 60 * 1000;

export default function BookingDetail() {
  const { uuid } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  // Reviews for this booking (loaded once after we have the booking)
  const [myReview, setMyReview] = useState(null);     // I wrote about the other party
  const [theirReview, setTheirReview] = useState(null); // other party wrote about me
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [slots, setSlots] = useState([]);
  const [pickedSlot, setPickedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const r = await bookingsApi.byUuid(uuid);
      setBooking(r.booking);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load booking');
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, [uuid]);

  // Once we have a completed booking, fetch reviews tied to it. We fetch
  // both directions (mine + about-me) and filter by booking_uuid client-side,
  // since the API doesn't expose a per-booking review endpoint.
  useEffect(() => {
    if (!booking || booking.status !== 'completed') return;
    let cancelled = false;
    setReviewsLoading(true);
    Promise.all([
      reviewsApi.given({ limit: 100 }).catch(() => ({ items: [] })),
      reviewsApi.received({ limit: 100 }).catch(() => ({ items: [] })),
    ])
      .then(([g, r]) => {
        if (cancelled) return;
        setMyReview((g.items || []).find((x) => x.booking_uuid === booking.uuid) || null);
        setTheirReview((r.items || []).find((x) => x.booking_uuid === booking.uuid) || null);
      })
      .finally(() => { if (!cancelled) setReviewsLoading(false); });
    return () => { cancelled = true; };
  }, [booking?.uuid, booking?.status]);

  async function loadReschedSlots() {
    if (!booking) return;
    setLoadingSlots(true);
    try {
      const from = new Date(Date.now() + FOUR_HOURS_MS + 60_000).toISOString();
      const to = new Date(Date.now() + 14 * 86400_000).toISOString();
      const r = await avApi.slots(booking.mentor.profile_uuid, { from, to });
      setSlots((r.slots || []).filter((s) => s !== booking.slot_start_at));
    } catch (e) {
      toast.error('Failed to load slots');
    } finally { setLoadingSlots(false); }
  }

  if (loading) return <PageSpinner />;
  if (!booking) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Booking not found</h1>
      <Link to="/bookings" className="inline-block mt-3 underline">Back to my bookings</Link>
    </div>
  );

  const youAreMentor = user.id === booking.mentor.id;
  const role = youAreMentor ? 'mentor' : 'mentee';
  const other = youAreMentor ? booking.mentee : booking.mentor;

  const startMs = new Date(booking.slot_start_at).getTime();
  const endMs = new Date(booking.slot_end_at).getTime();
  const now = Date.now();
  const inJoinWindow = now >= startMs - JOIN_WINDOW_BEFORE_MS && now < endMs;
  const msToStart = startMs - now;
  const lateCancel = msToStart < FOUR_HOURS_MS;
  const isCancellable = booking.status === 'scheduled';
  const isReschedulable = booking.status === 'scheduled' && msToStart > FOUR_HOURS_MS && !booking.reschedule_to_at;
  const isRescheduleTarget = !!booking.reschedule_to_at && booking.reschedule_proposed_by_user_id !== user.id;
  const isReschedulingProposer = !!booking.reschedule_to_at && booking.reschedule_proposed_by_user_id === user.id;

  async function doCancel() {
    setCancelBusy(true);
    try {
      const r = await bookingsApi.cancel(booking.uuid, cancelReason || null);
      toast.success(r.late ? `Cancelled. ₹50 late-cancel fee applied.` : 'Cancelled.');
      setCancelOpen(false);
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Cancel failed');
    } finally { setCancelBusy(false); }
  }

  async function doReschedule() {
    if (!pickedSlot) return;
    setRescheduleBusy(true);
    try {
      await bookingsApi.reschedule(booking.uuid, pickedSlot);
      toast.success(`Reschedule proposed. Waiting on ${other.full_name}.`);
      setRescheduleOpen(false);
      setPickedSlot(null);
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Reschedule failed');
    } finally { setRescheduleBusy(false); }
  }

  async function acceptReschedule() {
    try {
      await bookingsApi.acceptReschedule(booking.uuid);
      toast.success('Reschedule accepted. Calendar invite updated.');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Accept failed');
    }
  }
  async function declineReschedule() {
    try {
      await bookingsApi.declineReschedule(booking.uuid);
      toast.success('Reschedule declined. Original time stands.');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Decline failed');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <header className="flex items-start gap-4">
        <Avatar src={other.avatar_url} name={other.full_name} size={56} />
        <div className="flex-1">
          <p className="text-sm text-slate-500">Session {youAreMentor ? 'with mentee' : 'with mentor'}</p>
          <h1 className="text-2xl font-bold text-slate-900">{other.full_name}</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {formatDate(booking.slot_start_at)} — {formatTime(booking.slot_end_at)}
            <span className="text-slate-400"> · {relativeTime(booking.slot_start_at)}</span>
          </p>
          {!youAreMentor && (
            <p className="text-xs text-slate-500 mt-0.5">
              Rate snapshot: {formatPerMinute(booking.per_minute_paise_snapshot)}
            </p>
          )}
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 capitalize">
          {booking.status.replaceAll('_', ' ')}
        </span>
      </header>

      {/* Join CTA when in window */}
      {inJoinWindow && booking.status !== 'completed' && booking.status !== 'no_show' && (
        <Card className="border-emerald-300">
          <CardBody className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-emerald-800">It's time. Your meeting is open.</p>
              <p className="text-xs text-emerald-700">Both of you join from this page to start billing.</p>
            </div>
            <Button onClick={() => navigate(`/meetings/${booking.uuid}`)}>
              <Video size={16} /> Join meeting
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Reschedule banner */}
      {isRescheduleTarget && (
        <Card className="border-amber-300">
          <CardBody>
            <p className="font-semibold text-amber-900">
              {other.full_name} proposed a new time
            </p>
            <p className="text-sm text-amber-900 mt-1">
              From <strong>{formatDate(booking.slot_start_at)}</strong>{' '}
              <ArrowRight size={14} className="inline" />{' '}
              <strong>{formatDate(booking.reschedule_to_at)}</strong>
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={acceptReschedule}>Accept</Button>
              <Button variant="secondary" onClick={declineReschedule}>Decline</Button>
            </div>
          </CardBody>
        </Card>
      )}
      {isReschedulingProposer && (
        <Card className="border-slate-300">
          <CardBody>
            <p className="text-sm text-slate-700">
              You proposed a new time → {formatDate(booking.reschedule_to_at)}. Waiting for {other.full_name} to accept or decline.
            </p>
          </CardBody>
        </Card>
      )}

      {booking.mentee_title && (
        <Card>
          <CardHeader><h2 className="font-semibold text-slate-900">Topic</h2></CardHeader>
          <CardBody>
            <p className="text-sm text-slate-900 font-medium">{booking.mentee_title}</p>
            {booking.mentee_topic && (
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{booking.mentee_topic}</p>
            )}
          </CardBody>
        </Card>
      )}

      {isCancellable && (
        <div className="flex flex-wrap gap-2 justify-end">
          {isReschedulable && (
            <Button variant="secondary" onClick={() => { setRescheduleOpen(true); loadReschedSlots(); }}>
              <Calendar size={16} /> Reschedule
            </Button>
          )}
          <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel booking</Button>
        </div>
      )}

      {booking.status === 'completed' && (
        <ReviewSection
          booking={booking}
          youAreMentor={youAreMentor}
          other={other}
          myReview={myReview}
          theirReview={theirReview}
          loading={reviewsLoading}
          onSubmitted={(r) => setMyReview(r)}
        />
      )}

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel booking">
        <p className="text-sm text-slate-700">
          {lateCancel
            ? <>This is within 4 hours of the slot — a <strong>₹50</strong> late-cancel fee will apply (paid to the other party).</>
            : <>Free cancellation (more than 4 hours out).</>}
        </p>
        <div className="mt-3">
          <Field label="Reason (optional)" htmlFor="reason">
            <Input id="reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Anything you want the other person to know" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>Keep</Button>
          <Button variant="danger" onClick={doCancel} loading={cancelBusy}>Cancel booking</Button>
        </div>
      </Modal>

      <Modal open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Propose a new time" maxWidth="max-w-lg">
        <p className="text-sm text-slate-700">
          Pick from {other.full_name}'s available slots (must be at least 4h from now). The other party has to accept.
        </p>
        <div className="mt-3 max-h-72 overflow-auto">
          {loadingSlots ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-slate-500">No other slots available in the next 14 days.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  onClick={() => setPickedSlot(s)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm ${
                    pickedSlot === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                >
                  {formatDate(s)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
          <Button onClick={doReschedule} loading={rescheduleBusy} disabled={!pickedSlot}>
            Propose reschedule
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// --- Review section --------------------------------------------------------

function ReviewSection({ booking, youAreMentor, other, myReview, theirReview, loading, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      toast.error('Pick a star rating first');
      return;
    }
    setBusy(true);
    try {
      const res = await reviewsApi.submit(booking.uuid, {
        rating,
        body: body.trim() || null,
        is_anonymous: youAreMentor ? false : anonymous, // only mentees can be anonymous
      });
      toast.success('Thanks for the review!');
      onSubmitted(res.review);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900">Reviews</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {youAreMentor
            ? 'Leave a private note for your mentee, and see what they wrote about the session.'
            : 'Help others — share how this session went.'}
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading reviews…</p>
        ) : (
          <>
            {/* What the other party wrote about me */}
            {theirReview ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-1">
                  {theirReview.is_anonymous ? 'Anonymous' : other.full_name} wrote about you
                </p>
                <StarRow value={theirReview.rating} />
                {theirReview.body && (
                  <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap">{theirReview.body}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                {other.full_name} hasn't left a review yet.
              </p>
            )}

            {/* My review */}
            {myReview ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700 mb-1">You reviewed {other.full_name}</p>
                <StarRow value={myReview.rating} />
                {myReview.body && (
                  <p className="text-sm text-emerald-900 mt-2 whitespace-pre-wrap">{myReview.body}</p>
                )}
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">
                    Your rating for {other.full_name}
                  </p>
                  <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        className="p-0.5 text-amber-500 hover:scale-110 transition-transform"
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      >
                        <Star
                          size={26}
                          strokeWidth={1.5}
                          fill={(hover || rating) >= n ? 'currentColor' : 'transparent'}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Comment (optional)" htmlFor="rv_body">
                  <textarea
                    id="rv_body"
                    rows={3}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={
                      youAreMentor
                        ? 'A few private words about the session — only the mentee sees this.'
                        : 'How did this session go? What was helpful?'
                    }
                    maxLength={1000}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                  />
                </Field>
                {!youAreMentor && (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={anonymous}
                      onChange={(e) => setAnonymous(e.target.checked)}
                    />
                    Post anonymously (hides your name from the public mentor profile)
                  </label>
                )}
                <div className="flex justify-end">
                  <Button type="submit" loading={busy}>Submit review</Button>
                </div>
              </form>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function StarRow({ value }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={16} strokeWidth={1.5} fill={n <= value ? 'currentColor' : 'transparent'} />
      ))}
    </div>
  );
}
