// Real booking lifecycle (see db/booking_accept_decline.sql, create_booking_transaction.sql):
// pending (no Payment row yet) -> accepted: Booking.status='confirmed' + a Payment
// row is created, either 'paid' (Care Credit covered it) or 'pending' (still owes
// cash) -> paid later via checkout/simulate. cancelled/declined are terminal.
// rescheduled_at (see db/booking_reschedule_flag.sql) is a separate flag stamped by
// either reschedule endpoint -- it doesn't change the booking's real status, so it's
// checked first (after the terminal states) to take color priority over whatever
// pending/awaiting-payment/confirmed state the booking is actually in underneath.
export function deriveStatus(booking) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status === 'declined') return 'declined';
  // Only an explicit completed_at (set via "Mark as completed") counts as completed --
  // a past confirmed session is NOT assumed to have happened.
  if (booking.completed_at) return 'completed';
  if (booking.rescheduled_at) return 'rescheduled';
  if (booking.status === 'pending') return 'pending';
  const paid = Array.isArray(booking.Payment) && booking.Payment.some((p) => p.status === 'paid');
  return paid ? 'confirmed_paid' : 'awaiting_payment';
}

// Soft, desaturated tints (not saturated Tailwind defaults) so the calendar stays
// inside the app's sage/cream palette instead of looking like a generic admin tool.
export const STATUS_META = {
  pending: { label: 'Pending Approval', card: 'bg-gray-100 border-gray-300 text-gray-700', dot: 'bg-gray-400', icon: 'clock' },
  awaiting_payment: { label: 'Awaiting Payment', card: 'bg-amber-50 border-amber-300 text-amber-800', dot: 'bg-amber-400', icon: 'cash' },
  confirmed_paid: { label: 'Confirmed & Paid', card: 'bg-emerald-50 border-emerald-300 text-emerald-800', dot: 'bg-emerald-500', icon: 'check' },
  cancelled: { label: 'Cancelled', card: 'bg-red-50 border-red-300 text-red-700', dot: 'bg-red-400', icon: 'x' },
  declined: { label: 'Declined', card: 'bg-red-50 border-red-300 text-red-700', dot: 'bg-red-400', icon: 'x' },
  completed: { label: 'Completed', card: 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary', dot: 'bg-brand-primary', icon: 'done' },
  rescheduled: { label: 'Rescheduled', card: 'bg-sky-50 border-sky-300 text-sky-800', dot: 'bg-sky-400', icon: 'refresh' },
};

export function typeLabel(sessionType) {
  return sessionType === 'crisis' ? 'Crisis Session' : 'Counseling Session';
}

// Every slot is exactly one hour (see GET /psychologists/:id/availability, which
// only ever offers on-the-hour slots) -- there's no separate duration field on
// Booking, so the end time is always start + 1h.
export function appointmentEnd(schedule) {
  const end = new Date(schedule);
  end.setHours(end.getHours() + 1);
  return end;
}

export function formatTimeRange(schedule) {
  const start = new Date(schedule);
  const end = appointmentEnd(schedule);
  const opts = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString('en-PH', opts)} – ${end.toLocaleTimeString('en-PH', opts)}`;
}

export function residentName(booking) {
  return booking.User?.name || `Resident #${booking.resident_id}`;
}

export function toDateKey(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
