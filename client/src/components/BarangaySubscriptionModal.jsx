import { useEffect, useState } from 'react';
import { IconX, IconRefresh, IconHistory } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';
import { HISTORY_LABEL } from '../utils/subscriptionStatus';

const STATUS_STYLE = {
  active: 'bg-emerald-100 text-emerald-700',
  past_due: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
  inactive: 'bg-brand-ink/5 text-brand-ink/50',
};
const STATUS_LABEL = { active: 'Active', past_due: 'Expired', expired: 'Expired', cancelled: 'Cancelled', inactive: 'Inactive' };


const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

// Admin's detail view for one barangay's subscription: plan + validity, funding
// (fund budget / issue credits -- same actions the old flat page had inline),
// and the subscribe/renew/status-change history. Also doubles as the "Assign Plan"
// flow for a barangay with no plan yet, via the plan picker below.
function BarangaySubscriptionModal({ barangay, plans, onClose, onChanged }) {
  const [history, setHistory] = useState([]);
  const [showPicker, setShowPicker] = useState(!barangay.plan_id);
  const [fundAmount, setFundAmount] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadHistory = () => {
    fetch(`${API_URL}/admin/subscriptions/${barangay.barangay_id}/history`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => {});
  };

  useEffect(loadHistory, [barangay.barangay_id]);

  const act = async (url, body, successMsg) => {
    setError('');
    setBusy(successMsg);
    try {
      const res = await fetch(`${API_URL}${url}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      onChanged();
      loadHistory();
      setShowPicker(false);
      return data;
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy('');
    }
  };

  const assignPlan = (planId) => act(`/admin/subscriptions/${barangay.barangay_id}/assign`, { plan_id: planId }, 'assigning');
  const renew = () => act(`/admin/subscriptions/${barangay.barangay_id}/renew`, {}, 'renewing');
  const setStatus = (status) => act(`/admin/subscriptions/${barangay.barangay_id}`, { status }, status);

  const fundBudget = async () => {
    if (!fundAmount) return;
    setError(''); setBusy('funding');
    try {
      const res = await fetch(`${API_URL}/admin/budgets/${barangay.barangay_id}/fund`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: fundAmount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setFundAmount('');
      onChanged();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy('');
    }
  };

  const issueCredits = async () => {
    if (!creditAmount) return;
    setError(''); setBusy('issuing');
    try {
      const res = await fetch(`${API_URL}/care-credits/allocate`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ barangay_id: barangay.barangay_id, amount: creditAmount }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setCreditAmount('');
      onChanged();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy('');
    }
  };

  const remaining = Number(barangay.total_funded || 0) - Number(barangay.total_spent || 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8" onClick={onClose}>
      <div
        className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">Barangay {barangay.name}</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <p className="text-xs text-brand-ink/50 mb-4">{barangay.city}</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 mb-3">
          Manual override tools. Normal renewals go through Subscription Renewal Requests (approval, payment
          verification, scheduled activation). These overrides change the plan immediately and do not add plan Care Credits.
        </p>

        {!showPicker && barangay.plan_id ? (
          <div className="border border-brand-ink/10 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">{barangay.plan_name}</p>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_STYLE[barangay.status] || STATUS_STYLE.inactive}`}>
                {barangay.renewal_due ? 'Expiring soon' : (STATUS_LABEL[barangay.status] || barangay.status)}
              </span>
            </div>
            <p className="text-xs text-brand-ink/60">
              ₱{Number(barangay.price || 0).toLocaleString()} · {Number(barangay.care_credits || 0).toLocaleString()} Care Credits ·
              {' '}{barangay.validity_months}mo validity
            </p>
            <p className="text-xs text-brand-ink/50 mt-1">
              Started {fmtDate(barangay.started_at)} · Expires {fmtDate(barangay.expires_at)}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => { playClick(); renew(); }}
                onMouseEnter={playHover}
                disabled={Boolean(busy)}
                className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60 flex items-center gap-1"
              >
                <IconRefresh size={13} /> {busy === 'renewing' ? 'Renewing...' : 'Renew'}
              </button>
              <button
                onClick={() => { playClick(); setShowPicker(true); }}
                onMouseEnter={playHover}
                className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
              >
                Change plan
              </button>
              {barangay.status !== 'inactive' && (
                <button
                  onClick={() => { playClick(); setStatus('inactive'); }}
                  onMouseEnter={playHover}
                  disabled={Boolean(busy)}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 disabled:opacity-60"
                >
                  Deactivate
                </button>
              )}
              {barangay.status !== 'cancelled' && (
                <button
                  onClick={() => { playClick(); setStatus('cancelled'); }}
                  onMouseEnter={playHover}
                  disabled={Boolean(busy)}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600 disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-xs font-medium text-brand-ink/60 mb-2">
              {barangay.plan_id ? 'Choose a new plan' : 'No plan assigned yet -- pick one to activate this barangay'}
            </p>
            <div className="space-y-2">
              {plans.filter((p) => p.is_active).map((p) => (
                <button
                  key={p.plan_id}
                  onClick={() => { playClick(); assignPlan(p.plan_id); }}
                  onMouseEnter={playHover}
                  disabled={Boolean(busy)}
                  className="interactive w-full text-left border border-brand-ink/15 rounded-xl p-3 hover:border-brand-primary disabled:opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-sm font-semibold text-brand-primary">₱{Number(p.price).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-brand-ink/50 mt-0.5">
                    {Number(p.care_credits).toLocaleString()} Care Credits · {p.validity_months}mo
                  </p>
                </button>
              ))}
            </div>
            {barangay.plan_id && (
              <button
                onClick={() => setShowPicker(false)}
                className="text-xs text-brand-ink/40 hover:text-brand-ink/60 mt-2"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        <div className="border border-brand-ink/10 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-brand-ink/60 mb-2">Budget</p>
          <p className="text-xs text-brand-ink/60 mb-3">
            Funded ₱{Number(barangay.total_funded || 0).toLocaleString()} · Spent ₱{Number(barangay.total_spent || 0).toLocaleString()} ·
            Remaining ₱{remaining.toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number" min="1" placeholder="Fund amount"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-32"
            />
            <button
              onClick={() => { playClick(); fundBudget(); }}
              onMouseEnter={playHover}
              disabled={Boolean(busy)}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 disabled:opacity-60"
            >
              {busy === 'funding' ? 'Funding...' : 'Fund'}
            </button>
            <input
              type="number" min="1" placeholder="Credit per resident"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-36"
            />
            <button
              onClick={() => { playClick(); issueCredits(); }}
              onMouseEnter={playHover}
              disabled={Boolean(busy)}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
            >
              {busy === 'issuing' ? 'Issuing...' : 'Issue to all residents'}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-brand-ink/60 mb-2 flex items-center gap-1"><IconHistory size={14} /> History</p>
          {history.length === 0 ? (
            <p className="text-xs text-brand-ink/40">No subscription activity yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {history.map((h) => (
                <div key={h.history_id} className="flex items-center justify-between text-xs">
                  <span className="text-brand-ink/70">
                    {HISTORY_LABEL[h.action] || h.action}{h.plan_name ? ` -- ${h.plan_name}` : ''}
                  </span>
                  <span className="text-brand-ink/40">{fmtDate(h.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BarangaySubscriptionModal;
