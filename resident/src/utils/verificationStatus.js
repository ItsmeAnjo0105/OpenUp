// Psychologist credential verification (Psychologist.verification_status).
// Shared by Admin > Verification and the psychologist's own Profile page.
export const VERIFICATION_STATUS_META = {
  not_submitted: {
    label: 'Not Yet Submitted',
    badge: 'bg-brand-ink/10 text-brand-ink/70',
    dot: 'bg-brand-ink/40',
    explain: 'Add your PRC license details and upload your PRC ID, then submit them for verification. You will not appear to residents until an admin verifies you.',
  },
  pending: {
    label: 'Pending Review',
    badge: 'bg-amber-100 text-amber-800',
    dot: 'bg-amber-500',
    explain: 'Your credentials have been submitted and are waiting for an admin to review them. You will be notified of the decision.',
  },
  info_requested: {
    label: 'Additional Information Required',
    badge: 'bg-orange-100 text-orange-700',
    dot: 'bg-orange-500',
    explain: 'An admin needs more information or corrected documents. Read their message, upload what was asked for, then submit again.',
  },
  approved: {
    label: 'Verified',
    badge: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500',
    explain: 'An admin has reviewed and approved your credentials. You are visible to residents and can accept bookings.',
  },
  denied: {
    label: 'Verification Denied',
    badge: 'bg-red-100 text-red-600',
    dot: 'bg-red-500',
    explain: 'An admin denied your credentials. Read the reason below; you can correct your information and submit again.',
  },
};

// Admin-side wording for the list tabs.
export const VERIFICATION_FILTERS = [
  { key: 'pending', label: 'Pending Review' },
  { key: 'info_requested', label: 'Info Required' },
  { key: 'approved', label: 'Verified' },
  { key: 'denied', label: 'Denied' },
  { key: 'not_submitted', label: 'Not Submitted' },
  { key: 'all', label: 'All' },
];

export const DOCUMENT_TYPES = [
  { key: 'prc_id_front', label: 'PRC ID (front)', required: true },
  { key: 'prc_id_back', label: 'PRC ID (back)' },
  { key: 'certificate_of_registration', label: 'Certificate of registration' },
  { key: 'diploma', label: 'Diploma / educational credential' },
  { key: 'certificate', label: 'Professional certificate' },
  { key: 'other', label: 'Other supporting document' },
];

export const DOCUMENT_TYPE_LABEL = {
  ...Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.key, d.label])),
  prc_license: 'PRC license (legacy upload)',
};

export const DOCUMENT_STATUS_META = {
  draft: { label: 'Not submitted', badge: 'bg-brand-ink/10 text-brand-ink/70' },
  submitted: { label: 'Under review', badge: 'bg-amber-100 text-amber-800' },
  verified: { label: 'Verified', badge: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-600' },
  superseded: { label: 'Replaced', badge: 'bg-brand-ink/5 text-brand-ink/50' },
};

export const SUBMISSION_KIND_LABEL = {
  initial: 'First submission',
  update: 'Update to verified credentials',
  resubmission: 'Resubmission',
};

export const SUBMISSION_STATUS_LABEL = {
  pending: 'Pending review',
  info_requested: 'More information requested',
  approved: 'Approved',
  denied: 'Denied',
  superseded: 'Replaced by a newer submission',
};

export const HISTORY_ACTION_LABEL = {
  submitted: 'Credentials submitted',
  update_submitted: 'Updated credentials submitted',
  resubmitted: 'Credentials resubmitted',
  approved: 'Verification approved',
  update_approved: 'Credential update approved',
  denied: 'Verification denied',
  update_denied: 'Credential update not approved',
  verification_revoked: 'Verified status revoked',
  info_requested: 'Additional information requested',
  info_submitted: 'Requested information submitted',
  document_uploaded: 'Document uploaded',
  document_removed: 'Draft document removed',
  credentials_changed: 'License details edited',
};

export const DENIAL_REASONS = [
  'Invalid or unverifiable PRC license.',
  'Incomplete submitted documents.',
  'Incorrect professional information.',
  'Credentials do not meet verification requirements.',
];

export const INFO_REQUEST_REASONS = [
  'PRC license image is unclear.',
  'Missing supporting document.',
  'Incorrect license information.',
  'Expired or unverifiable credential.',
];

export const CONSULTATION_TYPE_LABEL = { online: 'Online', face_to_face: 'Face-to-Face' };
export const SESSION_DURATIONS = [30, 45, 60, 90, 120];

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(`${String(isoDate).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileTypeLabel(mime) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/jpeg') return 'JPG';
  return 'File';
}

// The badge a psychologist (or admin) should see: a verified psychologist with
// an update under review is still Verified, with the update called out.
export function displayStatus(status, isVerified) {
  if (isVerified && (status === 'pending' || status === 'info_requested')) {
    return {
      ...VERIFICATION_STATUS_META.approved,
      label: status === 'pending' ? 'Verified · Update pending review' : 'Verified · Update needs more info',
    };
  }
  return VERIFICATION_STATUS_META[status] || VERIFICATION_STATUS_META.not_submitted;
}
