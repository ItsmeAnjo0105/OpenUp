import { useEffect, useState } from 'react';
import {
  IconX, IconUser, IconCertificate, IconFileText, IconHistory, IconExternalLink, IconMessage2, IconArrowsDiff, IconCash,
} from '@tabler/icons-react';
import { API_URL, authHeader } from '../../config';
import {
  VERIFICATION_STATUS_META, DOCUMENT_TYPE_LABEL, DOCUMENT_STATUS_META, HISTORY_ACTION_LABEL, SUBMISSION_KIND_LABEL,
  SUBMISSION_STATUS_LABEL, CONSULTATION_TYPE_LABEL, displayStatus, formatDateTime, formatDate, formatBytes, fileTypeLabel,
} from '../../utils/verificationStatus';
import { initialsOf } from '../../utils/inquiryStatus';

const OUTDATED = 'The server is running an older version. Restart the backend server and try again.';

// Admin > Verification > View Details. Shows only what the psychologist
// actually submitted -- a field they never filled in reads "Not provided",
// never a placeholder value. Parents remount it per application (key=...).
function ApplicationDetailModal({ psychologistId, onClose, onApprove, onDeny, onRequestInfo }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/admin/psychologists/${psychologistId}/application`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data }), () => ({ ok: false, data: { error: res.status === 404 ? OUTDATED : 'Unexpected server response.' } })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok) setApp(data);
        else setError(data?.error || 'Could not load this application.');
      })
      .catch(() => !cancelled && setError('Could not reach the server.'));
    return () => { cancelled = true; };
  }, [psychologistId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="alertdialog"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Signed URLs in the payload expire after 10 minutes, so "Open original"
  // always asks for a fresh one. The tab is opened synchronously first so the
  // browser doesn't treat it as an unrequested popup.
  const openOriginal = async (doc) => {
    const win = window.open('', '_blank');
    try {
      const res = await fetch(`${API_URL}/admin/psychologists/${psychologistId}/documents/${doc.document_id}/url`, { headers: authHeader() });
      const data = await res.json();
      if (res.ok && data.url) {
        if (win) win.location.replace(data.url);
        else window.open(data.url, '_blank', 'noopener');
      } else {
        win?.close();
        setError(data.error || 'Could not open that document.');
      }
    } catch {
      win?.close();
      setError('Could not reach the server.');
    }
  };

  const v = app?.verification;
  const status = v?.status;
  const meta = v ? displayStatus(status, v.is_verified) : null;
  const cmp = app?.comparison;
  const newDocIds = cmp ? new Set(cmp.submitted_document_ids.filter((id) => !cmp.approved_document_ids.includes(id))) : new Set();
  // Under review first, then the rest; replaced documents last.
  const docs = app ? [...app.documents].sort((a, b) => {
    const rank = (d) => ({ submitted: 0, draft: 1, verified: 2, rejected: 3, superseded: 4 }[d.status] ?? 5);
    return rank(a) - rank(b);
  }) : [];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div
        className="bg-brand-bg rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Psychologist application details"
      >
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 bg-brand-surface border-b border-brand-ink/10">
          <div className="flex items-center gap-3 min-w-0">
            {app?.personal.profile_photo_url ? (
              <img src={app.personal.profile_photo_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-brand-primary text-white flex items-center justify-center font-semibold shrink-0">
                {initialsOf(app?.personal.name)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold truncate">{app?.personal.name || 'Application'}</p>
              {meta && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${meta.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                  </span>
                  {v.submitted_at && <span className="text-[11px] text-brand-ink/50">Latest submission {formatDateTime(v.submitted_at)}</span>}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-brand-ink/5 text-brand-ink/50" aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!app && !error && <p className="text-sm text-brand-ink/50 py-10 text-center">Loading application...</p>}

          {app && (
            <>
              {v.is_update && (
                <Notice tone="sage" title="Update from an already verified psychologist"
                  body="Their previously approved credentials stay in effect until you decide. Compare the approved and newly submitted details below." />
              )}
              {status === 'denied' && v.note && (
                <Notice tone="red" title="Reason for denial" body={v.note} meta={decisionMeta(v)} />
              )}
              {status === 'info_requested' && v.note && (
                <Notice tone="orange" title="Information requested from the psychologist" body={v.note} meta={decisionMeta(v)} />
              )}
              {status === 'approved' && v.decided_at && (
                <Notice tone="green" title={v.note ? 'Verified (latest update was not approved)' : 'Verified'} body={v.note} meta={decisionMeta(v)} />
              )}
              {status === 'not_submitted' && (
                <Notice tone="sage" title="Credentials not submitted yet"
                  body="This psychologist hasn't submitted their documents for verification. You can review what they've provided so far." />
              )}
              {v.response && ['pending', 'info_requested'].includes(status) && (
                <Notice tone="sage" icon={IconMessage2} title="Psychologist's note" body={v.response} />
              )}

              <div className="grid sm:grid-cols-3 gap-3">
                <Stat label="Current status" value={(VERIFICATION_STATUS_META[status] || {}).label} />
                <Stat label="Previous status" value={v.previous_status ? (VERIFICATION_STATUS_META[v.previous_status] || {}).label : null} />
                <Stat label="Latest submission" value={v.submitted_at ? formatDateTime(v.submitted_at) : null} />
              </div>

              {cmp && (
                <Section icon={IconArrowsDiff} title={cmp.kind === 'update' ? 'Approved vs. newly submitted credentials' : 'Submitted credentials'}>
                  <div className="sm:col-span-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-brand-ink/45">
                          <th className="py-1.5 pr-3 font-medium">Field</th>
                          {cmp.kind === 'update' && <th className="py-1.5 pr-3 font-medium">Currently approved</th>}
                          <th className="py-1.5 font-medium">{cmp.kind === 'update' ? 'Newly submitted' : 'Submitted'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['PRC license number', cmp.approved.license_no, cmp.submitted.license_no, true],
                          ['License valid until', formatDate(cmp.approved.license_expiry), formatDate(cmp.submitted.license_expiry)],
                          ['Credentials', cmp.approved.credentials, cmp.submitted.credentials],
                          ['Documents', `${cmp.approved_document_ids.length} verified`, `${cmp.submitted_document_ids.length} (${newDocIds.size} new)`],
                        ].map(([label, before, after, mono]) => {
                          const changed = cmp.kind === 'update' && (before || '') !== (after || '');
                          return (
                            <tr key={label} className="border-t border-brand-ink/10">
                              <td className="py-2 pr-3 text-brand-ink/60">{label}</td>
                              {cmp.kind === 'update' && <td className={`py-2 pr-3 ${mono ? 'font-mono' : ''}`}>{before || '—'}</td>}
                              <td className={`py-2 ${mono ? 'font-mono' : ''} ${changed ? 'font-semibold text-amber-800 bg-amber-50 px-2 rounded' : ''}`}>{after || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              <Section icon={IconUser} title="Personal information">
                <Row label="Full name" value={app.personal.name} />
                <Row label="Email address" value={app.personal.email} />
                <Row label="Contact number" value={app.personal.contact_number} />
                <Row label="Barangay" value={app.personal.barangay} />
                <Row label="Registered" value={formatDateTime(app.personal.registered_at)} />
                <Row label="Profile picture" value={app.personal.profile_photo_url ? 'Uploaded (shown above)' : null} />
              </Section>

              <Section icon={IconCertificate} title="Professional information">
                <Row label="PRC license number (approved record)" value={app.professional.license_no} mono />
                <Row label="License valid until" value={formatDate(app.professional.license_expiry)} />
                <Row label="Credentials" value={app.professional.credentials} />
                <Row label="Professional title" value={app.professional.professional_title} />
                <Row label="Specialization" value={app.professional.specialties.join(', ')} />
                <Row label="Areas of expertise" value={app.professional.expertise.join(', ')} />
                <Row label="Years of experience" value={app.professional.years_experience ?? null} />
                <Row label="Languages" value={app.professional.languages.join(', ')} />
                <Row label="Educational background" value={app.professional.education} wide />
                <Row label="Professional biography" value={app.professional.bio} wide />
              </Section>

              <Section icon={IconCash} title="Services">
                <Row label="Consultation types" value={app.professional.consultation_types.map((t) => CONSULTATION_TYPE_LABEL[t]).join(', ')} />
                <Row label="Session duration" value={app.professional.session_duration_minutes ? `${app.professional.session_duration_minutes} minutes` : null} />
                <Row label="Consultation rate" value={app.professional.session_price ? `₱${Number(app.professional.session_price).toLocaleString()}` : null} />
                <Row label="Services" value={app.professional.services.join(', ')} />
              </Section>

              <Section icon={IconFileText} title={`Verification documents (${app.documents.filter((d) => d.status !== 'superseded').length})`}>
                {docs.length === 0 ? (
                  <p className="text-sm text-brand-ink/50 sm:col-span-2">
                    No documents have been uploaded. Verify the license number against the PRC registry, or use
                    "Request info" to ask for the PRC ID.
                  </p>
                ) : (
                  <div className="sm:col-span-2 grid gap-4">
                    {docs.map((d) => {
                      const sm = DOCUMENT_STATUS_META[d.status] || DOCUMENT_STATUS_META.submitted;
                      return (
                        <div key={d.document_id} className={`border rounded-xl overflow-hidden bg-brand-surface ${newDocIds.has(d.document_id) ? 'border-amber-300' : 'border-brand-ink/10'} ${d.status === 'superseded' ? 'opacity-60' : ''}`}>
                          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-brand-ink/10">
                            <div className="min-w-0">
                              <p className="text-sm font-medium flex flex-wrap items-center gap-2">
                                {DOCUMENT_TYPE_LABEL[d.doc_type] || 'Document'}
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.badge}`}>{sm.label}</span>
                                {newDocIds.has(d.document_id) && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">New in this submission</span>}
                                {d.replaces_document_id && d.status !== 'superseded' && <span className="text-[10px] text-brand-ink/50">replaces an earlier document</span>}
                              </p>
                              <p className="text-[11px] text-brand-ink/50 truncate">
                                {d.file_name} · {fileTypeLabel(d.mime_type)} · {formatBytes(d.size_bytes)} · Uploaded {formatDateTime(d.uploaded_at)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openOriginal(d)}
                              className="interactive shrink-0 inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                            >
                              <IconExternalLink size={13} /> Open original
                            </button>
                          </div>
                          {d.status !== 'superseded' && d.url && d.mime_type.startsWith('image/') && (
                            <a href={d.url} target="_blank" rel="noreferrer" className="block bg-brand-ink/5">
                              <img src={d.url} alt={`${DOCUMENT_TYPE_LABEL[d.doc_type]} preview`} className="w-full max-h-112 object-contain" />
                            </a>
                          )}
                          {d.status !== 'superseded' && d.url && d.mime_type === 'application/pdf' && (
                            <iframe src={d.url} title={d.file_name} className="w-full h-96 bg-white" />
                          )}
                          {!d.url && <p className="text-xs text-red-600 px-4 py-3">Preview unavailable -- use Open original.</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              {app.submissions.length > 0 && (
                <Section icon={IconHistory} title={`Submission history (${app.submissions.length})`}>
                  <ol className="sm:col-span-2 space-y-3">
                    {app.submissions.map((s) => (
                      <li key={s.submission_id} className="border-l-2 border-brand-primary/30 pl-3">
                        <p className="text-sm font-medium">
                          {SUBMISSION_KIND_LABEL[s.kind]} · <span className="font-normal text-brand-ink/60">{SUBMISSION_STATUS_LABEL[s.status]}</span>
                        </p>
                        <p className="text-[11px] text-brand-ink/50">
                          Submitted {formatDateTime(s.submitted_at)} · License <span className="font-mono">{s.license_no || '—'}</span> · {s.document_count} document{s.document_count === 1 ? '' : 's'}
                          {s.decided_at ? ` · Decided ${formatDateTime(s.decided_at)}${s.decided_by_name ? ` by ${s.decided_by_name}` : ''}` : ''}
                        </p>
                        {s.response && <p className="text-xs text-brand-ink/60 mt-0.5 wrap-break-word">Psychologist: {s.response}</p>}
                        {s.decision_note && <p className="text-xs text-brand-ink/70 mt-0.5 wrap-break-word">Admin: {s.decision_note}</p>}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              <Section icon={IconHistory} title="Activity log">
                {app.history.length === 0 ? (
                  <p className="text-sm text-brand-ink/50 sm:col-span-2">No activity recorded yet.</p>
                ) : (
                  <ol className="sm:col-span-2 space-y-3">
                    {app.history.map((h) => (
                      <li key={h.event_id} className="flex gap-3">
                        <span className="w-2 h-2 rounded-full bg-brand-primary/60 mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{HISTORY_ACTION_LABEL[h.action] || h.action}</p>
                          <p className="text-[11px] text-brand-ink/50">
                            {formatDateTime(h.created_at)}{h.actor_name ? ` · ${h.actor_name}` : ''}
                          </p>
                          {h.note && <p className="text-xs text-brand-ink/70 mt-0.5 whitespace-pre-wrap wrap-break-word">{h.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>
            </>
          )}
        </div>

        {app && (status === 'pending' || status === 'info_requested') && (
          <div className="flex flex-wrap justify-end gap-2 px-5 sm:px-6 py-3 bg-brand-surface border-t border-brand-ink/10">
            {status === 'info_requested' && (
              <p className="text-xs text-brand-ink/50 mr-auto self-center">
                Waiting on the psychologist -- it can't be approved until they resubmit.
              </p>
            )}
            {status === 'pending' && (
              <button onClick={() => onRequestInfo(app)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-orange-300 text-orange-700">
                Request info
              </button>
            )}
            <button onClick={() => onDeny(app)} className="interactive text-sm font-medium px-4 py-2 rounded-full border border-red-300 text-red-600">
              {v.is_update ? 'Deny update' : 'Deny'}
            </button>
            {status === 'pending' && (
              <button onClick={() => onApprove(app)} className="interactive interactive-accept text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
                {v.is_update ? 'Approve update' : 'Approve'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function decisionMeta(v) {
  if (!v.decided_at) return null;
  return `${formatDateTime(v.decided_at)}${v.decided_by_name ? ` · by ${v.decided_by_name}` : ''}`;
}

const NOTICE_TONES = {
  red: 'bg-red-50 border-red-200 text-red-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  sage: 'bg-brand-primary/5 border-brand-primary/20 text-brand-ink',
};

function Notice({ tone, title, body, meta, icon: Icon }) {
  return (
    <div className={`border rounded-xl px-4 py-3 ${NOTICE_TONES[tone]}`}>
      <p className="text-sm font-semibold flex items-center gap-1.5">{Icon && <Icon size={15} />}{title}</p>
      {body && <p className="text-sm mt-1 whitespace-pre-wrap wrap-break-word">{body}</p>}
      {meta && <p className="text-[11px] opacity-70 mt-1">{meta}</p>}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-brand-surface rounded-xl shadow-sm px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">{label}</p>
      <p className={`text-sm mt-0.5 ${value ? 'font-medium' : 'text-brand-ink/35 italic'}`}>{value || 'None'}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="bg-brand-surface rounded-xl shadow-sm p-4 sm:p-5">
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Icon size={16} className="text-brand-primary" /> {title}
      </h3>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono, wide }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] uppercase tracking-wide text-brand-ink/45">{label}</dt>
      <dd className={`text-sm mt-0.5 wrap-break-word ${empty ? 'text-brand-ink/35 italic' : ''} ${mono && !empty ? 'font-mono' : ''}`}>
        {empty ? 'Not provided' : value}
      </dd>
    </div>
  );
}

export default ApplicationDetailModal;
