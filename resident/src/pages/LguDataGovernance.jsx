import { useEffect, useState } from 'react';
import { IconLock, IconUserCheck, IconShieldCheck, IconFileText } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

function LguDataGovernance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/data-governance`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load data governance info.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconLock size={22} className="text-brand-primary" /> Data Governance & Consent
          </h1>
          <p className="text-brand-ink/60 text-sm">How your residents' data is protected, and who can see it.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-5">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconFileText size={16} className="text-brand-primary" /> Consent records
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              Recorded when a resident checks the consent box before taking a Mental Health
              Assessment -- the one real consent step in the app today. Residents who haven't
              taken an assessment yet simply have no record on file.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-brand-ink/50">Coverage</p>
                <p className="text-2xl font-semibold mt-0.5">
                  {data.consent.coverage_percent != null ? `${data.consent.coverage_percent}%` : 'No residents yet'}
                </p>
                <p className="text-[11px] text-brand-ink/40">{data.consent.residents_with_consent} of {data.consent.resident_count} residents</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Total consent records</p>
                <p className="text-2xl font-semibold mt-0.5">{data.consent.total_records}</p>
              </div>
            </div>
            {data.consent.recent.length > 0 && (
              <div className="pt-3 border-t border-brand-ink/10">
                <p className="text-xs text-brand-ink/50 mb-2">Most recent</p>
                <div className="space-y-1.5">
                  {data.consent.recent.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-brand-ink/70 capitalize">{c.consent_type} consent</span>
                      <span className="text-brand-ink/40">{new Date(c.granted_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-5">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconUserCheck size={16} className="text-brand-primary" /> Who has access
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              A real-time view of who can see your residents' data today -- not a permission editor,
              since access here is earned through an actual confirmed booking, not granted manually.
            </p>
            {data.data_access.psychologists.length === 0 ? (
              <p className="text-sm text-brand-ink/40">No psychologist has a confirmed session with a resident here yet.</p>
            ) : (
              <div className="space-y-2 mb-3">
                {data.data_access.psychologists.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-sm border border-brand-ink/10 rounded-xl px-4 py-2.5">
                    <span>{p.name}</span>
                    <span className="text-xs text-brand-ink/50">{p.resident_count} resident{p.resident_count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-brand-ink/40">
              Plus {data.data_access.admin_account_count} OpenUp admin account{data.data_access.admin_account_count === 1 ? '' : 's'}, which have platform-wide access by design.
            </p>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
              <IconShieldCheck size={16} className="text-brand-primary" /> Compliance status
            </h2>
            <p className="text-xs text-brand-ink/50 mb-4">
              Real, verifiable facts about how this platform is built -- not a score against a
              formal compliance framework this app has never been audited against.
            </p>
            <ul className="space-y-2">
              {data.compliance.facts.map((fact, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-brand-ink/70">
                  <IconShieldCheck size={15} className="text-green-600 shrink-0 mt-0.5" />
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </LguLayout>
  );
}

export default LguDataGovernance;
