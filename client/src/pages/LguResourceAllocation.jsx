import { useEffect, useMemo, useState } from 'react';
import { IconTarget } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

// Same Care_Credit ledger as the OpenUp Care Credits page, grouped per
// resident instead of listed transaction-by-transaction -- "how has this
// barangay's budget actually been allocated."
function LguResourceAllocation() {
  const [credits, setCredits] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/care-credits`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setCredits(body) : setError(body?.error || 'Could not load allocation data.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const byResident = useMemo(() => {
    const map = new Map();
    for (const c of credits) {
      if (!map.has(c.resident_id)) {
        map.set(c.resident_id, { resident_id: c.resident_id, resident_name: c.resident_name, allocated: 0, used: 0, count: 0 });
      }
      const entry = map.get(c.resident_id);
      entry.allocated += c.amount;
      entry.count += 1;
      if (c.status === 'used') entry.used += c.amount;
    }
    return [...map.values()].sort((a, b) => b.allocated - a.allocated);
  }, [credits]);

  const totalAllocated = byResident.reduce((sum, r) => sum + r.allocated, 0);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconTarget size={22} className="text-brand-primary" /> Resource Allocation
          </h1>
          <p className="text-brand-ink/60 text-sm">How Care Credits have been allocated across your residents.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-5 mt-6 mb-5">
        <p className="text-xs text-brand-ink/50">Total allocated</p>
        <p className="text-2xl font-semibold mt-1">₱{totalAllocated.toLocaleString()}</p>
      </div>

      {byResident.length === 0 ? (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <p className="text-sm text-brand-ink/50">No credits allocated yet.</p>
        </div>
      ) : (
        <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-brand-ink/50 uppercase bg-brand-bg/60">
                <th className="px-5 py-3 font-medium">Resident</th>
                <th className="px-5 py-3 font-medium">Credits issued</th>
                <th className="px-5 py-3 font-medium">Allocated</th>
                <th className="px-5 py-3 font-medium">Used</th>
              </tr>
            </thead>
            <tbody>
              {byResident.map((r) => (
                <tr key={r.resident_id} className="border-t border-brand-ink/10">
                  <td className="px-5 py-3 font-medium">{r.resident_name}</td>
                  <td className="px-5 py-3 text-brand-ink/60">{r.count}</td>
                  <td className="px-5 py-3 text-brand-ink/60">₱{r.allocated.toLocaleString()}</td>
                  <td className="px-5 py-3 text-brand-ink/60">₱{r.used.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LguLayout>
  );
}

export default LguResourceAllocation;
