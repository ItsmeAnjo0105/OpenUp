// Subscription + renewal request statuses, shared by the Barangay
// Subscription page and the Admin Subscriptions page so both always show the
// same labels and colors.

// Current term (display_status from the server).
export const SUBSCRIPTION_STATUS_META = {
  active: { label: 'Active', badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  expiring_soon: { label: 'Expiring Soon', badge: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
  pending_renewal: { label: 'Pending Renewal', badge: 'bg-yellow-100 text-yellow-800', bar: 'bg-yellow-500' },
  expired: { label: 'Expired', badge: 'bg-gray-200 text-gray-700', bar: 'bg-gray-400' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-600', bar: 'bg-red-400' },
  none: { label: 'No subscription', badge: 'bg-brand-ink/5 text-brand-ink/60', bar: 'bg-brand-ink/20' },
};

// Subscription_Request.status.
export const REQUEST_STATUS_META = {
  pending: { label: 'Pending Approval', badge: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', badge: 'bg-sky-100 text-sky-700' },
  scheduled: { label: 'Scheduled', badge: 'bg-teal-100 text-teal-700' },
  activated: { label: 'Activated', badge: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-600' },
  cancelled: { label: 'Cancelled', badge: 'bg-gray-200 text-gray-700' },
};

export const REQUEST_FILTERS = [
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'activated', label: 'Activated' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

export const PAYMENT_STATUS_LABEL = {
  unpaid: 'Awaiting payment',
  submitted: 'Payment details sent — awaiting verification',
  verified: 'Payment verified',
  not_required: 'No payment required',
};

export const HISTORY_LABEL = {
  subscribed: 'Subscribed',
  renewed: 'Renewed',
  plan_changed: 'Plan changed',
  status_changed: 'Status changed',
  request_submitted: 'Renewal request submitted',
  request_approved: 'Request approved',
  request_rejected: 'Request rejected',
  request_cancelled: 'Request cancelled',
  payment_submitted: 'Payment details submitted',
  payment_verified: 'Payment verified',
  activated: 'Subscription activated',
  credits_issued: 'Care Credits issued',
  expired: 'Subscription expired',
};

export const REJECTION_REASONS = [
  'Incomplete requirements',
  'Payment issue',
  'Incorrect subscription selection',
];

export const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
export const credits = (n) => Number(n || 0).toLocaleString();

export function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
}

export function fmtShortDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

export function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

// What the barangay should expect for activation, in words.
export function activationText(request) {
  if (request.status === 'activated') return fmtDate(request.period_start || request.activated_at);
  if (request.expected_activation_at) return fmtDate(request.expected_activation_at);
  return 'As soon as approved and payment is verified';
}
