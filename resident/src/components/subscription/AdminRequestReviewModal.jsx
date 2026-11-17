import { useEffect, useState } from 'react';
import { IconX, IconBuildingBank, IconUserCircle, IconCreditCard, IconArrowRight, IconAlertTriangle } from '@tabler/icons-react';
import ConfirmDialog from '../ConfirmDialog';
import { API_URL, authHeader } from '../../config';
import {
  REQUEST_STATUS_META, SUBSCRIPTION_STATUS_META, PAYMENT_STATUS_LABEL, HISTORY_LABEL, REJECTION_REASONS,
  peso, credits, fmtDate, fmtDateTime, activationText,
} from '../../utils/subscriptionStatus';
import { playClick } from '../../utils/sound';

export const APPROVE_MESSAGE = 'Are you sure you want to approve this subscription renewal request? The selected plan will be scheduled for activation after the current subscription expires, subject to payment verification.';

// Admin > Subscriptions > Subscription Renewal Requests > View Details.
// Every action here posts { confirm: true } after an explicit confirmation;
// the server re-checks the request's status before changing anything.
function AdminRequestReviewModal({ requestId, initialAction, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialAction || null); // 'reject' | 'verify' | 'cancel'
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/admin/subscription-requests/${requestId}`, { headers: authHeader() })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d }), () => ({ ok: false, d: { error: 'Unexpected server response.' } })))
      .then(({ ok, d }) => { if (ok) setData(d); else setError(d.error || 'Could not load this request.'); })
      .catch(() => setError('Could not reach the server.'));
  };
  useEffect(load, [requestId]);

  const post = async (action, body, successText) => {
    try {
      const res = await fetch(`${API_URL}/admin/subscription-requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, ...body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return d.error || 'Something went wrong.';
      setForm(null);
      onChanged(successText);
      load();
      return null;
    } catch {
      return 'Could not reach the server.';
    }
  };

  const approve = () => {
    playClick();
    setConfirmDialog({
      title: 'Approve Subscription Renewal?',
      message: APPROVE_MESSAGE,
      cancelLabel: 'Go Back',
      confirmLabel: 'Confirm Approval',
      destructive: false,
      onConfirm: async () => {
        const err = await post('approve', {}, 'Subscription request approved.');
        if (err) setError(err);
      },
    });
  };

  const r = data?.request;
  const cur = data?.current;
  const meta = r ? REQUEST_STATUS_META[r.status] : null;
  const curMeta = cur ? SUBSCRIPTION_STATUS_META[cur.display_status] || SUBSCRIPTION_STATUS_META.none : null;

  return (
    <>
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" onClick={() => !confirmDialog && onClose()}>
      <div className="bg-brand-bg rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Review subscription request">
        <div className="flex items-start justify-between gap-3 px-6 py-4 bg-brand-surface border-b border-brand-ink/10">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">Request #{requestId}</p>
            <p className="font-display text-lg font-semibold">{data?.barangay ? `Barangay ${data.barangay.name}` : 'Subscription request'}</p>
            {meta && <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-brand-ink/5 text-brand-ink/50" aria-label="Close"><IconX size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 flex gap-2"><IconAlertTriangle size={16} className="mt-0.5" />{error}</p>}
          {!data && !error && <p className="text-sm text-brand-ink/50 text-center py-10">Loading request...</p>}

          {data && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <Card icon={IconBuildingBank} title="Barangay information">
                  <Line label="Barangay" value={data.barangay?.name} />
                  <Line label="City / LGU" value={data.barangay?.city} />
                </Card>
                <Card icon={IconUserCircle} title="Authorized account">
                  {data.lgu_account ? (
                    <>
                      <Line label="Contact" value={data.lgu_account.name} />
                      <Line label="Email" value={data.lgu_account.email} />
                      <Line label="Login" value={data.lgu_account.status === 'suspended' ? 'Deactivated' : 'Active'} />
                      <Line label="Requested by" value={r.requested_by_name} />
                    </>
                  ) : <p className="text-sm text-brand-ink/50">No LGU account for this barangay.</p>}
                </Card>
              </div>

              <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                <Card icon={IconCreditCard} title="Current subscription">
                  {cur?.plan_name ? (
                    <>
                      <Line label="Plan" value={cur.plan_name} />
                      <Line label="Status" value={<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${curMeta.badge}`}>{curMeta.label}</span>} />
                      <Line label="Remaining Care Credits" value={credits(cur.remaining_credits)} />
                      <Line label="Expires" value={fmtDate(cur.expires_at)} />
                      {cur.days_remaining != null && <Line label="Days remaining" value={cur.days_remaining} />}
                    </>
                  ) : <p className="text-sm text-brand-ink/50">No current subscription.</p>}
                </Card>
                <div className="hidden md:flex items-center text-brand-primary"><IconArrowRight size={20} /></div>
                <Card icon={IconCreditCard} title="Requested subscription" highlight>
                  <Line label="Plan" value={r.plan_name} />
                  <Line label="Price" value={peso(r.price)} />
                  <Line label="Care Credits" value={credits(r.care_credits)} />
                  <Line label="Duration" value={`${r.validity_months} months`} />
                  <Line label="Expected activation" value={activationText(r)} />
                </Card>
              </div>

              <Card title="Payment & decision">
                <Line label="Payment" value={PAYMENT_STATUS_LABEL[r.payment_status]} />
                {r.payment_reference && <Line label="Reference" value={r.payment_reference} />}
                {r.payment_note && <Line label="Barangay's note" value={r.payment_note} />}
                {r.payment_amount && <Line label="Verified amount" value={peso(r.payment_amount)} />}
                {r.payment_verified_at && <Line label="Verified" value={`${fmtDateTime(r.payment_verified_at)}${r.payment_verified_by_name ? ` · ${r.payment_verified_by_name}` : ''}`} />}
                <Line label="Requested" value={fmtDateTime(r.requested_at)} />
                {r.approved_at && <Line label="Approved" value={`${fmtDateTime(r.approved_at)}${r.approved_by_name ? ` · ${r.approved_by_name}` : ''}`} />}
                {r.rejected_at && <Line label="Rejected" value={`${fmtDateTime(r.rejected_at)}${r.rejected_by_name ? ` · ${r.rejected_by_name}` : ''}`} />}
                {r.rejection_reason && <Line label="Rejection reason" value={`${r.rejection_reason}${r.rejection_remarks ? ` — ${r.rejection_remarks}` : ''}`} />}
                {r.cancelled_at && <Line label="Cancelled" value={`${fmtDateTime(r.cancelled_at)} · by ${r.cancelled_by_role === 'admin' ? (r.cancelled_by_name || 'admin') : 'the barangay'}`} />}
                {r.cancellation_reason && <Line label="Cancellation reason" value={r.cancellation_reason} />}
                {r.activated_at && <Line label="Activated" value={`${fmtDateTime(r.activated_at)} (term ${fmtDate(r.period_start)} – ${fmtDate(r.period_end)})`} />}
              </Card>

              {data.history.length > 0 && (
                <Card title="Activity">
                  <ol className="space-y-1.5">
                    {data.history.map((h) => (
                      <li key={h.history_id} className="flex justify-between gap-3 text-xs">
                        <span className="text-brand-ink/70">{HISTORY_LABEL[h.action] || h.action}{h.note ? ` — ${h.note}` : ''}</span>
                        <span className="text-brand-ink/45 whitespace-nowrap">{fmtDateTime(h.created_at)}</span>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}

              {form && (
                <ActionForm
                  key={form}
                  kind={form}
                  request={r}
                  onCancel={() => setForm(null)}
                  onSubmit={(body) => post(
                    form === 'reject' ? 'reject' : form === 'verify' ? 'verify-payment' : 'cancel',
                    body,
                    form === 'reject' ? 'Subscription request rejected.' : form === 'verify' ? 'Payment verified — subscription scheduled.' : 'Upcoming subscription cancelled.',
                  )}
                />
              )}
            </>
          )}
        </div>

        {r && !form && (
          <div className="flex flex-wrap justify-end gap-2 px-6 py-3 bg-brand-surface border-t border-brand-ink/10">
            {r.status === 'scheduled' && (
              <button onClick={() => setForm('cancel')} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600 mr-auto">
                Cancel scheduled subscription
              </button>
            )}
            {r.status === 'approved' && (
              <button onClick={() => setForm('cancel')} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20 mr-auto">
                Cancel request
              </button>
            )}
            <button onClick={onClose} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">Close</button>
            {['pending', 'approved'].includes(r.status) && (
              <button onClick={() => setForm('reject')} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600">
                Reject Request
              </button>
            )}
            {r.status === 'pending' && (
              <button onClick={approve} className="interactive interactive-accept text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
                Approve Request
              </button>
            )}
            {r.status === 'approved' && (
              <button onClick={() => setForm('verify')} className="interactive interactive-accept text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
                Verify Payment
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </>
  );
}

// Inline forms for reject / verify payment / cancel, each with its own
// required fields, loading state and error message.
function ActionForm({ kind, request, onCancel, onSubmit }) {
  const [preset, setPreset] = useState('');
  const [text, setText] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reference, setReference] = useState(request.payment_reference || '');
  const [amount, setAmount] = useState(String(request.price));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reason = kind === 'reject' ? (preset && preset !== 'other' ? preset : text.trim()) : text.trim();
  const valid = kind === 'verify' ? reference.trim().length >= 3 && Number(amount) > 0 : reason.length >= 5;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    const body = kind === 'verify'
      ? { reference: reference.trim(), amount: Number(amount) }
      : kind === 'reject' ? { reason, remarks: remarks.trim() || undefined } : { reason };
    const err = await onSubmit(body);
    if (err) { setError(err); setBusy(false); }
  };

  const tone = kind === 'verify' ? 'border-brand-primary/30 bg-brand-primary/5' : 'border-red-200 bg-red-50/50';
  return (
    <form onSubmit={submit} className={`rounded-xl border p-4 ${tone}`}>
      <p className="font-display text-base font-semibold">
        {kind === 'reject' ? 'Reject Subscription Request' : kind === 'verify' ? 'Verify Payment' : 'Cancel Upcoming Subscription'}
      </p>
      <p className="text-xs text-brand-ink/60 mt-0.5">
        {kind === 'reject' && "The barangay will see this reason. Their current subscription stays unchanged."}
        {kind === 'verify' && `Confirm that ${peso(request.price)} was received. The plan is then scheduled and activates when the current subscription ends — Care Credits are issued only at activation.`}
        {kind === 'cancel' && 'The request is kept in history as Cancelled. Handle any refund outside OpenUp. The current subscription is unchanged.'}
      </p>

      {kind === 'reject' && (
        <fieldset className="mt-3 space-y-1.5">
          <legend className="text-xs font-medium text-brand-ink/70 mb-1">Reason <span className="text-red-600">*</span></legend>
          {[...REJECTION_REASONS, 'other'].map((x) => (
            <label key={x} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="reject-reason" checked={preset === x} onChange={() => setPreset(x)} className="accent-red-600" />
              {x === 'other' ? 'Other' : x}
            </label>
          ))}
          {preset === 'other' && (
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Describe the reason"
              className="w-full mt-1 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface" />
          )}
          <label className="block text-xs text-brand-ink/60 pt-2">
            Additional remarks (optional)
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={1000}
              className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface resize-none" />
          </label>
        </fieldset>
      )}

      {kind === 'verify' && (
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <label className="text-xs text-brand-ink/60">
            Payment reference <span className="text-red-600">*</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100}
              className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface text-brand-ink" />
          </label>
          <label className="text-xs text-brand-ink/60">
            Amount received (₱) <span className="text-red-600">*</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface text-brand-ink" />
          </label>
        </div>
      )}

      {kind === 'cancel' && (
        <label className="block text-xs text-brand-ink/60 mt-3">
          Reason <span className="text-red-600">*</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500}
            className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface resize-none" />
        </label>
      )}

      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} disabled={busy} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20 bg-brand-surface">
          Go Back
        </button>
        <button type="submit" disabled={!valid || busy}
          className={`interactive text-sm font-medium px-4 py-2 rounded-full text-white disabled:opacity-50 ${kind === 'verify' ? 'bg-brand-primary' : 'bg-red-600'}`}>
          {busy ? 'Please wait...' : kind === 'reject' ? 'Confirm Rejection' : kind === 'verify' ? 'Confirm Payment Verified' : 'Confirm Cancellation'}
        </button>
      </div>
    </form>
  );
}

function Card({ icon: Icon, title, children, highlight }) {
  return (
    <section className={`rounded-xl shadow-sm p-4 ${highlight ? 'bg-brand-primary/5 border border-brand-primary/25' : 'bg-brand-surface'}`}>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">{Icon && <Icon size={16} className="text-brand-primary" />}{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-brand-ink/55">{label}</dt>
      <dd className="font-medium text-right wrap-break-word">{value ?? '—'}</dd>
    </div>
  );
}

export default AdminRequestReviewModal;
