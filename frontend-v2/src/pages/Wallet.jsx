import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ArrowDownLeft, ArrowUpRight, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { wallet as walletApi, payments as paymentsApi } from '../api/endpoints.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatINR, formatDate } from '../lib/format.js';

const PRESETS_PAISE = [50000, 100000, 200000, 500000]; // ₹500, ₹1000, ₹2000, ₹5000

export default function Wallet() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const [balances, setBalances] = useState({ mentee: 0, mentor: 0 });
  const [pending_penalty_paise, setPendingPenalty] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auto-open topup modal if ?topup=1
  const [topupOpen, setTopupOpen] = useState(params.get('topup') === '1');
  const [topupAmount, setTopupAmount] = useState(100000);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupErr, setTopupErr] = useState(null);

  // Status polling if returned from PhonePe with ?order_id=...
  const orderIdFromQuery = params.get('order_id');
  const [polling, setPolling] = useState(false);
  const [pollingStatus, setPollingStatus] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        walletApi.me(),
        walletApi.transactions({ limit: 50 }),
      ]);
      setBalances(b.balances || { mentee: 0, mentor: 0 });
      setPendingPenalty(b.pending_penalty_paise || 0);
      setTransactions(t.items || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load wallet');
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  // If returned from PhonePe — poll status until succeeded/failed
  useEffect(() => {
    if (!orderIdFromQuery) return;
    let cancelled = false;
    let attempts = 0;
    setPolling(true);
    const tick = async () => {
      try {
        const r = await paymentsApi.status(orderIdFromQuery);
        if (cancelled) return;
        setPollingStatus(r.payment.status);
        if (r.payment.status === 'succeeded') {
          toast.success(`₹${(r.payment.amount_paise/100).toFixed(0)} added to your wallet`);
          await reload();
          setPolling(false);
          const next = new URLSearchParams(params);
          next.delete('order_id'); next.delete('topup');
          setParams(next, { replace: true });
          return;
        }
        if (r.payment.status === 'failed') {
          toast.error('Top-up failed: ' + (r.payment.failure_reason || 'unknown'));
          setPolling(false);
          return;
        }
        if (++attempts < 12) setTimeout(tick, 2000); // up to ~24s
        else setPolling(false);
      } catch (_) { setPolling(false); }
    };
    tick();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdFromQuery]);

  async function startTopup() {
    setTopupErr(null);
    if (!Number.isInteger(topupAmount) || topupAmount < 5000) {
      setTopupErr('Minimum top-up is ₹50');
      return;
    }
    setTopupBusy(true);
    try {
      const r = await paymentsApi.topup(topupAmount);
      // If we're in a popup window (opened from the meeting room) we want
      // the redirect to navigate THIS window so the meeting page stays put.
      const inPopup = !!window.opener;
      const redirect = `${r.redirect_url}`;
      if (inPopup) {
        window.location.href = redirect;
      } else {
        window.location.href = redirect;
      }
    } catch (e) {
      setTopupErr(e.response?.data?.error || 'Top-up failed');
      setTopupBusy(false);
    }
  }

  if (loading) return <PageSpinner />;

  const isMentor = user.role === 'mentor';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Wallet</h1>
          <p className="text-slate-600 mt-1">
            Top up to book sessions. We charge per minute while you're on the call.
          </p>
        </div>
        <Button onClick={() => setTopupOpen(true)}>
          <Plus size={16} /> Top up
        </Button>
      </header>

      {polling && (
        <Card className="border-blue-300 mb-4">
          <CardBody className="flex items-center gap-3">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-blue-900">
              Confirming your payment — status: <strong>{pollingStatus || 'pending'}</strong>…
            </p>
          </CardBody>
        </Card>
      )}

      {pending_penalty_paise > 0 && (
        <Card className="border-amber-300 mb-4">
          <CardBody className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 mt-0.5" size={18} />
            <div>
              <p className="font-medium text-amber-900">
                Outstanding late-cancel fee: {formatINR(pending_penalty_paise)}
              </p>
              <p className="text-xs text-amber-800 mt-1">
                This will be automatically deducted from your next top-up.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BalanceCard
          title="Mentee balance"
          subtitle="Used to pay for sessions you book"
          balance_paise={balances.mentee}
          tone="blue"
        />
        {isMentor && (
          <BalanceCard
            title="Mentor earnings"
            subtitle="Withdraw to bank from /mentor/earnings"
            balance_paise={balances.mentor}
            tone="emerald"
          />
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Recent transactions</h2>
        </CardHeader>
        <CardBody className="!p-0">
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500 px-6 py-6 text-center">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transactions.map((t) => (
                <li key={t.uuid} className="px-6 py-3 flex items-center gap-3">
                  <span className={t.direction === 'credit' ? 'text-emerald-600' : 'text-rose-600'}>
                    {t.direction === 'credit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 truncate">
                      {prettyReason(t.reason)}
                      {t.description && <span className="text-slate-500"> · {t.description}</span>}
                    </p>
                    <p className="text-xs text-slate-500">{formatDate(t.created_at)} · {t.wallet_kind}</p>
                  </div>
                  <div className={`text-sm font-semibold ${t.direction === 'credit' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {t.direction === 'credit' ? '+' : '−'}{formatINR(t.amount_paise)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal open={topupOpen} onClose={() => setTopupOpen(false)} title="Top up wallet">
        <p className="text-sm text-slate-600">
          You'll be redirected to PhonePe to complete the payment.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {PRESETS_PAISE.map((p) => (
            <button
              key={p}
              onClick={() => setTopupAmount(p)}
              className={`px-3 py-3 rounded-lg border text-sm font-semibold ${
                topupAmount === p
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              ₹{p / 100}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Field label="Custom amount (₹)" htmlFor="amt">
            <Input
              id="amt"
              type="number"
              min={50}
              max={500000}
              step={50}
              value={topupAmount / 100}
              onChange={(e) => setTopupAmount(Math.round(Number(e.target.value) * 100) || 0)}
            />
          </Field>
        </div>
        {topupErr && <p className="text-sm text-rose-600 mt-2">{topupErr}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTopupOpen(false)}>Cancel</Button>
          <Button onClick={startTopup} loading={topupBusy}>
            Pay {formatINR(topupAmount)}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function BalanceCard({ title, subtitle, balance_paise, tone }) {
  const palette = {
    blue: 'from-blue-500 to-blue-700',
    emerald: 'from-emerald-500 to-emerald-700',
  }[tone] || 'from-slate-600 to-slate-800';
  return (
    <div className={`rounded-2xl text-white p-5 bg-gradient-to-br ${palette}`}>
      <p className="text-xs uppercase tracking-wider text-white/80">{title}</p>
      <p className="text-3xl font-bold mt-1">{formatINR(balance_paise)}</p>
      <p className="text-xs text-white/80 mt-2">{subtitle}</p>
    </div>
  );
}

function prettyReason(r) {
  return ({
    topup: 'Wallet top-up',
    session_charge: 'Session charge',
    session_payout: 'Session earnings',
    platform_fee: 'Platform fee',
    late_cancel_penalty: 'Late-cancel penalty',
    late_cancel_compensation: 'Late-cancel compensation',
    refund: 'Refund',
    withdrawal: 'Withdrawal',
    withdrawal_reversal: 'Withdrawal reversal',
    admin_adjustment: 'Admin adjustment',
  })[r] || r;
}
