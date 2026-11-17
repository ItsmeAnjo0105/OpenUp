import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import ConfirmDialog from '../ConfirmDialog';
import { API_URL, authHeader } from '../../config';
import { playHover, playClick } from '../../utils/sound';
import { deriveStatus, STATUS_META, formatTimeRange, residentName, typeLabel } from '../../utils/appointmentStatus';

// Local datetime-local string (no timezone conversion surprises) for the
// reschedule input's default value, one hour ahead of the current schedule.
function toDatetimeLocal(schedule) {
  const d = new Date(schedule);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

function AppointmentDetailModal({ booking, sessionPrice, onClose, onChanged }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newSchedule, setNewSchedule] = useState(toDatetimeLocal(booking.schedule));
  const [notice, setNotice] = useState('');

  const status = deriveStatus(booking);
  const meta = STATUS_META[status];
  const payment = Array.isArray(booking.Payment) ? booking.Payment[0] : null;
  const fee = payment?.amount ?? sessionPrice ?? null;
  // Mirrors POST /bookings/:id/complete: confirmed, paid, and already started.
  const canComplete = (status === 'confirmed_paid' || status === 'rescheduled')
    && booking.status === 'confirmed'
    && Array.isArray(booking.Payment) && booking.Payment.some((p) => p.status === 'paid')
    && new Date(booking.schedule) <= new Date();

  const run = async (url, options, successMsg) => {
    setError('');
    setBusy(successMsg);
    try {
      const res = await fetch(`${API_URL}${url}`, { method: options.method || 'POST', headers: { ...authHeader(), 'Content-Type': 'application/json' }, body: options.body ? JSON.stringify(options.body) : undefined });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return false; }
      onChanged();
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const approve = () => run(`/bookings/${booking.booking_id}/accept`, {}, 'approving').then((ok) => ok && onClose());
  const decline = () => setConfirmDialog({
    title: 'Decline this request?',
    message: `${residentName(booking)}'s request will be declined and any reserved Care Credit released back to them.`,
    confirmLabel: 'Decline',
    destructive: true,
    onConfirm: async () => { if (await run(`/bookings/${booking.booking_id}/decline`, {}, 'declining')) onClose(); },
  });
  const cancel = () => setConfirmDialog({
    title: 'Cancel this session?',
    message: `${residentName(booking)} will be notified. ${payment?.status === 'paid' ? 'Their payment will be refunded/released per policy.' : ''}`,
    confirmLabel: 'Cancel session',
    destructive: true,
    onConfirm: async () => { if (await run(`/bookings/${booking.booking_id}/psychologist-cancel`, {}, 'cancelling')) onClose(); },
  });
  const resendPaymentNotice = async () => {
    const ok = await run(`/bookings/${booking.booking_id}/resend-payment-notification`, {}, 'sending');
    if (ok) setNotice('Payment reminder sent.');
  };
  const markCompleted = () => setConfirmDialog({
    title: 'Mark this session as completed?',
    message: `Confirm that your session with ${residentName(booking)} took place. Completed sessions move to Completed Sessions and can no longer be rescheduled or cancelled.`,
    confirmLabel: 'Mark as completed',
    onConfirm: async () => { if (await run(`/bookings/${booking.booking_id}/complete`, {}, 'completing')) onClose(); },
  });
  const submitReschedule = async () => {
    if (!newSchedule) return;
    const iso = new Date(newSchedule).toISOString();
    const ok = await run(`/bookings/${booking.booking_id}/psychologist-reschedule`, { method: 'PATCH', body: { schedule: iso } }, 'rescheduling');
    if (ok) { setRescheduling(false); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">{residentName(booking)}</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border mb-4 ${meta.card}`}>{meta.label}</span>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 mb-3">{notice}</p>}

        <div className="space-y-2.5 text-sm mb-5">
          <div className="flex justify-between">
            <span className="text-brand-ink/50">Date &amp; time</span>
            <span className="font-medium text-right">
              {new Date(booking.schedule).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
              <br />{formatTimeRange(booking.schedule)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-ink/50">Type</span>
            <span className="font-medium">{typeLabel(booking.session_type)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-ink/50">Payment status</span>
            <span className="font-medium capitalize">{payment?.status || 'Not yet created'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-ink/50">Fee</span>
            <span className="font-medium">{fee != null ? `₱${Number(fee).toLocaleString()}` : '—'}</span>
          </div>
          {booking.care_credit_id != null && (
            <div className="flex justify-between">
              <span className="text-brand-ink/50">Paid with</span>
              <span className="font-medium">Care Credit</span>
            </div>
          )}
          {booking.completed_at && (
            <div className="flex justify-between">
              <span className="text-brand-ink/50">Completed on</span>
              <span className="font-medium text-right">{new Date(booking.completed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-brand-ink/50">Requested</span>
            <span className="font-medium">{new Date(booking.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>

        {status === 'completed' ? null : rescheduling ? (
          <div className="space-y-2 border-t border-brand-ink/10 pt-4">
            <label className="text-xs font-medium text-brand-ink/60 block">New date &amp; time (sessions are 1 hour, on the hour)</label>
            <input
              type="datetime-local"
              step="3600"
              value={newSchedule}
              onChange={(e) => setNewSchedule(e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setRescheduling(false)} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Cancel</button>
              <button
                onClick={submitReschedule}
                disabled={Boolean(busy)}
                className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
              >
                {busy === 'rescheduling' ? 'Saving...' : 'Confirm new time'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-brand-ink/10 pt-4">
            {status === 'pending' && (
              <>
                <button onClick={() => { playClick(); approve(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {busy === 'approving' ? 'Approving...' : 'Approve'}
                </button>
                <button onClick={() => { playClick(); decline(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600 disabled:opacity-60">
                  Decline
                </button>
              </>
            )}
            {status === 'awaiting_payment' && (
              <>
                <button onClick={() => { playClick(); resendPaymentNotice(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {busy === 'sending' ? 'Sending...' : 'Resend Payment Notification'}
                </button>
                <button onClick={() => { playClick(); setRescheduling(true); }} onMouseEnter={playHover} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">
                  Reschedule
                </button>
                <button onClick={() => { playClick(); cancel(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600 disabled:opacity-60">
                  Cancel
                </button>
              </>
            )}
            {(status === 'confirmed_paid' || status === 'rescheduled') && (
              <>
                {canComplete && (
                  <button onClick={() => { playClick(); markCompleted(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60">
                    {busy === 'completing' ? 'Saving...' : 'Mark as completed'}
                  </button>
                )}
                <button onClick={() => { playClick(); setRescheduling(true); }} onMouseEnter={playHover} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">
                  Reschedule
                </button>
                <button onClick={() => { playClick(); cancel(); }} onMouseEnter={playHover} disabled={Boolean(busy)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600 disabled:opacity-60">
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

export default AppointmentDetailModal;
