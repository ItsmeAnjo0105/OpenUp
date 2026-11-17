// Display metadata for Resident Inquiries. Both statuses are computed server-side
// (see "Resident Inquiries" in server/index.js) -- these maps only decide how
// they look. They are intentionally separate: booking_status comes from the
// real Booking + Payment rows, inquiry_status from the conversation itself.

export const BOOKING_STATUS_META = {
  not_booked: {
    label: 'Not Booked',
    className: 'bg-gray-200 text-gray-700',
    hint: 'No appointment request yet -- asking questions or seeking information.',
  },
  pending_approval: {
    label: 'Pending Approval',
    className: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200',
    hint: 'Submitted an appointment request you have not approved or declined yet.',
  },
  awaiting_payment: {
    label: 'Awaiting Payment',
    className: 'bg-amber-100 text-amber-800',
    hint: 'Appointment approved -- the resident still needs to complete payment.',
  },
  booked: {
    label: 'Booked',
    className: 'bg-emerald-100 text-emerald-800',
    hint: 'Payment verified -- the appointment is officially confirmed.',
  },
  cancelled_expired: {
    label: 'Cancelled / Expired',
    className: 'bg-red-100 text-red-700',
    hint: 'Their latest appointment was cancelled, declined, or the payment request expired.',
  },
};

// Per-appointment labels (the "other appointments" list inside a conversation).
export const APPOINTMENT_STATUS_META = {
  booked: { label: 'Booked', className: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', className: 'bg-brand-primary/10 text-brand-primary' },
  awaiting_payment: { label: 'Awaiting Payment', className: 'bg-amber-100 text-amber-800' },
  pending_approval: { label: 'Pending Approval', className: 'bg-gray-100 text-gray-500 ring-1 ring-inset ring-gray-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', className: 'bg-red-100 text-red-700' },
};

export const INQUIRY_STATUS_META = {
  new: { label: 'New Inquiry', dot: 'bg-brand-primary', text: 'text-brand-primary' },
  unread: { label: 'Unread', dot: 'bg-sky-500', text: 'text-sky-700' },
  in_progress: { label: 'In Progress', dot: 'bg-violet-400', text: 'text-violet-700' },
  responded: { label: 'Responded', dot: 'bg-teal-400', text: 'text-teal-700' },
  resolved: { label: 'Resolved', dot: 'bg-gray-400', text: 'text-gray-500' },
};

export const INQUIRY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New Inquiry' },
  { key: 'unread', label: 'Unread' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'responded', label: 'Responded' },
  { key: 'resolved', label: 'Resolved' },
];

export const PAYMENT_STATUS_LABEL = {
  paid: 'Paid (verified)',
  pending: 'Unpaid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function sessionTypeLabel(sessionType) {
  if (sessionType === 'crisis') return 'Crisis session';
  return 'Counseling session';
}

export function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
