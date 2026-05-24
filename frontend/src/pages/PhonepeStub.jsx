import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { payments as paymentsApi } from '../api/endpoints.js';
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';

// Dev-only PhonePe simulator. The backend's stub provider returns a redirect
// URL pointing here when PhonePe creds aren't configured. This page lets you
// "complete" a payment by POSTing the same webhook shape PhonePe would send.

export default function PhonepeStub() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const order = params.get('order');
  const amount = Number(params.get('amount') || 0);
  const [busy, setBusy] = useState(false);

  async function done(success) {
    setBusy(true);
    try {
      await paymentsApi.simulateWebhook({
        merchantTransactionId: order,
        transactionId: `STUB-${Date.now()}`,
        amount,
        state: success ? 'PAYMENT_SUCCESS' : 'PAYMENT_ERROR',
        success,
      });
      toast.success(success ? 'Webhook simulated (success)' : 'Webhook simulated (failure)');
      navigate(`/wallet?order_id=${encodeURIComponent(order)}`, { replace: true });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to simulate webhook');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-base font-semibold text-slate-900">PhonePe stub (dev mode)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real PhonePe creds aren't configured — this page simulates the gateway.
          </p>
        </CardHeader>
        <CardBody>
          <div className="text-sm text-slate-700">
            <div>Order: <code className="text-xs">{order}</code></div>
            <div className="mt-1">Amount: <strong>₹{(amount / 100).toFixed(2)}</strong></div>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => done(true)} loading={busy}>Simulate successful payment</Button>
            <Button variant="secondary" onClick={() => done(false)} loading={busy}>Simulate failed payment</Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            In production this page is replaced by PhonePe's own checkout UI.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
