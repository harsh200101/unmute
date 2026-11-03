import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar as CalendarIcon, Clock, Shield } from 'lucide-react';
import { mentors as mentorsApi, availability as avApi, bookings as bookingsApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import MonthCalendar from '../components/ui/calendar.jsx';
import CrisisSupportModal from '../components/CrisisSupportModal.jsx';
import Avatar from '../components/Avatar.jsx';
import { INTENT_TYPES, DEFAULT_INTENT } from '../lib/intentTypes.js';
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
  const [intent_type, setIntentType] = useState(DEFAULT_INTENT);
  const [submitting, setSubmitting] = useState(false);
  const [crisisOpen, setCrisisOpen] = useState(false);

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

  // Day keys (toDateString) with at least one slot — feeds the calendar.
  const availableDates = useMemo(
    () => new Set(slotsByDay.keys()),
    [slotsByDay]
  );

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
        intent_type,
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
          <p className="text-sm text-muted-foreground">Book a session with</p>
          <h1 className="text-2xl font-bold text-foreground">{mentor.user.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {formatPerMinute(mentor.pricing_tier?.per_minute_paise)} · 15-min minimum charge once both joined
          </p>
          {Array.isArray(mentor.languages) && mentor.languages.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Speaks {mentor.languages.map((l) => l.toUpperCase()).join(', ')}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <CalendarIcon size={16} /> Pick a date
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Indigo days have available slots in the next 14 days.
          </p>
        </CardHeader>
        <CardBody>
          <MonthCalendar
            selected={selectedDay}
            onSelect={(d) => { setSelectedDay(d); setPicked(null); }}
            availableDates={availableDates}
          />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Clock size={16} /> Slots on {dateLabel(selectedDay)}
          </h2>
        </CardHeader>
        <CardBody>
          {loadingSlots ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : slotsForSelected.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots available this day. Try another date.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slotsForSelected.map((s) => (
                <button
                  key={s}
                  onClick={() => setPicked(s)}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    picked === s
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/60'
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
            <h2 className="font-semibold text-foreground">Confirm booking</h2>
            <p className="text-xs text-muted-foreground mt-1">{formatDate(picked)}</p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">
                Session Intent — How should your mentor help?
              </label>
              <p className="text-xs text-muted-foreground">
                Select the focus of your session so your mentor knows how best to support you.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {Object.values(INTENT_TYPES).map((intent) => {
                  const Icon = intent.icon;
                  const isSelected = intent_type === intent.id;
                  return (
                    <button
                      key={intent.id}
                      type="button"
                      onClick={() => setIntentType(intent.id)}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? `${intent.colorScheme.activeBorder} ${intent.colorScheme.bg} shadow-sm`
                          : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`p-1.5 rounded-lg ${intent.colorScheme.bg} ${intent.colorScheme.iconColor}`}>
                          <Icon size={18} />
                        </span>
                        <span className="font-semibold text-sm text-foreground">
                          {intent.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                        {intent.tagline}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <Field label="Session title (optional)" htmlFor="title">
              <Input id="title" value={mentee_title} onChange={(e) => setTitle(e.target.value)}
                placeholder="What's on your mind?" maxLength={120} />
            </Field>
            <Field label="What do you want to discuss? (optional)" htmlFor="topic">
              <textarea id="topic" rows={4} value={mentee_topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="Background, the specific outcome you want…"
                className="w-full rounded-lg border border-input bg-card text-card-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
            <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
              <strong>How billing works:</strong> Booking is free. We only charge while you and your mentor
              are both on the call — by the minute. 15-min minimum once both join. Sessions cap at 60 minutes.
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
