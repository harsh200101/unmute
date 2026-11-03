import { useEffect, useState } from 'react';
import { Plus, Trash2, Zap, Clock, Power, Sparkles, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { availability as avApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate } from '../lib/format.js';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function MentorAvailability() {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState([]); // [{day_of_week, start_time_local}]
  const [overrides, setOverrides] = useState([]);
  const [saving, setSaving] = useState(false);

  // Available Now Live state
  const [isAvailableNow, setIsAvailableNow] = useState(false);
  const [availableNowUntil, setAvailableNowUntil] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [togglingLive, setTogglingLive] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState('');

  const [newOverride, setNewOverride] = useState({ slot_at: '', action: 'block', reason: '' });

  async function reload() {
    setLoading(true);
    try {
      const r = await avApi.getMine();
      setTemplate(r.template.map((t) => ({
        day_of_week: t.day_of_week,
        // pg returns TIME as 'HH:MM:SS' — trim to 'HH:MM'
        start_time_local: (t.start_time_local || '').slice(0, 5),
      })));
      setOverrides(r.overrides || []);
      setIsAvailableNow(Boolean(r.is_available_now));
      setAvailableNowUntil(r.available_now_until || null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  // Live countdown timer ticker
  useEffect(() => {
    if (!isAvailableNow || !availableNowUntil) {
      setTimeLeftStr('');
      return;
    }
    function updateTimer() {
      const diff = new Date(availableNowUntil).getTime() - Date.now();
      if (diff <= 0) {
        setIsAvailableNow(false);
        setAvailableNowUntil(null);
        setTimeLeftStr('00:00');
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      if (hrs > 0) {
        setTimeLeftStr(`${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`);
      } else {
        setTimeLeftStr(`${mins}m ${secs.toString().padStart(2, '0')}s`);
      }
    }
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isAvailableNow, availableNowUntil]);

  async function handleToggleLive(enable) {
    setTogglingLive(true);
    try {
      const res = await avApi.toggleAvailableNow({
        enabled: enable,
        duration_minutes: durationMinutes,
      });
      setIsAvailableNow(Boolean(res.is_available_now));
      setAvailableNowUntil(res.available_now_until || null);
      if (enable) {
        toast.success(`You are now LIVE for ${durationMinutes} minutes! Mentees can connect instantly.`);
      } else {
        toast.success('Live availability turned off.');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update live status');
    } finally {
      setTogglingLive(false);
    }
  }

  function addSlot(day) {
    setTemplate((cur) => [...cur, { day_of_week: day, start_time_local: '18:00' }]);
  }

  function removeSlot(idx) {
    setTemplate((cur) => cur.filter((_, i) => i !== idx));
  }

  function updateSlot(idx, value) {
    setTemplate((cur) => cur.map((s, i) => i === idx ? { ...s, start_time_local: value } : s));
  }

  async function saveTemplate() {
    setSaving(true);
    try {
      // Dedup before sending
      const seen = new Set();
      const cleaned = template.filter((s) => {
        const k = `${s.day_of_week}-${s.start_time_local}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await avApi.putTemplate(cleaned);
      toast.success('Availability saved');
      await reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addOverride() {
    if (!newOverride.slot_at) { toast.error('Pick a date/time'); return; }
    try {
      await avApi.addOverride({
        slot_at: new Date(newOverride.slot_at).toISOString(),
        action: newOverride.action,
        reason: newOverride.reason || null,
      });
      setNewOverride({ slot_at: '', action: 'block', reason: '' });
      toast.success('Override added');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add override');
    }
  }

  async function deleteOverride(id) {
    if (!window.confirm('Delete this override?')) return;
    try {
      await avApi.deleteOverride(id);
      toast.success('Removed');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  }

  if (loading) return <PageSpinner />;

  // Group template by day
  const byDay = Array.from({ length: 7 }, () => []);
  template.forEach((s, idx) => byDay[s.day_of_week].push({ ...s, idx }));
  byDay.forEach((arr) => arr.sort((a, b) => a.start_time_local.localeCompare(b.start_time_local)));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Availability</h1>
          <p className="text-muted-foreground mt-1">
            Set the recurring weekly slots you offer. Each slot is exactly 60 minutes.
          </p>
        </div>
        <Button onClick={saveTemplate} loading={saving}>Save weekly template</Button>
      </header>

      {/* ----------------- GO LIVE: AVAILABLE TO TALK NOW CARD ----------------- */}
      <div className={`mb-8 rounded-2xl border transition-all duration-300 overflow-hidden ${
        isAvailableNow
          ? 'bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/40 shadow-soft ring-1 ring-emerald-500/20'
          : 'bg-card border-border shadow-soft'
      }`}>
        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                isAvailableNow
                  ? 'bg-emerald-500 text-white shadow-soft'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              }`}>
                <Zap size={22} className={isAvailableNow ? 'animate-pulse' : ''} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    Go Live: Available to Talk Now
                  </h2>
                  {isAvailableNow && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500 text-white shadow-xs">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                      </span>
                      LIVE NOW
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  {isAvailableNow
                    ? 'You are actively online and marked available. Mentees can connect with you instantly for 1-on-1 sessions.'
                    : 'Free right now? Turn on instant matching so mentees can connect immediately without booking days in advance.'}
                </p>
              </div>
            </div>

            {/* Action Area */}
            <div className="flex flex-col sm:items-end gap-3 shrink-0">
              {isAvailableNow ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center justify-end gap-1 font-medium">
                      <Clock size={12} /> Time remaining
                    </p>
                    <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {timeLeftStr || 'Active'}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => handleToggleLive(false)}
                    loading={togglingLive}
                    className="flex items-center gap-1.5"
                  >
                    <Power size={14} /> End Live
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-muted p-1 rounded-xl border border-border">
                    {[
                      { mins: 30, label: '30m' },
                      { mins: 60, label: '60m' },
                      { mins: 120, label: '120m' },
                    ].map((opt) => (
                      <button
                        key={opt.mins}
                        type="button"
                        onClick={() => setDurationMinutes(opt.mins)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                          durationMinutes === opt.mins
                            ? 'bg-card text-foreground shadow-xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="md"
                    onClick={() => handleToggleLive(true)}
                    loading={togglingLive}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
                  >
                    <Zap size={14} /> Go Live
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-foreground">Weekly template</h2>
          <p className="text-xs text-muted-foreground mt-1">Times are in your local timezone (set on your mentor profile).</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {DOW.map((label, day) => (
            <div key={day} className="flex items-start gap-4 py-2 border-b border-slate-100 last:border-0">
              <div className="w-24 shrink-0 text-sm font-medium text-foreground/80 pt-2">{label}</div>
              <div className="flex-1">
                {byDay[day].length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No slots</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {byDay[day].map((s) => (
                      <div key={s.idx} className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1.5">
                        <input
                          type="time"
                          value={s.start_time_local}
                          onChange={(e) => updateSlot(s.idx, e.target.value)}
                          className="bg-transparent text-sm focus:outline-none"
                        />
                        <button onClick={() => removeSlot(s.idx)} className="text-muted-foreground hover:text-rose-600" aria-label="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => addSlot(day)}>
                <Plus size={14} /> Add
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-foreground">One-off overrides</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Block a specific slot (vacation, sick day) or add a one-off slot outside your template.
          </p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
            <Field label="Date & time" htmlFor="ov_at">
              <Input id="ov_at" type="datetime-local" value={newOverride.slot_at}
                onChange={(e) => setNewOverride({ ...newOverride, slot_at: e.target.value })} />
            </Field>
            <Field label="Action" htmlFor="ov_action">
              <select id="ov_action" value={newOverride.action}
                onChange={(e) => setNewOverride({ ...newOverride, action: e.target.value })}
                className="rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm">
                <option value="block">Block</option>
                <option value="add">Add</option>
              </select>
            </Field>
            <Field label="Reason (optional)" htmlFor="ov_reason">
              <Input id="ov_reason" value={newOverride.reason}
                onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
                placeholder="vacation" />
            </Field>
            <Button onClick={addOverride}>Add</Button>
          </div>

          <div className="mt-5 divide-y divide-border">
            {overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No overrides set.</p>
            ) : overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    o.action === 'block' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {o.action.toUpperCase()}
                  </span>
                  <span className="ml-3 text-sm text-foreground/80">{formatDate(o.slot_at)}</span>
                  {o.reason && <span className="ml-2 text-xs text-muted-foreground">— {o.reason}</span>}
                </div>
                <button onClick={() => deleteOverride(o.id)}
                  className="text-muted-foreground hover:text-rose-600" aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
