import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar, Clock } from 'lucide-react';
import { mentors as mentorsApi, availability as avApi, bookings as bookingsApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import Avatar from '../components/Avatar.jsx';
import { formatPerMinute, formatDate, formatTime } from '../lib/format.js';

// Helpers
function startOfDay(d) {
  const x = new Date(d); x.setHours(0,0,0,0); return x;
}
function dateLabel(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Book() {
  const { uuid } = useParams();
  const navigate = useNavigate();

  const [mentor, setMentor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));
  const [picked, setPicked] = useState(null);
  const [mentee_title, setTitle] = useState('');
  const [mentee_topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load mentor + a 14-day window of slots
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86400_000).toISOString();
    Promise.all([mentorsApi.byUuid(uuid), avApi.slots(uuid, { from, to })])
      .then(([m, s]) => {
        if (cancelled) return;
        setMentor(m.mentor);
        setSlots(s.slots || []);
      })
      .catch(() => { if (!cancelled) setMentor(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uuid]);

  // Group slots by date string
  const slotsByDay = useMemo(() => {
    const buckets = new Map();
    for (const s of slots) {
      const key = new Date(s).toDateString();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(s);
    }
    return buckets;
  }, [slots]);

  // 14-day strip
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + i);
    return d;
  }), []);

  const slotsForSelected = slotsByDay.get(selectedDay.toDateString()) || [];

  async function submit() {
    if (!picked) return;
    setSubmitting(true);
    try {
      const r = await bookingsApi.create({
        mentor_uuid: uuid,
        slot_start_at: picked,
        mentee_title: mentee_title.trim() || null,
        mentee_topic: mentee_topic.trim() || null,
      });
      toast.success('Booked. Calendar invite sent to your email.');
      navigate(`/bookings/${r.booking.uuid}`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <PageSpinner />;
  if (!mentor) return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Mentor not found</h1>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start gap-4 mb-6">
        <Avatar src={mentor.user.avatar_url} name={mentor.user.full_name} size={56} />
        <div>
          <p className="text-sm text-slate-500">Book a session with</p>
          <h1 className="text-2xl font-bold text-slate-900">{mentor.user.full_name}</h1>
          <p className="text-sm text-slate-600">
            {formatPerMinute(mentor.pricing_tier?.per_minute_paise)} · 5-min minimum charge once both joined
          </p>
          {Array.isArray(mentor.languages) && mentor.languages.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              Speaks {mentor.languages.map((l) => l.toUpperCase()).join(', ')}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calendar size={16} /> Pick a date
          </h2>
        </CardHeader>
        <CardBody>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {days.map((d) => {
              const has = (slotsByDay.get(d.toDateString()) || []).length;
              const isSelected = d.toDateString() === selectedDay.toDateString();
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => { setSelectedDay(d); setPicked(null); }}
                  className={`shrink-0 px-3 py-2 rounded-lg border text-sm min-w-[88px] ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : has
                        ? 'border-slate-300 bg-white hover:border-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                  }`}
                  disabled={!has && !isSelected}
                >
                  <div className="text-xs uppercase">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                  <div className="font-semibold">{d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</div>
                  <div className={`text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {has ? `${has} slot${has > 1 ? 's' : ''}` : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Clock size={16} /> Slots on {dateLabel(selectedDay)}
          </h2>
        </CardHeader>
        <CardBody>
          {loadingSlots ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : slotsForSelected.length === 0 ? (
            <p className="text-sm text-slate-500">No slots available this day. Try another date.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slotsForSelected.map((s) => (
                <button
                  key={s}
                  onClick={() => setPicked(s)}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    picked === s
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                >
                  {formatTime(s)}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {picked && (
        <Card className="mt-4">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">Confirm booking</h2>
            <p className="text-xs text-slate-500 mt-1">{formatDate(picked)}</p>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Session title (optional)" htmlFor="title">
              <Input id="title" value={mentee_title} onChange={(e) => setTitle(e.target.value)}
                placeholder="What's on your mind?" maxLength={120} />
            </Field>
            <Field label="What do you want to discuss? (optional)" htmlFor="topic">
              <textarea id="topic" rows={4} value={mentee_topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="Background, the specific outcome you want…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
              />
            </Field>
            <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
              <strong>How billing works:</strong> Booking is free. We only charge while you and your mentor
              are both on the call — by the minute. 5-min minimum once both join. Sessions cap at 60 minutes.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPicked(null)}>Pick another</Button>
              <Button onClick={submit} loading={submitting}>Confirm booking</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
