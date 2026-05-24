import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowUpRight, ShieldCheck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { wallet as walletApi, payouts as payoutsApi, kyc as kycApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatINR, formatDate } from '../lib/format.js';

const MIN_PAYOUT_PAISE = 50000;
const STATUS_LABEL = {
  pending: { label: 'Pending', tone: 'bg-amber-50 text-amber-800' },
  processing: { label: 'Processing', tone: 'bg-blue-50 text-blue-800' },
  succeeded: { label: 'Paid out', tone: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', tone: 'bg-rose-50 text-rose-800' },
  reversed: { label: 'Reversed', tone: 'bg-slate-100 text-slate-800' },
};

export default function MentorEarnings() {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [kycStatus, setKycStatus] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqAmount, setReqAmount] = useState(0);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [w, k, p] = await Promise.all([
        walletApi.me(),
        kycApi.getMine().catch(() => ({ kyc: null })),
        payoutsApi.listMine({ limit: 50 }).catch(() => ({ items: [] })),
      ]);
      setBalance(w.balances?.mentor || 0);
      setKycStatus(k.kyc?.status || null);
      setWithdrawals(p.items || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load earnings');
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  async function submitWithdrawal() {
    setReqErr(null);
    if (!Number.isInteger(reqAmount) || reqAmount < MIN_PAYOUT_PAISE) {
      setReqErr(`Minimum withdrawal is ₹${MIN_PAYOUT_PAISE / 100}`);
      return;
    }
    if (reqAmount > balance) { setReqErr('More than your available balance'); return; }
    setReqBusy(true);
    try {
      await payoutsApi.request(reqAmount);
      toast.success(`Withdrawal of ₹${(reqAmount/100).toFixed(0)} requested`);
      setReqOpen(false); setReqAmount(0);
      reload();
    } catch (e) {
      setReqErr(e.response?.data?.error || 'Request failed');
    } finally { setReqBusy(false); }
  }

  if (loading) return <PageSpinner />;

  const canWithdraw = kycStatus === 'approved';
  const totalEarned = withdrawals.reduce((s, w) => s + (w.status === 'succeeded' ? w.amount_paise : 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <header className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Earnings</h1>
          <p className="text-slate-600 mt-1">Withdraw your earnings to your bank account.</p>
        </div>
        <Button onClick={() => setReqOpen(true)} disabled={!canWithdraw || balance < MIN_PAYOUT_PAISE}>
          <ArrowUpRight size={16} /> Request withdrawal
        </Button>
      </header>

      {/* KYC banner */}
      {kycStatus !== 'approved' && (
        <Card className={`mb-4 border ${kycStatus === 'rejected' ? 'border-rose-300' : 'border-amber-300'}`}>
          <CardBody className="flex items-start gap-3">
            <AlertCircle className={kycStatus === 'rejected' ? 'text-rose-600' : 'text-amber-600'} size={20} />
            <div className="flex-1">
              <p className="font-semibold text-slate-900">KYC required to withdraw</p>
              <p className="text-sm text-slate-600 mt-1">
                {kycStatus === 'pending' && 'Your KYC submission is pending admin review.'}
                {kycStatus === 'rejected' && 'Your previous KYC was rejected. Resubmit to continue.'}
                {!kycStatus && 'Submit your PAN + bank details so we can pay you out.'}
              </p>
              <Link to="/mentor/kyc" className="inline-block mt-3">
                <Button size="sm" variant={kycStatus === 'rejected' ? 'danger' : 'primary'}>
                  {kycStatus ? 'View KYC' : 'Submit KYC'}
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {kycStatus === 'approved' && (
        <Card className="mb-4 border-emerald-300">
          <CardBody className="flex items-center gap-3">
            <ShieldCheck className="text-emerald-600" size={18} />
            <span className="text-sm text-slate-700">KYC approved — withdrawals enabled.</span>
          </CardBody>
        </Card>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl text-white p-5 bg-gradient-to-br from-emerald-500 to-emerald-700">
          <p className="text-xs uppercase tracking-wider text-white/80 flex items-center gap-1.5">
            <WalletIcon size={14} /> Available to withdraw
          </p>
          <p className="text-3xl font-bold mt-1">{formatINR(balance)}</p>
          <p className="text-xs text-white/80 mt-2">
            Minimum withdrawal: ₹{MIN_PAYOUT_PAISE / 100}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Total paid out</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{formatINR(totalEarned)}</p>
          <p className="text-xs text-slate-500 mt-2">Across {withdrawals.filter((w) => w.status === 'succeeded').length} withdrawals</p>
        </div>
      </div>

      {/* History */}
      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-slate-900">Withdrawal history</h2>
        </CardHeader>
        <CardBody className="!p-0">
          {withdrawals.length === 0 ? (
            <p className="text-sm text-slate-500 px-6 py-6 text-center">No withdrawals yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {withdrawals.map((w) => {
                const s = STATUS_LABEL[w.status] || STATUS_LABEL.pending;
                return (
                  <li key={w.uuid} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{formatINR(w.amount_paise)}</p>
                      <p className="text-xs text-slate-500">
                        Requested {formatDate(w.requested_at)}
                        {w.processed_at && <> · Processed {formatDate(w.processed_at)}</>}
                      </p>
                      {w.gateway_txn_id && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {w.gateway_txn_id}
                        </p>
                      )}
                      {w.failure_reason && (
                        <p className="text-xs text-rose-600 mt-0.5">{w.failure_reason}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${s.tone}`}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title="Request withdrawal">
        <p className="text-sm text-slate-600">
          We'll transfer this amount to your verified bank account. Withdrawals are processed in weekly batches.
        </p>
        <div className="mt-4">
          <Field label="Amount (₹)" htmlFor="amt">
            <Input id="amt" type="number" min={MIN_PAYOUT_PAISE / 100} step={100}
              max={balance / 100}
              value={reqAmount / 100 || ''}
              onChange={(e) => setReqAmount(Math.round(Number(e.target.value) * 100) || 0)} />
          </Field>
          <p className="text-xs text-slate-500 mt-1">
            Available: <strong>{formatINR(balance)}</strong> · Min: ₹{MIN_PAYOUT_PAISE / 100}
          </p>
        </div>
        {reqErr && <p className="text-sm text-rose-600 mt-3">{reqErr}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setReqOpen(false)}>Cancel</Button>
          <Button onClick={submitWithdrawal} loading={reqBusy}>Submit request</Button>
        </div>
      </Modal>
    </div>
  );
}
