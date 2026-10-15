import { useEffect, useState } from 'react';
import { IconCreditCard } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminSubscriptions() {
  const [finance, setFinance] = useState([]);
  const [error, setError] = useState('');
  const [inputs, setInputs] = useState({});
  const [search, setSearch] = useState('');

  const load = () => {
    Promise.all([
      fetch(`${API_URL}/admin/subscriptions`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/budgets`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ]).then(([subRes, budRes]) => {
      if (!subRes.ok || !Array.isArray(subRes.data) || !budRes.ok || !Array.isArray(budRes.data)) {
        setError(subRes.data?.error || budRes.data?.error || 'Could not load barangay finance data.');
        return;
      }
      const budgetByBarangay = Object.fromEntries(budRes.data.map((b) => [b.barangay_id, b]));
      setFinance(subRes.data.map((s) => ({ ...s, ...budgetByBarangay[s.barangay_id] })));
    }).catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const setInput = (barangayId, field, value) => {
    setInputs((prev) => ({ ...prev, [barangayId]: { ...prev[barangayId], [field]: value } }));
  };

  const setSubscriptionStatus = async (barangayId, status) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/subscriptions/${barangayId}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      load();
    } catch {
      setError('Could not reach the server.');
    }
  };

  const fundBudget = async (barangayId) => {
    setError('');
    const amount = inputs[barangayId]?.fundAmount;
    if (!amount) return;
    try {
      const res = await fetch(`${API_URL}/admin/budgets/${barangayId}/fund`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setInput(barangayId, 'fundAmount', '');
      load();
    } catch {
      setError('Could not reach the server.');
    }
  };

  const issueCredits = async (barangayId) => {
    setError('');
    const amount = inputs[barangayId]?.creditAmount;
    if (!amount) return;
    try {
      const res = await fetch(`${API_URL}/care-credits/allocate`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ barangay_id: barangayId, amount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setInput(barangayId, 'creditAmount', '');
      load();
    } catch {
      setError('Could not reach the server.');
    }
  };

  const visible = finance.filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCreditCard size={22} className="text-brand-primary" /> Subscriptions
          </h1>
          <p className="text-brand-ink/60 text-sm">
            A subscription must be active before its budget can be funded, and funding must cover the amount before Care Credits can be issued.
          </p>
        </div>
        <AdminTopBar search={search} onSearchChange={setSearch} searchPlaceholder="Search barangay..." />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-brand-ink/50 mt-6">No barangays found.</p>
      ) : (
        <div className="space-y-3 mt-6">
          {visible.map((f) => (
            <div key={f.barangay_id} className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Barangay {f.name}</p>
                <select
                  value={f.status}
                  onChange={(e) => setSubscriptionStatus(f.barangay_id, e.target.value)}
                  className="text-xs border border-brand-ink/15 rounded-full px-3 py-1"
                >
                  <option value="inactive">Inactive</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <p className="text-xs text-brand-ink/60 mb-3">
                Funded ₱{Number(f.total_funded || 0).toLocaleString()} · Spent ₱{Number(f.total_spent || 0).toLocaleString()} ·
                Remaining ₱{Number(f.remaining || 0).toLocaleString()}
              </p>

              <div className="flex flex-wrap gap-2">
                <input
                  type="number" min="1" placeholder="Fund amount"
                  value={inputs[f.barangay_id]?.fundAmount || ''}
                  onChange={(e) => setInput(f.barangay_id, 'fundAmount', e.target.value)}
                  className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-32"
                />
                <button
                  onClick={() => { playClick(); fundBudget(f.barangay_id); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                >
                  Fund
                </button>

                <input
                  type="number" min="1" placeholder="Credit per resident"
                  value={inputs[f.barangay_id]?.creditAmount || ''}
                  onChange={(e) => setInput(f.barangay_id, 'creditAmount', e.target.value)}
                  className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-36"
                />
                <button
                  onClick={() => { playClick(); issueCredits(f.barangay_id); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                >
                  Issue to all residents
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminSubscriptions;
