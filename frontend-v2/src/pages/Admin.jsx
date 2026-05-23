import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin as adminApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate, formatINR, relativeTime } from '../lib/format.js';

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'apps',        label: 'Mentor apps' },
  { id: 'kyc',         label: 'KYC' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'meetings',    label: 'Active meetings' },
  { id: 'users',       label: 'Users' },
  { id: 'audit',       label: 'Audit log' },
];

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') || 'overview';

  function setTab(id) {
    const next = new URLSearchParams(params); next.set('tab', id);
    setParams(next, { replace: true });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
        <p className="text-slate-600 mt-1">Mentor & money operations.</p>
      </header>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${
              active === t.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {active === 'overview' && <Overview setTab={setTab} />}
        {active === 'apps' && <MentorApps />}
        {active === 'kyc' && <KYC />}
        {active === 'withdrawals' && <Withdrawals />}
        {active === 'meetings' && <ActiveMeetings />}
        {active === 'users' && <Users />}
        {active === 'audit' && <AuditLog />}
      </div>
    </div>
  );
}

// --- Tabs ---------------------------------------------------------------

// Platform-wide read-only overview. Stats + recent activity + quick-jumps
// into the action tabs.
function Overview({ setTab }) {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adminApi.stats().catch(() => null),
      adminApi.recentActivity({ limit: 25 }).catch(() => ({ items: [] })),
    ]).then(([s, a]) => {
      if (cancelled) return;
      setStats(s); setActivity(a.items || []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <PageSpinner />;
  if (!stats) {
    return <p className="text-sm text-rose-600">Failed to load stats. Refresh to try again.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Top: action queue — bright, demands attention */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <ActionTile
          tone="amber"
          label="Mentor apps"   value={stats.mentor_apps_pending}
          sub="awaiting review"
          onClick={() => setTab('apps')}
        />
        <ActionTile
          tone="amber"
          label="KYC"           value={stats.kyc_pending}
          sub="awaiting review"
          onClick={() => setTab('kyc')}
        />
        <ActionTile
          tone="amber"
          label="Withdrawals"   value={stats.withdrawals.pending}
          sub={`₹${(stats.withdrawals.pending_paise / 100).toFixed(0)} pending`}
          onClick={() => setTab('withdrawals')}
        />
        <ActionTile
          tone={stats.meetings.live_now > 0 ? 'emerald' : 'slate'}
          label="Live meetings" value={stats.meetings.live_now}
          sub="happening now"
          onClick={() => setTab('meetings')}
        />
      </div>

      {/* Users + bookings + money rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Section title="People">
          <Row label="Total users"      value={stats.users.total} />
          <Row label="Mentees"          value={stats.users.mentees} />
          <Row label="Mentors"          value={stats.users.mentors} />
          <Row label="Verified emails"  value={stats.users.verified} />
          <Row label="New (last 7 d)"   value={stats.users.new_last_7d} tone="emerald" />
          <Row label="New (last 30 d)"  value={stats.users.new_last_30d} />
        </Section>
        <Section title="Bookings (lifetime)">
          <Row label="Total"       value={stats.bookings.total} />
          <Row label="Completed"   value={stats.bookings.completed} tone="emerald" />
          <Row label="Scheduled"   value={stats.bookings.scheduled} tone="sky" />
          <Row label="In call"     value={stats.bookings.in_call} />
          <Row label="No-show"     value={stats.bookings.no_show} tone="amber" />
          <Row label="Cancelled"   value={stats.bookings.cancelled} tone="rose" />
          <Row label="Created today"   value={stats.bookings.today_created} />
          <Row label="Scheduled today" value={stats.bookings.today_scheduled} />
        </Section>
        <Section title="Money (lifetime)">
          <Row label="Platform revenue" value={formatINR(stats.money.platform_revenue_paise)} tone="emerald" />
          <Row label="Mentor payouts"   value={formatINR(stats.money.mentor_payouts_paise)} />
          <Row label="Top-ups"          value={formatINR(stats.money.topups_paise)} />
          <Row label="Mentee wallets"   value={formatINR(stats.money.mentee_wallets_paise)} />
          <Row label="Mentor wallets"   value={formatINR(stats.money.mentor_wallets_paise)} />
          <Row label="Platform wallet"  value={formatINR(stats.money.platform_wallet_paise)} />
          <Row label="Total talk time"  value={fmtSeconds(stats.meetings.total_billed_seconds)} />
          <Row label="Finalized meets"  value={stats.meetings.finalized} />
        </Section>
      </div>

      {/* Recent activity feed */}
      <Card>
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent activity</h2>
          <span className="text-xs text-slate-500">Last 25 events across the platform</span>
        </div>
        {activity.length === 0 ? (
          <CardBody className="text-sm text-slate-500 text-center py-8">Nothing yet.</CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((it, idx) => <ActivityRow key={`${it.kind}-${it.ref_id}-${idx}`} it={it} />)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <Card>
      <CardHeader><h3 className="font-semibold text-slate-900">{title}</h3></CardHeader>
      <CardBody className="space-y-1.5">{children}</CardBody>
    </Card>
  );
}

function Row({ label, value, tone = 'slate' }) {
  const tones = {
    slate:   'text-slate-900',
    emerald: 'text-emerald-700',
    sky:     'text-sky-700',
    amber:   'text-amber-700',
    rose:    'text-rose-700',
  };
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${tones[tone] || tones.slate}`}>{value}</span>
    </div>
  );
}

function ActionTile({ label, value, sub, tone = 'slate', onClick }) {
  const tones = {
    slate:   'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
  };
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all hover:shadow-elev ${tones[tone] || tones.slate}`}
    >
      <p className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{value}</p>
      <p className="text-[11px] opacity-75 mt-0.5">{sub}</p>
    </button>
  );
}

const ACTIVITY_TONES = {
  user_signup:     { dot: 'bg-sky-500',     label: 'New user' },
  booking_created: { dot: 'bg-emerald-500', label: 'Booking' },
  withdrawal:      { dot: 'bg-amber-500',   label: 'Withdrawal' },
  kyc_submitted:   { dot: 'bg-violet-500',  label: 'KYC' },
};

function ActivityRow({ it }) {
  const t = ACTIVITY_TONES[it.kind] || { dot: 'bg-slate-400', label: it.kind };
  return (
    <li className="flex items-center gap-3 px-5 sm:px-6 py-3">
      <span className={`h-2 w-2 rounded-full ${t.dot} shrink-0`} />
      <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 w-20 sm:w-24 shrink-0">
        {t.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-900 truncate">{it.title}</p>
        <p className="text-xs text-slate-500 truncate">{it.subtitle}</p>
      </div>
      <span className="text-xs text-slate-400 shrink-0">{relativeTime(it.at)}</span>
    </li>
  );
}

function fmtSeconds(s) {
  const n = Number(s || 0);
  if (n < 60)       return `${n}s`;
  if (n < 3600)     return `${Math.round(n / 60)} min`;
  if (n < 86400)    return `${(n / 3600).toFixed(1)} hr`;
  return `${Math.round(n / 3600)} hr`;
}

function useDecisionList(loader, deps = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const r = await loader();
      setItems(r.items || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load');
    } finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { items, loading, reload };
}

function MentorApps() {
  const { items, loading, reload } = useDecisionList(() => adminApi.listMentorApplications({ status: 'pending' }));
  const [decision, setDecision] = useState(null); // {id, action: 'approve'|'reject'}
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { id, action } = decision;
      if (action === 'approve') await adminApi.approveMentor(id, notes);
      else await adminApi.rejectMentor(id, notes);
      toast.success(`Mentor ${action}d`);
      setDecision(null); setNotes('');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setBusy(false); }
  }

  if (loading) return <PageSpinner />;
  if (items.length === 0) return <EmptyState label="No pending mentor applications" />;

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <Card key={it.id}>
          <CardBody>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold text-slate-900">{it.full_name}</p>
                <p className="text-xs text-slate-500">{it.email} · Applied {relativeTime(it.created_at)}</p>
                <p className="text-sm text-slate-700 mt-2">{it.headline}</p>
                <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap line-clamp-4">{it.bio}</p>
                <div className="mt-2 text-xs text-slate-500">
                  Tier: <strong>{it.tier_display}</strong> ({formatINR(it.per_minute_paise)}/min) ·
                  Languages: {(it.languages || []).join(', ')} ·
                  {it.years_experience}+ yrs
                  {it.linkedin_url && (
                    <> · <a href={it.linkedin_url} target="_blank" rel="noreferrer" className="underline">LinkedIn</a></>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setDecision({ id: it.id, action: 'reject' })}>
                  Reject
                </Button>
                <Button onClick={() => setDecision({ id: it.id, action: 'approve' })}>
                  Approve
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      <Modal
        open={!!decision}
        onClose={() => { setDecision(null); setNotes(''); }}
        title={decision?.action === 'approve' ? 'Approve mentor' : 'Reject mentor'}
      >
        <Field label="Reviewer notes (optional)" htmlFor="notes">
          <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40"
            placeholder={decision?.action === 'approve' ? 'Welcome message…' : 'Reason for rejection…'} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDecision(null); setNotes(''); }}>Cancel</Button>
          <Button variant={decision?.action === 'reject' ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {decision?.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function KYC() {
  const { items, loading, reload } = useDecisionList(() => adminApi.listKyc({ status: 'pending' }));
  const [decision, setDecision] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { id, action } = decision;
      if (action === 'approve') await adminApi.approveKyc(id, notes);
      else await adminApi.rejectKyc(id, notes);
      toast.success(`KYC ${action}d`);
      setDecision(null); setNotes(''); reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setBusy(false); }
  }

  if (loading) return <PageSpinner />;
  if (items.length === 0) return <EmptyState label="No pending KYC submissions" />;

  return (
    <div className="space-y-3">
      {items.map((k) => (
        <Card key={k.id}>
          <CardBody>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold text-slate-900">{k.full_name}</p>
                <p className="text-xs text-slate-500">{k.email} · Submitted {relativeTime(k.submitted_at)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <dt className="text-slate-500">PAN</dt>
                  <dd className="font-mono">{k.pan_number_masked}</dd>
                  <dt className="text-slate-500">Bank a/c</dt>
                  <dd className="font-mono">{k.bank_account_number_masked}</dd>
                  <dt className="text-slate-500">IFSC</dt>
                  <dd className="font-mono">{k.bank_ifsc}</dd>
                  <dt className="text-slate-500">PAN name</dt>
                  <dd>{k.full_name_as_per_pan}</dd>
                  <dt className="text-slate-500">A/c holder</dt>
                  <dd>{k.bank_account_holder}</dd>
                </dl>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setDecision({ id: k.id, action: 'reject' })}>Reject</Button>
                <Button onClick={() => setDecision({ id: k.id, action: 'approve' })}>Approve</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      <Modal
        open={!!decision}
        onClose={() => { setDecision(null); setNotes(''); }}
        title={decision?.action === 'approve' ? 'Approve KYC' : 'Reject KYC'}
      >
        <Field label="Reviewer notes (optional)" htmlFor="kyc_notes">
          <textarea id="kyc_notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300/40" />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDecision(null); setNotes(''); }}>Cancel</Button>
          <Button variant={decision?.action === 'reject' ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {decision?.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Withdrawals() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const { items, loading, reload } = useDecisionList(
    () => adminApi.listWithdrawals({ status: statusFilter || undefined }),
    [statusFilter]
  );
  const [actioning, setActioning] = useState(null);
  const [txnId, setTxnId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function doAction(kind, id) {
    setBusy(true);
    try {
      if (kind === 'process')  await adminApi.processWithdrawal(id, { gateway_txn_id: txnId || null });
      if (kind === 'complete') await adminApi.completeWithdrawal(id, { gateway_txn_id: txnId || null });
      if (kind === 'fail')     await adminApi.failWithdrawal(id, { failure_reason: reason || 'unspecified' });
      toast.success(`Withdrawal ${kind}d`);
      setActioning(null); setTxnId(''); setReason('');
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex gap-2">
        {['pending', 'processing', 'succeeded', 'failed', 'reversed'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <PageSpinner /> : items.length === 0 ? (
        <EmptyState label={`No ${statusFilter} withdrawals`} />
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.uuid}>
              <CardBody className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {formatINR(w.amount_paise)} · {w.full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {w.email} · Requested {relativeTime(w.requested_at)}
                    {w.gateway_txn_id && <> · Txn: <code>{w.gateway_txn_id}</code></>}
                  </p>
                  {w.failure_reason && <p className="text-xs text-rose-600 mt-1">{w.failure_reason}</p>}
                </div>
                {(w.status === 'pending' || w.status === 'processing') && (
                  <div className="flex gap-2">
                    {w.status === 'pending' && (
                      <Button size="sm" variant="secondary" onClick={() => setActioning({ kind: 'process', w })}>
                        Mark processing
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setActioning({ kind: 'complete', w })}>
                      Complete
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setActioning({ kind: 'fail', w })}>
                      Mark failed
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!actioning} onClose={() => setActioning(null)}
        title={`${actioning?.kind || ''} withdrawal`}>
        {actioning?.kind !== 'fail' ? (
          <Field label="Bank transaction id (optional)" htmlFor="txn">
            <Input id="txn" value={txnId} onChange={(e) => setTxnId(e.target.value)} placeholder="PHONEPE-PAYOUT-XYZ" />
          </Field>
        ) : (
          <Field label="Failure reason" htmlFor="reason">
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </Field>
        )}
        <p className="text-xs text-slate-500 mt-2">
          {actioning?.kind === 'fail' && 'Marking as failed will reverse the escrowed amount back to the mentor\'s wallet.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setActioning(null)}>Cancel</Button>
          <Button
            variant={actioning?.kind === 'fail' ? 'danger' : 'primary'}
            onClick={() => doAction(actioning.kind, actioning.w.id)}
            loading={busy}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}

function ActiveMeetings() {
  const { items, loading, reload } = useDecisionList(() => adminApi.listActiveMeetings());
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  async function doForceEnd() {
    setBusy(true);
    try {
      await adminApi.forceEndMeeting(target.id, reason || null);
      toast.success('Meeting force-ended');
      setTarget(null); setReason(''); reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Force-end failed');
    } finally { setBusy(false); }
  }

  if (loading) return <PageSpinner />;
  if (items.length === 0) return <EmptyState label="No active or paused meetings right now" />;

  return (
    <>
      <div className="space-y-3">
        {items.map((m) => (
          <Card key={m.id}>
            <CardBody className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-slate-900">
                  {m.mentor_name} ↔ {m.mentee_name}
                </p>
                <p className="text-xs text-slate-500">
                  State: <strong>{m.billing_state}</strong> · Slot {formatDate(m.slot_start_at)} ({relativeTime(m.slot_start_at)}) · Billed: {formatINR(m.billed_paise)}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setTarget(m)}>Force-end</Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal open={!!target} onClose={() => setTarget(null)} title="Force-end meeting">
        <p className="text-sm text-slate-700">
          This finalizes the meeting using whatever is in <code>billed_paise</code>. Mentor still gets paid for time actually billed.
        </p>
        <div className="mt-3">
          <Field label="Reason (will appear in audit log)" htmlFor="freason">
            <Input id="freason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={doForceEnd} loading={busy}>Force-end</Button>
        </div>
      </Modal>
    </>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const r = await adminApi.listUsers({ q: q || undefined, role: role || undefined, limit: 50 });
      setItems(r.items);
    } catch (e) {
      toast.error('Search failed');
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  async function toggleActive(u) {
    try {
      await adminApi.patchUser(u.id, { is_active: !u.is_active });
      toast.success(`User ${u.is_active ? 'disabled' : 're-enabled'}`);
      reload();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    }
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Any role</option>
          <option value="mentee">Mentee</option>
          <option value="mentor">Mentor</option>
          <option value="admin">Admin</option>
        </select>
        <Button onClick={reload}>Search</Button>
      </div>

      {loading ? <PageSpinner /> : items.length === 0 ? <EmptyState label="No matches" /> : (
        <Card>
          <CardBody className="!p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Active</th>
                  <th className="text-left px-4 py-2">Reliability</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2">{u.full_name}</td>
                    <td className="px-4 py-2 text-slate-600">{u.email}</td>
                    <td className="px-4 py-2 capitalize">{u.role}</td>
                    <td className="px-4 py-2">{u.is_active ? '✓' : '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      no-shows: {u.no_show_count} · late: {u.late_cancel_count}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant={u.is_active ? 'danger' : 'primary'} onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </>
  );
}

function AuditLog() {
  const { items, loading } = useDecisionList(() => adminApi.auditLog({ limit: 100 }));
  if (loading) return <PageSpinner />;
  if (items.length === 0) return <EmptyState label="No audit entries yet" />;
  return (
    <Card>
      <CardBody className="!p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-2">When</th>
              <th className="text-left px-4 py-2">Admin</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Target</th>
              <th className="text-left px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-xs text-slate-500">{relativeTime(e.created_at)}</td>
                <td className="px-4 py-2">{e.admin_name}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{e.target_table}#{e.target_id}</td>
                <td className="px-4 py-2 text-xs text-slate-600 max-w-md truncate">{e.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function EmptyState({ label }) {
  return (
    <Card>
      <CardBody className="text-center py-10 text-slate-500">{label}</CardBody>
    </Card>
  );
}
