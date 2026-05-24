import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

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
          <h1 className="text-2xl font-bold text-slate-900">Availability</h1>
          <p className="text-slate-600 mt-1">
            Set the recurring weekly slots you offer. Each slot is exactly 60 minutes.
          </p>
        </div>
        <Button onClick={saveTemplate} loading={saving}>Save weekly template</Button>
      </header>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Weekly template</h2>
          <p className="text-xs text-slate-500 mt-1">Times are in your local timezone (set on your mentor profile).</p>
        </CardHeader>
        <CardBody className="space-y-3">
          {DOW.map((label, day) => (
            <div key={day} className="flex items-start gap-4 py-2 border-b border-slate-100 last:border-0">
              <div className="w-24 shrink-0 text-sm font-medium text-slate-700 pt-2">{label}</div>
              <div className="flex-1">
                {byDay[day].length === 0 ? (
                  <p className="text-sm text-slate-400 py-2">No slots</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {byDay[day].map((s) => (
                      <div key={s.idx} className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1.5">
                        <input
                          type="time"
                          value={s.start_time_local}
                          onChange={(e) => updateSlot(s.idx, e.target.value)}
                          className="bg-transparent text-sm focus:outline-none"
                        />
                        <button onClick={() => removeSlot(s.idx)} className="text-slate-500 hover:text-rose-600" aria-label="Remove">
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
          <h2 className="font-semibold text-slate-900">One-off overrides</h2>
          <p className="text-xs text-slate-500 mt-1">
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
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

          <div className="mt-5 divide-y divide-slate-100">
            {overrides.length === 0 ? (
              <p className="text-sm text-slate-400 py-3">No overrides set.</p>
            ) : overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    o.action === 'block' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {o.action.toUpperCase()}
                  </span>
                  <span className="ml-3 text-sm text-slate-700">{formatDate(o.slot_at)}</span>
                  {o.reason && <span className="ml-2 text-xs text-slate-500">— {o.reason}</span>}
                </div>
                <button onClick={() => deleteOverride(o.id)}
                  className="text-slate-500 hover:text-rose-600" aria-label="Remove">
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
