import { useEffect, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';

// Shared by the LGU Dashboard's quick action and the OpenUp Care Credits page.
// Always scoped server-side to the caller's own barangay (POST /lgu/me/care-credits/issue).
function IssueCreditsModal({ barangay, onClose, onIssued }) {
  const [residents, setResidents] = useState([]);
  const [target, setTarget] = useState('all');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/residents`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setResidents(data); })
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('saving');
    try {
      const res = await fetch(`${API_URL}/lgu/me/care-credits/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ amount, resident_id: target === 'all' ? undefined : target }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not issue credits.');
        setStatus('idle');
        return;
      }
      onIssued();
    } catch {
      setError('Could not reach the server.');
      setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">Issue Care Credits</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <p className="text-sm text-brand-ink/60 mb-4">Funds come out of {barangay.name}'s own budget.</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Fund</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Every resident in {barangay.name}</option>
              {residents.map((r) => (
                <option key={r.user_id} value={r.user_id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Amount per resident (₱)</label>
            <input
              type="number" min="1" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === 'saving'}
              className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
            >
              {status === 'saving' ? 'Issuing...' : 'Issue credits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default IssueCreditsModal;
