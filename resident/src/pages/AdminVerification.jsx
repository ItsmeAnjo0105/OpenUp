import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconClipboardCheck, IconSearch, IconEye, IconFileText, IconCircleCheck, IconX } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ApplicationDetailModal from '../components/verification/ApplicationDetailModal';
import VerificationDecisionModal from '../components/verification/VerificationDecisionModal';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';
import { initialsOf } from '../utils/inquiryStatus';
import { VERIFICATION_FILTERS, displayStatus, formatDateTime } from '../utils/verificationStatus';

const SUCCESS_MESSAGE = {
  approve: 'Psychologist application successfully approved.',
  approve_update: 'Credential update approved.',
  deny: 'Psychologist application has been denied.',
  deny_update: 'Credential update has been denied.',
  deny_revoke: 'Credential update denied and verified status revoked.',
  request_info: 'Additional information has been requested from the psychologist.',
};

const ENDPOINT = { approve: 'verify', deny: 'reject', request_info: 'request-info' };

// Normalizes a list row or a detail payload into what the decision modal shows.
function toApplicant(source) {
  if (source.personal) {
    return {
      psychologist_id: source.psychologist_id,
      name: source.personal.name,
      license_no: source.professional.license_no,
      credentials: source.professional.credentials,
      document_count: source.documents.filter((d) => d.status !== 'superseded').length,
      is_update: source.verification.is_update,
    };
  }
  return {
    psychologist_id: source.psychologist_id,
    name: source.User?.name,
    license_no: source.license_no,
    credentials: source.credentials,
    document_count: source.document_count,
    is_update: source.is_update,
  };
}

