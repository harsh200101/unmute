import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { kyc as kycApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { PageSpinner } from '../components/ui/Spinner.jsx';
import { formatDate } from '../lib/format.js';

// Aadhaar is the only required field. Everything else is optional at
// submission time — mentors can fill PAN/bank later (needed before the
// first withdrawal).
const AADHAAR_RE = /^[0-9]{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCT_RE = /^[0-9]{9,18}$/;

const STATUS = {
  pending:  { icon: Clock, tone: 'bg-amber-50 text-amber-900 border-amber-200', label: 'Pending review' },
  approved: { icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-900 border-emerald-200', label: 'Approved' },
  rejected: { icon: AlertCircle, tone: 'bg-rose-50 text-rose-900 border-rose-200', label: 'Rejected' },
};

export default function MentorKYC() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState(null);

  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [holder, setHolder] = useState('');
  const [showBank, setShowBank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await kycApi.getMine();
      setExisting(r.kyc);
    } catch (e) {
      // 403 if not a mentor — surface it
      toast.error(e.response?.data?.error || 'Failed to load KYC');
    } finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);

    const AAD = aadhaar.replace(/\s+/g, '');
    if (!AADHAAR_RE.test(AAD)) { setErr('Aadhaar must be 12 digits'); return; }

    // Optional fields — validate only when supplied. Treat the bank trio as
    // all-or-nothing so we don't store half a payout target.
    const PAN = pan.toUpperCase().trim();
    const IFSC = ifsc.toUpperCase().trim();
    const ACCT = account.trim();
    if (PAN && !PAN_RE.test(PAN)) { setErr('PAN must look like ABCDE1234F'); return; }
    const anyBank = !!(IFSC || ACCT || holder.trim());
    if (anyBank) {
      if (!ACCT_RE.test(ACCT)) { setErr('Bank account must be 9–18 digits'); return; }
      if (!IFSC_RE.test(IFSC)) { setErr('IFSC must look like HDFC0001234'); return; }
      if (!holder.trim())      { setErr('Account holder name is required'); return; }
    }

    setBusy(true);
    try {
      await kycApi.submit({
        aadhaar_number: AAD,
        pan_number: PAN || undefined,
        full_name_as_per_pan: name.trim() || undefined,
        bank_account_number: ACCT || undefined,
        bank_ifsc: IFSC || undefined,
        bank_account_holder: holder.trim() || undefined,
      });
      toast.success('KYC submitted. Admin will review shortly.');
      reload();
    } catch (e) {
      setErr(e.response?.data?.error || 'Submission failed');
    } finally { setBusy(false); }
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Mentor KYC</h1>
      <p className="text-slate-600 mt-1">
        Aadhaar is all we need to verify your identity. Bank details can be added later —
        they’re only required before your first withdrawal.
      </p>

      {existing && (
        <StatusCard kyc={existing} />
      )}

      {(!existing || existing.status === 'rejected') && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-slate-900">
              {existing?.status === 'rejected' ? 'Resubmit your details' : 'Submit your KYC'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Your Aadhaar (and any other ID you add) stays encrypted and is only visible to admin during review.
            </p>
          </CardHeader>
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Aadhaar number" htmlFor="aadhaar">
                <Input id="aadhaar" inputMode="numeric" value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ''))}
                  placeholder="12 digits, no spaces" maxLength={12} required />
              </Field>

              <details className="rounded-lg border border-slate-200 px-3 py-2"
                       open={showBank} onToggle={(e) => setShowBank(e.target.open)}>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Add PAN &amp; bank details now (optional)
                </summary>
                <p className="mt-2 text-xs text-slate-500">
                  Skip this for now if you just want approval. You can come back and add bank details
                  before your first withdrawal.
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="PAN" htmlFor="pan">
                    <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value)}
                      placeholder="ABCDE1234F" maxLength={10} />
                  </Field>
                  <Field label="Name as per PAN" htmlFor="pan_name">
                    <Input id="pan_name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Bank account number" htmlFor="acct">
                    <Input id="acct" inputMode="numeric" value={account}
                      onChange={(e) => setAccount(e.target.value.replace(/\D/g, ''))}
                      placeholder="9–18 digits" />
                  </Field>
                  <Field label="IFSC" htmlFor="ifsc">
                    <Input id="ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value)}
                      placeholder="HDFC0001234" maxLength={11} />
                  </Field>
                  <Field label="Account holder name" htmlFor="holder">
                    <Input id="holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
                  </Field>
                </div>
              </details>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => navigate(-1)}>Cancel</Button>
                <Button type="submit" loading={busy}>Submit KYC</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatusCard({ kyc }) {
  const conf = STATUS[kyc.status] || STATUS.pending;
  const Icon = conf.icon;
  return (
    <Card className={`mt-6 border ${conf.tone}`}>
      <CardBody className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">{conf.label}</p>
          <p className="text-xs mt-0.5 opacity-80">
            Submitted {formatDate(kyc.submitted_at)}
            {kyc.reviewed_at && <> · Reviewed {formatDate(kyc.reviewed_at)}</>}
          </p>
          {kyc.reviewer_notes && (
            <p className="text-sm mt-2 italic">"{kyc.reviewer_notes}"</p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <dt className="opacity-70">Aadhaar</dt>
            <dd className="font-mono">{kyc.aadhaar_number_masked || '—'}</dd>
            {kyc.pan_number_masked && (<>
              <dt className="opacity-70">PAN</dt>
              <dd className="font-mono">{kyc.pan_number_masked}</dd>
            </>)}
            {kyc.has_bank_details ? (
              <>
                <dt className="opacity-70">Bank a/c</dt>
                <dd className="font-mono">{kyc.bank_account_number_masked}</dd>
                <dt className="opacity-70">IFSC</dt>
                <dd className="font-mono">{kyc.bank_ifsc}</dd>
                <dt className="opacity-70">Holder</dt>
                <dd>{kyc.bank_account_holder}</dd>
              </>
            ) : (
              <>
                <dt className="opacity-70">Bank</dt>
                <dd className="text-amber-700">Not added yet — add before withdrawing</dd>
              </>
            )}
          </dl>
        </div>
      </CardBody>
    </Card>
  );
}
