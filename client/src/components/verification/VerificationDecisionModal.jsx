import { useState } from 'react';
import { IconCircleCheck, IconCircleX, IconInfoCircle } from '@tabler/icons-react';
import { DENIAL_REASONS, INFO_REQUEST_REASONS } from '../../utils/verificationStatus';
import { playClick, playHover } from '../../utils/sound';

const MIN_LENGTH = 10;

const MODES = {
  approve: {
    icon: IconCircleCheck,
    iconClass: 'bg-emerald-100 text-emerald-700',
    title: 'Approve Psychologist Application?',
    message: "Are you sure you want to approve this psychologist's application? Please make sure you have reviewed the submitted information and verified the professional credentials.",
    confirm: 'Yes, Approve Application',
    confirmClass: 'bg-brand-primary interactive-accept',
  },
  deny: {
    icon: IconCircleX,
    iconClass: 'bg-red-100 text-red-600',
    title: 'Deny Psychologist Application?',
    message: "Are you sure you want to deny this psychologist's application? Please review their submitted documents before proceeding.",
    confirm: 'Yes, Deny Application',
    confirmClass: 'bg-red-600 interactive-decline',
    fieldLabel: 'Reason for Denial',
    placeholder: 'Explain why this application is being denied. The psychologist will see this.',
  },
  request_info: {
    icon: IconInfoCircle,
    iconClass: 'bg-orange-100 text-orange-700',
    title: 'Request Additional Information?',
    message: 'The application will move to "Additional Information Required" and the psychologist will be notified to upload corrected or missing documents. It returns to Pending Review once they resubmit.',
    confirm: 'Send Request',
    confirmClass: 'bg-orange-600',
    fieldLabel: 'Missing information or documents',
    placeholder: 'e.g. Please upload a clear photo of the front of your current PRC license ID.',
  },
};

// One confirmation modal for all three admin decisions. Nothing changes until
// the confirm button is pressed -- Cancel, the backdrop and Escape all just
// close it. `onConfirm(text)` returns a promise resolving to an error string
// (keeps the modal open and shows it) or null (success; parent closes it).
function VerificationDecisionModal({ mode, applicant, onCancel, onConfirm }) {
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('');
  const [revoke, setRevoke] = useState(false);
  const isUpdate = Boolean(applicant.is_update);
  const presets = mode === 'deny' ? DENIAL_REASONS : mode === 'request_info' ? INFO_REQUEST_REASONS : [];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const base = MODES[mode];
  const m = isUpdate && mode === 'approve'
    ? { ...base, title: 'Approve Credential Update?', message: 'The newly submitted license details and documents will replace the currently approved ones. Make sure you have compared them and verified the new credentials.', confirm: 'Yes, Approve Update' }
    : isUpdate && mode === 'deny'
      ? { ...base, title: 'Deny Credential Update?', message: 'The update will be rejected. Unless you revoke verification below, their previously approved credentials stay in effect.', confirm: 'Yes, Deny Update' }
      : base;
  const needsText = mode !== 'approve';
  const Icon = m.icon;

  const finalText = presets.length && preset && preset !== 'other'
    ? [preset, text.trim()].filter(Boolean).join(' ')
    : text.trim();
  const valid = !needsText || finalText.length >= MIN_LENGTH;

  const submit = async () => {
    if (!valid || submitting) return;
    playClick();
    setSubmitting(true);
    setError('');
    const err = await onConfirm(needsText ? finalText : undefined, { revoke: isUpdate && mode === 'deny' && revoke });
    if (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  const close = () => !submitting && onCancel();

  return (
    <div className="fixed inset-0 bg-black/40 z-60 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-brand-surface rounded-2xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verification-decision-title"
      >
        <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${m.iconClass}`}>
          <Icon size={22} />
        </div>
        <h2 id="verification-decision-title" className="font-display text-lg font-semibold mb-1">{m.title}</h2>
        <p className="text-sm text-brand-ink/60 mb-4">{m.message}</p>

        <dl className="bg-brand-bg rounded-xl px-4 py-3 space-y-1.5 mb-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">Name</dt>
            <dd className="font-medium text-right">{applicant.name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">License no.</dt>
            <dd className="font-mono text-right">{applicant.license_no || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">Credentials</dt>
            <dd className="text-right">{applicant.credentials || '—'}</dd>
          </div>
        </dl>

        {mode === 'approve' && applicant.document_count === 0 && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-4">
            No verification documents were uploaded. Only approve if you have verified this license independently.
          </p>
        )}

        {presets.length > 0 && (
          <fieldset className="mb-3">
            <legend className="text-xs font-medium text-brand-ink/70 mb-2">Common reasons</legend>
            <div className="space-y-1.5">
              {[...presets, 'other'].map((r) => (
                <label key={r} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="decision-reason"
                    value={r}
                    checked={preset === r}
                    onChange={() => setPreset(r)}
                    className={`mt-0.5 ${mode === 'deny' ? 'accent-red-600' : 'accent-orange-600'}`}
                  />
                  <span>{r === 'other' ? (mode === 'deny' ? 'Other reason' : 'Other verification concern') : r}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {needsText && (
          <div className="mb-4">
            <label htmlFor="decision-text" className="text-xs font-medium text-brand-ink/70 block mb-1">
              {m.fieldLabel} <span className="text-red-600">*</span>
              {presets.length > 0 && preset && preset !== 'other' && (
                <span className="font-normal text-brand-ink/45"> (optional details)</span>
              )}
            </label>
            <textarea
              id="decision-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder={m.placeholder}
              className="w-full border border-brand-ink/15 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary bg-brand-surface"
            />
            {!valid && (
              <p className="text-[11px] text-brand-ink/45 mt-1">
                {presets.length ? 'Choose a reason or write at least' : 'Write at least'} {MIN_LENGTH} characters.
              </p>
            )}
          </div>
        )}

        {isUpdate && mode === 'deny' && (
          <label className="flex items-start gap-2 text-sm mb-4 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="mt-0.5 accent-red-600" />
            <span>
              <span className="font-medium text-red-700">Also revoke verified status</span>
              <span className="block text-xs text-red-700/80">Only if their license can no longer be considered valid. They will be hidden from residents and unable to accept bookings.</span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { playClick(); close(); }}
            onMouseEnter={playHover}
            disabled={submitting}
            className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            onMouseEnter={playHover}
            disabled={!valid || submitting}
            className={`interactive flex-1 text-sm font-medium py-2.5 px-3 rounded-full text-white disabled:opacity-50 ${m.confirmClass}`}
          >
            {submitting ? 'Please wait...' : m.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VerificationDecisionModal;
