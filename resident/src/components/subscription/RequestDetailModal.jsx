import { useState } from 'react';
import { IconX, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import {
  REQUEST_STATUS_META, PAYMENT_STATUS_LABEL, peso, credits, fmtDate, fmtDateTime, activationText,
} from '../../utils/subscriptionStatus';
import { API_URL, authHeader } from '../../config';

// Barangay-side details for one subscription request (upcoming or historical),
// including the timeline and -- once approved -- the payment reference form.
function RequestDetailModal({ request, onClose, onChanged }) {
  const [reference, setReference] = useState(request.payment_reference || '');
  const [note, setNote] = useState(request.payment_note || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const meta = REQUEST_STATUS_META[request.status] || REQUEST_STATUS_META.pending;
  const canSendPayment = request.status === 'approved' && ['unpaid', 'submitted'].includes(request.payment_status);

  const sendPayment = async (e) => {
    e.preventDefault();
    if (reference.trim().length < 3) { setMessage({ tone: 'error', text: 'Enter the payment reference number.' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/lgu/me/subscription/requests/${request.request_id}/payment`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: reference.trim(), note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not send payment details.' }); return; }
      setMessage({ tone: 'success', text: 'Payment details sent. The admin will verify them.' });
      onChanged?.();
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setSaving(false);
    }
  };

  const timeline = [
    ['Requested', request.requested_at],
    ['Approved', request.approved_at],
    ['Payment details sent', request.payment_submitted_at],
    ['Payment verified', request.payment_verified_at],
    ['Activated', request.activated_at],
    ['Rejected', request.rejected_at],
    ['Cancelled', request.cancelled_at],
  ].filter(([, d]) => d);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-brand-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">Subscription request #{request.request_id}</p>
            <h2 className="font-display text-xl font-semibold">{request.plan_name}</h2>
            <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-brand-ink/5 text-brand-ink/50" aria-label="Close"><IconX size={18} /></button>
        </div>

        <dl className="mt-4 text-sm space-y-2 bg-brand-bg rounded-xl p-4">
          <Line label="Price" value={peso(request.price)} />
          <Line label="Care Credits included" value={credits(request.care_credits)} />
          <Line label="Duration" value={`${request.validity_months} months`} />
          <Line label="Request type" value={request.kind === 'renewal' ? 'Renewal' : 'New subscription'} />
          <Line label={request.status === 'activated' ? 'Activated' : 'Expected activation'} value={activationText(request)} />
          {request.period_end && <Line label="Expires" value={fmtDate(request.period_end)} />}
          <Line label="Payment" value={PAYMENT_STATUS_LABEL[request.payment_status] || request.payment_status} />
          {request.payment_reference && <Line label="Payment reference" value={request.payment_reference} />}
        </dl>

        {request.status === 'rejected' && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold">Reason for rejection</p>
            <p className="text-sm mt-1">{request.rejection_reason}</p>
            {request.rejection_remarks && <p className="text-xs mt-1 opacity-80">{request.rejection_remarks}</p>}
          </div>
        )}
        {request.status === 'cancelled' && request.cancellation_reason && (
          <p className="mt-4 text-sm bg-brand-bg rounded-xl px-4 py-3">Cancelled by the admin: {request.cancellation_reason}</p>
        )}

        {canSendPayment && (
          <form onSubmit={sendPayment} className="mt-5 border border-brand-ink/10 rounded-xl p-4">
            <p className="text-sm font-semibold">Send payment details</p>
            <p className="text-xs text-brand-ink/55 mt-0.5">
              Pay {peso(request.price)} through your usual LGU disbursement, then enter the official receipt or transfer reference here.
              The plan is only scheduled after the admin verifies it.
            </p>
            <label className="block text-xs text-brand-ink/60 mt-3">
              Payment reference number <span className="text-red-600">*</span>
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100}
                className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink" />
            </label>
            <label className="block text-xs text-brand-ink/60 mt-2">
              Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink" />
            </label>
            {message && (
              <p className={`mt-2 text-sm flex items-start gap-1.5 ${message.tone === 'error' ? 'text-red-700' : 'text-brand-primary'}`}>
                {message.tone === 'error' ? <IconAlertTriangle size={15} className="mt-0.5" /> : <IconCircleCheck size={15} className="mt-0.5" />}
                {message.text}
              </p>
            )}
            <button type="submit" disabled={saving} className="plan-subscribe mt-3 text-sm font-medium px-4 py-2 rounded-full text-white disabled:opacity-60">
              {saving ? 'Sending...' : request.payment_status === 'submitted' ? 'Update payment details' : 'Send payment details'}
            </button>
          </form>
        )}

        <h3 className="text-sm font-semibold mt-5 mb-2">Timeline</h3>
        <ol className="space-y-1.5">
          {timeline.map(([label, d]) => (
            <li key={label} className="flex justify-between text-xs">
              <span className="text-brand-ink/70">{label}</span>
              <span className="text-brand-ink/50">{fmtDateTime(d)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-ink/55">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

export default RequestDetailModal;
