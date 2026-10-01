import { useEffect, useState } from 'react';
import { IconCreditCard, IconPlus } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import IssueCreditsModal from '../components/IssueCreditsModal';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const STATUS_STYLE = {
  available: 'bg-green-100 text-green-700',
  reserved: 'bg-amber-100 text-amber-700',
  used: 'bg-brand-ink/5 text-brand-ink/50',
};

function LguCareCredits() {
  const [dash, setDash] = useState(null);
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState('');
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const load = () => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setDash(body) : setError(body?.error || 'Could not load.')))
      .catch(() => setError('Could not reach the server.'));
    fetch(`${API_URL}/lgu/me/care-credits`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => { if (ok && Array.isArray(body)) setCredits(body); })
      .catch(() => {});
  };

  useEffect(load, []);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCreditCard size={22} className="text-brand-primary" /> OpenUp Care Credits
          </h1>
          <p className="text-brand-ink/60 text-sm">Fund resident sessions from your barangay's budget.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {dash && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 mb-5">
            <Stat label="Budget remaining" value={`₱${dash.budget_remaining.toLocaleString()}`} />
            <Stat label="Issued (all-time)" value={`₱${dash.care_credits_issued.toLocaleString()}`} />
            <Stat label="Used (all-time)" value={`₱${dash.care_credits_used.toLocaleString()}`} />
            <Stat label="Used this month" value={`₱${dash.care_credits_used_this_month.toLocaleString()}`} />
          </div>

          <div className="flex justify-end mb-4">
            <button
              onClick={() => { playClick(); setIssueModalOpen(true); }}
              onMouseEnter={playHover}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              <IconPlus size={14} /> Issue Care Credits
            </button>
          </div>

          {credits.length === 0 ? (
            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <p className="text-sm text-brand-ink/50">No credits issued yet.</p>
            </div>
          ) : (
            <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-brand-ink/50 uppercase bg-brand-bg/60">
                    <th className="px-5 py-3 font-medium">Resident</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Issued</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c) => (
                    <tr key={c.credit_id} className="border-t border-brand-ink/10">
                      <td className="px-5 py-3 font-medium">{c.resident_name}</td>
                      <td className="px-5 py-3 text-brand-ink/60">₱{c.amount.toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[c.status] || 'bg-brand-ink/5 text-brand-ink/50'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-brand-ink/60 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {issueModalOpen && (
            <IssueCreditsModal
              barangay={dash.barangay}
              onClose={() => setIssueModalOpen(false)}
              onIssued={() => { setIssueModalOpen(false); load(); }}
            />
          )}
        </>
      )}
    </LguLayout>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
      <p className="text-xs text-brand-ink/50">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

export default LguCareCredits;
