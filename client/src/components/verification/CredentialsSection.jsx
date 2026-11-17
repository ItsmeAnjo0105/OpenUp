import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconUpload, IconFileTypePdf, IconExternalLink, IconShieldCheck, IconCertificate, IconReplace,
  IconTrash, IconAlertTriangle, IconSend, IconPencil, IconCircleCheck, IconHistory,
} from '@tabler/icons-react';
import ConfirmDialog from '../ConfirmDialog';
import { API_URL, authHeader } from '../../config';
import {
  displayStatus, DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL, DOCUMENT_STATUS_META, SUBMISSION_KIND_LABEL,
  SUBMISSION_STATUS_LABEL, formatDateTime, formatDate, formatBytes, fileTypeLabel,
} from '../../utils/verificationStatus';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ALLOWED_EXT = /\.(pdf|jpe?g|png)$/i;

const SUBMIT_CONFIRM_MESSAGE = 'Are you sure you want to submit your professional credentials for verification? Please make sure all uploaded documents and information are accurate.';

async function readJson(res) {
  try { return await res.json(); } catch {
    return { error: res.status === 404 ? 'The server is running an older version. Restart the backend server and try again.' : 'Unexpected server response.' };
  }
}

// XHR instead of fetch so the upload can report real progress.
function uploadWithProgress(formData, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/psychologists/me/documents`);
    const { Authorization } = authHeader();
    if (Authorization) xhr.setRequestHeader('Authorization', Authorization);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, data });
    };
    xhr.onerror = () => resolve({ ok: false, data: { error: 'Could not reach the server.' } });
    xhr.send(formData);
  });
}

function checkFile(file) {
  if (!ALLOWED_EXT.test(file.name)) return 'Only PDF, JPG, JPEG and PNG files are accepted.';
  if (file.size > MAX_BYTES) return 'Files must be 10 MB or smaller.';
  return '';
}

// Psychologist Profile > "Professional Credentials & Verification Documents"
// and "Verification Status". Regulated data only: changes here never touch the
// approved record until an admin reviews the submission.
function CredentialsSection({ onStatus }) {
  const [v, setV] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState(null); // { tone, text }
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [editingCreds, setEditingCreds] = useState(false);
  const [credForm, setCredForm] = useState({ license_no: '', license_expiry: '', credentials: '' });
  const [credSaving, setCredSaving] = useState(false);

  const [docType, setDocType] = useState('prc_id_front');
  const [upload, setUpload] = useState(null); // { name, progress }
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [showReplaced, setShowReplaced] = useState(false);
  const [response, setResponse] = useState('');
  const fileRef = useRef(null);
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const load = useCallback(() => {
    fetch(`${API_URL}/psychologists/me/verification`, { headers: authHeader() })
      .then(async (res) => ({ ok: res.ok, data: await readJson(res) }))
      .then(({ ok, data }) => {
        if (ok) {
          setV(data);
          setLoadError('');
          onStatusRef.current?.(data.status, data.is_verified);
        } else setLoadError(data?.error || 'Could not load your credentials.');
      })
      .catch(() => setLoadError('Could not reach the server.'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!message || message.tone === 'error') return undefined;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  if (!v) {
    return (
      <section className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <p className={`text-sm ${loadError ? 'text-red-600' : 'text-brand-ink/50'}`}>{loadError || 'Loading credentials...'}</p>
      </section>
    );
  }

  const locked = v.under_review;
  const meta = displayStatus(v.status, v.is_verified);
  const visibleDocs = v.documents.filter((d) => showReplaced || d.status !== 'superseded');
  const replacedCount = v.documents.filter((d) => d.status === 'superseded').length;
  const replacedBy = Object.fromEntries(v.documents.filter((d) => d.replaces_document_id && !['rejected', 'superseded'].includes(d.status)).map((d) => [d.replaces_document_id, d]));
  const latestSubmission = v.submissions[0];
  const updateDenied = v.status === 'approved' && latestSubmission?.status === 'denied';

  // ---- credentials -------------------------------------------------------
  const startEditCreds = () => {
    setCredForm({
      license_no: v.effective.license_no || '',
      license_expiry: v.effective.license_expiry || '',
      credentials: v.effective.credentials || '',
    });
    setEditingCreds(true);
    setMessage(null);
  };

  const saveCreds = async (e) => {
    e.preventDefault();
    setCredSaving(true);
    try {
      const res = await fetch(`${API_URL}/psychologists/me/credentials`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_no: credForm.license_no.trim(),
          license_expiry: credForm.license_expiry || null,
          credentials: credForm.credentials.trim(),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not save your license details.' }); return; }
      setEditingCreds(false);
      setMessage({
        tone: 'success',
        text: data.pending_credentials
          ? 'License details saved. Submit them for verification so an admin can review the change.'
          : 'No change from your approved license details.',
      });
      load();
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setCredSaving(false);
    }
  };

  // ---- documents ---------------------------------------------------------
  const pickFile = (target) => {
    setReplaceTarget(target);
    setMessage(null);
    fileRef.current?.click();
  };

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = checkFile(file);
    if (err) { setMessage({ tone: 'error', text: err }); return; }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', replaceTarget ? replaceTarget.doc_type : docType);
    if (replaceTarget) fd.append('replaces_document_id', replaceTarget.document_id);
    setUpload({ name: file.name, progress: 0 });
    const { ok, data } = await uploadWithProgress(fd, (p) => setUpload({ name: file.name, progress: p }));
    setUpload(null);
    setReplaceTarget(null);
    if (!ok) { setMessage({ tone: 'error', text: data.error || 'Upload failed.' }); return; }
    setMessage({ tone: 'success', text: `${file.name} uploaded. It will be reviewed once you submit for verification.` });
    load();
  };

  const removeDoc = (doc) => {
    setConfirmDialog({
      title: 'Remove this document?',
      message: `"${doc.file_name}" hasn't been submitted yet and will be deleted.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        const res = await fetch(`${API_URL}/psychologists/me/documents/${doc.document_id}`, { method: 'DELETE', headers: authHeader() });
        const data = await readJson(res);
        if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not remove that document.' }); return; }
        setMessage({ tone: 'success', text: 'Document removed.' });
        load();
      },
    });
  };

  // ---- submit ------------------------------------------------------------
  const submit = () => {
    setConfirmDialog({
      title: 'Submit for verification?',
      message: SUBMIT_CONFIRM_MESSAGE,
      cancelLabel: 'Cancel',
      confirmLabel: 'Yes, Submit for Verification',
      destructive: false,
      onConfirm: async () => {
        const res = await fetch(`${API_URL}/psychologists/me/verification/submit`, {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true, response: response.trim() || undefined }),
        });
        const data = await readJson(res);
        if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not submit your credentials.' }); return; }
        setResponse('');
        setMessage({
          tone: 'success',
          text: data.kind === 'update'
            ? 'Your updated credentials are awaiting admin review. Your verified status stays active in the meantime.'
            : 'Your documents have been submitted and are awaiting admin review.',
        });
        load();
      },
    });
  };

  return (
    <>
      {/* 4. Professional credentials ------------------------------------- */}
      <section id="credentials" className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <IconCertificate size={19} className="text-brand-primary" /> Professional Credentials &amp; Verification Documents
        </h2>
        <p className="text-sm text-brand-ink/60 mt-1">
          These are only visible to you and OpenUp admins. Nothing here is treated as verified until an admin approves it.
        </p>

        {message && (
          <p role="status" className={`mt-4 text-sm rounded-xl px-3 py-2 flex items-start gap-2 ${
            message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-primary/10 text-brand-primary'
          }`}>
            {message.tone === 'error' ? <IconAlertTriangle size={16} className="mt-0.5 shrink-0" /> : <IconCircleCheck size={16} className="mt-0.5 shrink-0" />}
            {message.text}
          </p>
        )}

        {locked && (
          <p className="mt-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
            Your credentials are under review, so they can't be changed until the admin responds.
          </p>
        )}

        {/* license details */}
        <div className="mt-5 border border-brand-ink/10 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold">PRC license details</h3>
            {!editingCreds && !locked && (
              <button onClick={startEditCreds} className="interactive inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20">
                <IconPencil size={13} /> Update
              </button>
            )}
          </div>

          {editingCreds ? (
            <form onSubmit={saveCreds} className="grid sm:grid-cols-2 gap-3">
              {v.is_verified && (
                <p className="sm:col-span-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  You are already verified. Changes here need admin review; your current verified details stay active until then.
                </p>
              )}
              <label className="text-xs text-brand-ink/60">
                PRC license number <span className="text-red-600">*</span>
                <input
                  required value={credForm.license_no} maxLength={20}
                  onChange={(e) => setCredForm({ ...credForm, license_no: e.target.value })}
                  className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink"
                />
              </label>
              <label className="text-xs text-brand-ink/60">
                License valid until
                <input
                  type="date" value={credForm.license_expiry}
                  onChange={(e) => setCredForm({ ...credForm, license_expiry: e.target.value })}
                  className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink"
                />
              </label>
              <label className="text-xs text-brand-ink/60 sm:col-span-2">
                Credentials (e.g. RPsy, Licensed Psychologist) <span className="text-red-600">*</span>
                <input
                  required value={credForm.credentials} maxLength={150}
                  onChange={(e) => setCredForm({ ...credForm, credentials: e.target.value })}
                  className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink"
                />
              </label>
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={credSaving} className="interactive text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {credSaving ? 'Saving...' : 'Save license details'}
                </button>
                <button type="button" onClick={() => setEditingCreds(false)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid sm:grid-cols-3 gap-3 text-sm">
              <CredField label="License number" approved={v.approved.license_no} pending={v.pending_credentials?.license_no} />
              <CredField label="Valid until" approved={formatDate(v.approved.license_expiry)} pending={v.pending_credentials ? formatDate(v.pending_credentials.license_expiry) : undefined} />
              <CredField label="Credentials" approved={v.approved.credentials} pending={v.pending_credentials?.credentials} />
            </dl>
          )}
        </div>

        {/* documents */}
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold">Uploaded documents</h3>
            {replacedCount > 0 && (
              <button onClick={() => setShowReplaced((s) => !s)} className="text-xs text-brand-ink/50 hover:text-brand-ink/70">
                {showReplaced ? 'Hide' : 'Show'} replaced documents ({replacedCount})
              </button>
            )}
          </div>

          {visibleDocs.length === 0 ? (
            <p className="text-sm text-brand-ink/50 border border-dashed border-brand-ink/15 rounded-xl px-4 py-6 text-center">
              No documents uploaded yet. Start with the front of your PRC ID.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {visibleDocs.map((d) => {
                const sm = DOCUMENT_STATUS_META[d.status] || DOCUMENT_STATUS_META.submitted;
                const pendingReplacement = replacedBy[d.document_id];
                return (
                  <li key={d.document_id} className={`border border-brand-ink/10 rounded-xl overflow-hidden flex flex-col ${d.status === 'superseded' ? 'opacity-60' : ''}`}>
                    <a href={d.url || undefined} target="_blank" rel="noreferrer" className="block h-32 bg-brand-ink/5 relative" aria-label={`Open ${d.file_name}`}>
                      {d.url && d.mime_type.startsWith('image/') ? (
                        <img src={d.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex flex-col items-center justify-center text-brand-ink/40">
                          <IconFileTypePdf size={34} />
                          <span className="text-[11px] mt-1">PDF preview</span>
                        </span>
                      )}
                      <span className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.badge}`}>{sm.label}</span>
                    </a>
                    <div className="p-3 flex-1 flex flex-col">
                      <p className="text-sm font-medium">{DOCUMENT_TYPE_LABEL[d.doc_type] || 'Document'}</p>
                      <p className="text-[11px] text-brand-ink/55 truncate" title={d.file_name}>{d.file_name}</p>
                      <p className="text-[11px] text-brand-ink/45">
                        {fileTypeLabel(d.mime_type)} · {formatBytes(d.size_bytes)} · Uploaded {formatDateTime(d.uploaded_at)}
                      </p>
                      {d.replaces_document_id && d.status !== 'superseded' && (
                        <p className="text-[11px] text-brand-primary mt-0.5">Replacement for an earlier document</p>
                      )}
                      {pendingReplacement && (
                        <p className="text-[11px] text-amber-700 mt-0.5">Replacement uploaded -- this stays in use until it's approved.</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {d.url && (
                          <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-brand-ink/15">
                            <IconExternalLink size={12} /> View
                          </a>
                        )}
                        {!locked && !['superseded', 'rejected'].includes(d.status) && !pendingReplacement && (
                          <button onClick={() => pickFile(d)} disabled={Boolean(upload)} className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-brand-ink/15 disabled:opacity-50">
                            <IconReplace size={12} /> Replace
                          </button>
                        )}
                        {!locked && d.status === 'draft' && (
                          <button onClick={() => removeDoc(d)} className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-red-200 text-red-600">
                            <IconTrash size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!locked && (
            <div className="mt-4 bg-brand-bg rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="text-sm border border-brand-ink/15 rounded-full px-3 py-2 bg-brand-surface"
                  aria-label="Document type"
                >
                  {DOCUMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}{t.required ? ' (required)' : ''}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  disabled={Boolean(upload)}
                  className="interactive inline-flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60"
                >
                  <IconUpload size={15} /> Upload document
                </button>
              </div>
              <p className="text-[11px] text-brand-ink/50 mt-2">PDF, JPG, JPEG or PNG, up to 10 MB each.</p>
              {upload && (
                <div className="mt-3" aria-live="polite">
                  <div className="flex justify-between text-[11px] text-brand-ink/60 mb-1">
                    <span className="truncate">{replaceTarget ? 'Replacing with ' : 'Uploading '}{upload.name}</span>
                    <span>{upload.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-brand-ink/10 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-primary transition-all" style={{ width: `${upload.progress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept={ACCEPT} onChange={onFileChosen} className="hidden" />
        </div>
      </section>

      {/* 5. Verification status ------------------------------------------ */}
      <section id="verification-status" className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <IconShieldCheck size={19} className="text-brand-primary" /> Verification Status
          </h2>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
          </span>
        </div>
        <p className="text-sm text-brand-ink/60 mt-2">
          {v.is_verified && v.status === 'pending'
            ? 'Your updated credentials are waiting for admin review. Your current verified status and approved details stay active in the meantime.'
            : (v.is_verified && v.status === 'info_requested')
              ? 'An admin needs more information about your credential update. Your current verified status stays active.'
              : meta.explain}
        </p>
        {v.submitted_at && <p className="text-[11px] text-brand-ink/45 mt-1">Last submitted {formatDateTime(v.submitted_at)}</p>}

        {v.status === 'info_requested' && v.note && (
          <AdminMessage tone="orange" title="Message from the admin" body={v.note} when={v.decided_at} />
        )}
        {v.status === 'denied' && (
          <AdminMessage tone="red" title="Reason for denial" body={v.note || 'No reason was recorded for this decision.'} when={v.decided_at} />
        )}
        {updateDenied && v.note && (
          <AdminMessage tone="red" title="Your latest update was not approved" body={v.note} when={v.decided_at} />
        )}

        {v.missing_requirements.length > 0 && !locked && (
          <p className="mt-4 text-sm text-brand-ink/70">
            <span className="font-medium">Still needed before you can submit:</span> {v.missing_requirements.join(', ')}.
          </p>
        )}
        {v.has_unsubmitted_changes && !locked && (
          <p className="mt-3 text-xs bg-brand-primary/10 text-brand-primary rounded-lg px-3 py-2">
            You have changes that haven't been submitted for verification yet.
          </p>
        )}

        {!locked && v.can_submit && (
          <div className="mt-4">
            <label htmlFor="submit-note" className="text-xs font-medium text-brand-ink/70 block mb-1">
              {v.status === 'info_requested' ? 'Your response to the admin' : 'Note for the admin (optional)'}
            </label>
            <textarea
              id="submit-note"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder={v.status === 'info_requested' ? 'e.g. I uploaded a clearer photo of my PRC ID, front and back.' : 'Anything the admin should know about these documents'}
              className="w-full border border-brand-ink/15 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        )}

        <button
          onClick={submit}
          disabled={!v.can_submit || locked}
          className="interactive mt-3 inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-40"
        >
          <IconSend size={15} /> Submit Documents for Verification
        </button>
        {!v.can_submit && !locked && v.missing_requirements.length === 0 && v.is_verified && (
          <p className="text-[11px] text-brand-ink/45 mt-1.5">Nothing new to submit. Upload a document or update your license details first.</p>
        )}

        {v.submissions.length > 0 && (
          <details className="mt-5 group">
            <summary className="text-sm font-semibold cursor-pointer inline-flex items-center gap-1.5">
              <IconHistory size={15} className="text-brand-primary" /> Submission history ({v.submissions.length})
            </summary>
            <ol className="mt-3 space-y-3">
              {v.submissions.map((s) => (
                <li key={s.submission_id} className="border-l-2 border-brand-primary/30 pl-3">
                  <p className="text-sm font-medium">{SUBMISSION_KIND_LABEL[s.kind]} · <span className="text-brand-ink/60 font-normal">{SUBMISSION_STATUS_LABEL[s.status]}</span></p>
                  <p className="text-[11px] text-brand-ink/45">
                    Submitted {formatDateTime(s.submitted_at)}{s.decided_at ? ` · Reviewed ${formatDateTime(s.decided_at)}` : ''}
                  </p>
                  {s.decision_note && <p className="text-xs text-brand-ink/70 mt-0.5 whitespace-pre-wrap wrap-break-word">Admin: {s.decision_note}</p>}
                  {s.response && <p className="text-xs text-brand-ink/55 mt-0.5 whitespace-pre-wrap wrap-break-word">Your note: {s.response}</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </>
  );
}

function CredField({ label, approved, pending }) {
  const changed = pending !== undefined && pending !== null && pending !== approved && pending !== '';
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-brand-ink/45">{label}</dt>
      <dd className={approved ? '' : 'text-brand-ink/35 italic'}>{approved || 'Not provided'}</dd>
      {changed && <dd className="text-[11px] text-amber-700 mt-0.5">Proposed: {pending}</dd>}
    </div>
  );
}

function AdminMessage({ tone, title, body, when }) {
  const cls = tone === 'red' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-orange-50 border-orange-200 text-orange-800';
  return (
    <div className={`mt-4 border rounded-xl px-4 py-3 ${cls}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm mt-1 whitespace-pre-wrap wrap-break-word">{body}</p>
      {when && <p className="text-[11px] opacity-70 mt-1">{formatDateTime(when)}</p>}
    </div>
  );
}

export default CredentialsSection;