function AdminVerification() {
  const [applications, setApplications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [decision, setDecision] = useState(null); // { mode, applicant }
  const [toast, setToast] = useState('');

  // Everything is loaded once and filtered client-side so every status tab can
  // show its count. Approved and denied applications stay here as history.
  const load = useCallback(() => {
    fetch(`${API_URL}/admin/psychologists?status=all`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) {
          // Never let an application fall outside every tab: if the status field is
          // missing (older server / migration not run), derive it from is_verified.
          setApplications(data.map((a) => ({
            ...a,
            verification_status: a.verification_status || (a.is_verified ? 'approved' : 'pending'),
            is_update: Boolean(a.is_update),
            document_count: a.document_count ?? 0,
          })));
          setError('');
        }
        else setError(data?.error || 'Could not load applications.');
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const c = { all: applications.length };
    applications.forEach((a) => { c[a.verification_status] = (c[a.verification_status] || 0) + 1; });
    return c;
  }, [applications]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (filter !== 'all' && a.verification_status !== filter) return false;
      if (!q) return true;
      return [a.User?.name, a.User?.email, a.license_no].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [applications, filter, search]);

  const openDecision = (mode, source) => {
    playClick();
    setDecision({ mode, applicant: toApplicant(source) });
  };

  // Returns an error string to keep the modal open, or null on success.
  const confirmDecision = async (text, { revoke } = {}) => {
    const { mode, applicant } = decision;
    const body = { confirm: true };
    if (mode === 'deny') { body.reason = text; if (revoke) body.revoke = true; }
    if (mode === 'request_info') body.note = text;
    try {
      const res = await fetch(`${API_URL}/admin/psychologists/${applicant.psychologist_id}/${ENDPOINT[mode]}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || 'Something went wrong.';
    } catch {
      return 'Could not reach the server.';
    }
    setDecision(null);
    setDetailId(null);
    let key = mode;
    if (applicant.is_update && mode === 'approve') key = 'approve_update';
    if (applicant.is_update && mode === 'deny') key = revoke ? 'deny_revoke' : 'deny_update';
    setToast(SUCCESS_MESSAGE[key]);
    load();
    return null;
  };

  const closeDetail = useCallback(() => setDetailId(null), []);

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconClipboardCheck size={22} className="text-brand-primary" /> Verification
          </h1>
          <p className="text-brand-ink/60 text-sm">Review psychologist license applications.</p>
        </div>
        <AdminTopBar />
      </div>

      {toast && (
        <div role="status" className="fixed top-5 left-1/2 -translate-x-1/2 z-70 flex items-center gap-2 bg-brand-primary text-white text-sm font-medium pl-4 pr-2 py-2.5 rounded-full shadow-lg max-w-[calc(100vw-2rem)]">
          <IconCircleCheck size={17} className="shrink-0" />
          <span>{toast}</span>
          <button onClick={() => setToast('')} className="p-1 rounded-full hover:bg-white/15" aria-label="Dismiss">
            <IconX size={14} />
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="flex flex-col md:flex-row md:items-center gap-3 mt-6">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {VERIFICATION_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => { playClick(); setFilter(f.key); }}
                onMouseEnter={playHover}
                className={`interactive text-xs font-medium px-3.5 py-1.5 rounded-full border ${
                  active ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-surface border-brand-ink/15 text-brand-ink/70'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-brand-ink/40'}`}>{counts[f.key] || 0}</span>
              </button>
            );
          })}
        </div>
        <label className="relative md:ml-auto md:w-72">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or license"
            className="w-full text-sm bg-brand-surface border border-brand-ink/15 rounded-full pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            aria-label="Search applications"
          />
        </label>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-4 sm:p-6 mt-4">
        {!loaded ? (
          <p className="text-sm text-brand-ink/50">Loading applications...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-brand-ink/50">
            {search ? 'No applications match your search.'
              : filter === 'all' ? 'No psychologist applications yet.'
                : `No ${VERIFICATION_FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} applications.`}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((p) => {
              const meta = displayStatus(p.verification_status, p.is_verified);
              const st = p.verification_status;
              return (
                <div key={p.psychologist_id} className="border border-brand-ink/10 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {p.profile_photo_url ? (
                      <img src={p.profile_photo_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-brand-primary/15 text-brand-primary flex items-center justify-center text-sm font-semibold shrink-0">
                        {initialsOf(p.User?.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{p.User?.name}</p>
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${meta.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-brand-ink/50 truncate">{p.User?.email}</p>
                      <p className="text-xs text-brand-ink/60 mt-1">License: <span className="font-mono">{p.license_no}</span></p>
                      <p className="text-xs text-brand-ink/60">Credentials: {p.credentials}</p>
                      <p className="text-[11px] text-brand-ink/40 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1"><IconFileText size={12} /> {p.document_count} document{p.document_count === 1 ? '' : 's'}</span>
                        {p.User?.created_at && <span>Registered {formatDateTime(p.User.created_at)}</span>}
                        {p.verification_submitted_at && <span>Submitted {formatDateTime(p.verification_submitted_at)}</span>}
                        {(st === 'approved' || st === 'denied') && p.verification_decided_at && (
                          <span>Decided {formatDateTime(p.verification_decided_at)}</span>
                        )}
                      </p>
                      {st === 'denied' && p.verification_note && (
                        <p className="text-xs text-red-700 mt-1.5 line-clamp-2">Reason: {p.verification_note}</p>
                      )}
                      {st === 'info_requested' && p.verification_note && (
                        <p className="text-xs text-orange-700 mt-1.5 line-clamp-2">Requested: {p.verification_note}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
                    <button
                      onClick={() => { playClick(); setDetailId(p.psychologist_id); }}
                      onMouseEnter={playHover}
                      className="interactive inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-primary/40 text-brand-primary bg-brand-primary/5"
                    >
                      <IconEye size={14} /> View Details
                    </button>
                    {st === 'pending' && (
                      <>
                        <button
                          onClick={() => openDecision('approve', p)}
                          onMouseEnter={playHover}
                          className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                        >
                          {p.is_update ? 'Approve update' : 'Approve'}
                        </button>
                        <button
                          onClick={() => openDecision('request_info', p)}
                          onMouseEnter={playHover}
                          className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-orange-300 text-orange-700"
                        >
                          Request info
                        </button>
                      </>
                    )}
                    {(st === 'pending' || st === 'info_requested') && (
                      <button
                        onClick={() => openDecision('deny', p)}
                        onMouseEnter={playHover}
                        className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                      >
                        {p.is_update ? 'Deny update' : 'Deny'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detailId && (
        <ApplicationDetailModal
          key={detailId}
          psychologistId={detailId}
          onClose={closeDetail}
          onApprove={(app) => openDecision('approve', app)}
          onDeny={(app) => openDecision('deny', app)}
          onRequestInfo={(app) => openDecision('request_info', app)}
        />
      )}

      {decision && (
        <VerificationDecisionModal
          key={`${decision.mode}-${decision.applicant.psychologist_id}`}
          mode={decision.mode}
          applicant={decision.applicant}
          onCancel={() => setDecision(null)}
          onConfirm={confirmDecision}
        />
      )}
    </AdminLayout>
  );
}

export default AdminVerification;
