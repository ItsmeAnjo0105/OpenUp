import { useEffect, useMemo, useState } from 'react';
import {
  IconBuildingBank, IconCircleCheck, IconClockExclamation, IconHourglass,
  IconPlus, IconX, IconEye,
} from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

// Subscription.status is the real enum in the schema (active/inactive/
// past_due/cancelled). The mockup's "Renewal Due" / "Pending Approval"
// language is a relabeling of past_due/inactive -- real states, not
// invented ones. There's no plan-duration field anywhere in the schema, so
// "Next Renewal" is deliberately NOT shown as a projected date (that would
// require assuming a billing cycle this app doesn't track) -- it's "Last
// Renewed" instead, which is a real timestamp.
const STATUS_META = {
  active: { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' },
  past_due: { label: 'Renewal Due', bg: 'bg-amber-100', text: 'text-amber-700' },
  inactive: { label: 'Pending Approval', bg: 'bg-sky-100', text: 'text-sky-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100', text: 'text-red-700' },
};
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'past_due', label: 'Renewal Due' },
  { key: 'inactive', label: 'Pending Approval' },
];

function AdminLguAccounts() {
  const [lguAccounts, setLguAccounts] = useState([]);
  const [finance, setFinance] = useState([]);
  const [accReport, setAccReport] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ name: '', email: '', password: '', barangay_id: '' });
  const [onboardError, setOnboardError] = useState('');
  const [onboardSaving, setOnboardSaving] = useState(false);

  const [viewTarget, setViewTarget] = useState(null);
  const [manageTarget, setManageTarget] = useState(null);
  const [manageForm, setManageForm] = useState({ name: '', email: '' });
  const [manageError, setManageError] = useState('');
  const [manageSaving, setManageSaving] = useState(false);

  const load = () => {
    Promise.all([
      fetch(`${API_URL}/admin/lgu-accounts`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/subscriptions`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/budgets`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/accomplishment-report`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ]).then(([lguRes, subRes, budRes, accRes]) => {
      if (lguRes.ok && Array.isArray(lguRes.data)) setLguAccounts(lguRes.data);
      else setError(lguRes.data?.error || 'Could not load LGU accounts.');

      if (subRes.ok && Array.isArray(subRes.data) && budRes.ok && Array.isArray(budRes.data)) {
        const budgetByBarangay = Object.fromEntries(budRes.data.map((b) => [b.barangay_id, b]));
        setFinance(subRes.data.map((s) => ({ ...s, ...budgetByBarangay[s.barangay_id] })));
      }
      if (accRes.ok && Array.isArray(accRes.data)) setAccReport(accRes.data);
    }).catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  // One row per barangay that HAS an LGU account -- the stat cards and table
  // are explicitly "LGU accounts", not "every barangay".
  const rows = useMemo(() => lguAccounts.map((l) => {
    const sub = finance.find((f) => f.barangay_id === l.barangay_id);
    const acc = accReport.find((r) => r.barangay_id === l.barangay_id);
    return {
      user_id: l.user_id,
      barangay_id: l.barangay_id,
      barangay_name: l.Barangay?.name || `Barangay #${l.barangay_id}`,
      city: l.Barangay?.city,
      contact_name: l.name,
      email: l.email,
      account_status: l.status, // 'active' | 'suspended' -- the login itself
      plan: sub?.plan || null,
      subscription_status: sub?.status || 'inactive',
      renewed_at: sub?.renewed_at || null,
      resident_count: acc?.resident_count ?? 0,
      budget_funded: sub?.total_funded ?? 0,
      budget_spent: sub?.total_spent ?? 0,
      budget_remaining: sub?.remaining ?? 0,
    };
  }), [lguAccounts, finance, accReport]);

  const counts = useMemo(() => ({
    total: rows.length,
    active: rows.filter((r) => r.subscription_status === 'active').length,
    past_due: rows.filter((r) => r.subscription_status === 'past_due').length,
    inactive: rows.filter((r) => r.subscription_status === 'inactive').length,
  }), [rows]);

  const visible = rows
    .filter((r) => statusFilter === 'all' || r.subscription_status === statusFilter)
    .filter((r) => !search || r.barangay_name.toLowerCase().includes(search.toLowerCase()));

  const availableBarangays = finance.filter((f) => !lguAccounts.some((l) => l.barangay_id === f.barangay_id));

  const submitOnboard = async (e) => {
    e.preventDefault();
    setOnboardError('');
    setOnboardSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/lgu-accounts`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(onboardForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setOnboardError(data.error || 'Could not onboard this barangay.');
        setOnboardSaving(false);
        return;
      }
      setOnboardForm({ name: '', email: '', password: '', barangay_id: '' });
      setOnboardOpen(false);
      setOnboardSaving(false);
      load();
    } catch {
      setOnboardError('Could not reach the server.');
      setOnboardSaving(false);
    }
  };

  const openManage = (row) => {
    setManageTarget(row);
    setManageForm({ name: row.contact_name, email: row.email });
    setManageError('');
  };

  const saveManage = async (e) => {
    e.preventDefault();
    setManageError('');
    setManageSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/lgu-accounts/${manageTarget.user_id}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(manageForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setManageError(data.error || 'Could not save changes.');
        setManageSaving(false);
        return;
      }
      setManageSaving(false);
      setManageTarget(null);
      load();
    } catch {
      setManageError('Could not reach the server.');
      setManageSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    const nextStatus = row.account_status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await fetch(`${API_URL}/admin/users/${row.user_id}/status`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) { setManageTarget(null); load(); }
    } catch {
      // leave as-is
    }
  };

  const confirmToggleStatus = (row) => {
    const nextStatus = row.account_status === 'suspended' ? 'active' : 'suspended';
    setConfirmDialog({
      title: `Are you sure you want to ${nextStatus === 'suspended' ? 'suspend' : 'reactivate'} this LGU account?`,
      message: nextStatus === 'suspended'
        ? `${row.contact_name} will no longer be able to log in.`
        : `${row.contact_name} will be able to log in again.`,
      confirmLabel: nextStatus === 'suspended' ? 'Suspend' : 'Reactivate',
      destructive: nextStatus === 'suspended',
      onConfirm: () => toggleStatus(row),
    });
  };

  const deleteAccount = async (row) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${row.user_id}`, { method: 'DELETE', headers: authHeader() });
      if (res.ok) { setManageTarget(null); load(); }
    } catch {
      // leave as-is
    }
  };

  const confirmDelete = (row) => {
    setConfirmDialog({
      title: 'Are you sure you want to delete this LGU account?',
      message: `This permanently deletes ${row.contact_name}'s login for ${row.barangay_name}. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      onConfirm: () => deleteAccount(row),
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconBuildingBank size={22} className="text-brand-primary" /> Manage LGU Accounts
          </h1>
          <p className="text-brand-ink/60 text-sm">Onboard, approve, and oversee every barangay account on the platform.</p>
        </div>
        <div className="flex items-center gap-3">
          <AdminTopBar search={search} onSearchChange={setSearch} searchPlaceholder="Search barangay..." />
          <button
            onClick={() => { playClick(); setOnboardOpen(true); }}
            onMouseEnter={playHover}
            className="interactive flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            <IconPlus size={16} /> Onboard Barangay
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-6">
        <StatCard icon={<IconBuildingBank size={18} />} iconBg="bg-sky-100 text-sky-700" value={counts.total} label="Total LGU accounts" />
        <StatCard icon={<IconCircleCheck size={18} />} iconBg="bg-green-100 text-green-700" value={counts.active} label="Active" />
        <StatCard icon={<IconClockExclamation size={18} />} iconBg="bg-amber-100 text-amber-700" value={counts.past_due} label="Renewal due" />
        <StatCard icon={<IconHourglass size={18} />} iconBg="bg-sky-100 text-sky-700" value={counts.inactive} label="Pending approval" />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { playClick(); setStatusFilter(f.key); }}
            onMouseEnter={playHover}
            className={`interactive text-xs font-medium px-3.5 py-2 rounded-full ${
              statusFilter === f.key ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-1">
          <h2 className="font-display text-base font-semibold">Barangay / LGU Accounts</h2>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-brand-ink/50 p-5">No LGU accounts match this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-ink/50 uppercase bg-brand-bg/60">
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Residents</th>
                  <th className="px-5 py-3 font-medium">Last renewed</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const meta = STATUS_META[r.subscription_status] || STATUS_META.inactive;
                  return (
                    <tr key={r.user_id} className="border-t border-brand-ink/10">
                      <td className="px-5 py-3">
                        <p className="font-medium">Barangay {r.barangay_name}</p>
                        <p className="text-xs text-brand-ink/50">{r.contact_name}</p>
                      </td>
                      <td className="px-5 py-3 text-brand-ink/60 capitalize">{r.plan || '—'}</td>
                      <td className="px-5 py-3 text-brand-ink/60">{r.resident_count}</td>
                      <td className="px-5 py-3 text-brand-ink/60 whitespace-nowrap">
                        {r.renewed_at ? new Date(r.renewed_at).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${meta.bg} ${meta.text}`}>{meta.label}</span>
                        {r.account_status === 'suspended' && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 ml-1.5">Login suspended</span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { playClick(); setViewTarget(r); }}
                            onMouseEnter={playHover}
                            className="interactive flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                          >
                            <IconEye size={13} /> View
                          </button>
                          <button
                            onClick={() => { playClick(); openManage(r); }}
                            onMouseEnter={playHover}
                            className="interactive text-xs font-medium px-3 py-1.5 rounded-full text-white"
                            style={{ backgroundColor: '#2b4d3f' }}
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-brand-primary/10 text-brand-ink/70 rounded-2xl p-4 mt-5 text-xs">
        Approving a new LGU account provisions a barangay-scoped dashboard, Care Credits allocation,
        and resident risk registry -- isolated from other barangays' data.
      </div>

      {onboardOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setOnboardOpen(false)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">Onboard Barangay</p>
              <button onClick={() => setOnboardOpen(false)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>
            <p className="text-sm text-brand-ink/60 mb-4">Creates one login for that barangay's office.</p>

            {onboardError && <p className="text-sm text-red-600 mb-3">{onboardError}</p>}

            <form onSubmit={submitOnboard} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Barangay</label>
                <select
                  required
                  value={onboardForm.barangay_id}
                  onChange={(e) => setOnboardForm({ ...onboardForm, barangay_id: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="" disabled>Select a barangay...</option>
                  {availableBarangays.map((f) => (
                    <option key={f.barangay_id} value={f.barangay_id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Contact name</label>
                <input
                  required value={onboardForm.name}
                  onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Email</label>
                <input
                  type="email" required value={onboardForm.email}
                  onChange={(e) => setOnboardForm({ ...onboardForm, email: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Password</label>
                <input
                  type="password" required value={onboardForm.password}
                  onChange={(e) => setOnboardForm({ ...onboardForm, password: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOnboardOpen(false)} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">
                  Cancel
                </button>
                <button type="submit" disabled={onboardSaving} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {onboardSaving ? 'Onboarding...' : 'Onboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setViewTarget(null)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">Barangay {viewTarget.barangay_name}</p>
              <button onClick={() => setViewTarget(null)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Row label="Contact" value={`${viewTarget.contact_name} · ${viewTarget.email}`} />
              <Row label="Plan" value={viewTarget.plan || '—'} capitalize />
              <Row label="Subscription status" value={(STATUS_META[viewTarget.subscription_status] || STATUS_META.inactive).label} />
              <Row label="Residents" value={viewTarget.resident_count} />
              <Row label="Last renewed" value={viewTarget.renewed_at ? new Date(viewTarget.renewed_at).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—'} />
              <Row label="Budget funded" value={`₱${Number(viewTarget.budget_funded).toLocaleString()}`} />
              <Row label="Budget spent" value={`₱${Number(viewTarget.budget_spent).toLocaleString()}`} />
              <Row label="Budget remaining" value={`₱${Number(viewTarget.budget_remaining).toLocaleString()}`} />
            </div>
          </div>
        </div>
      )}

      {manageTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setManageTarget(null)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">Manage {manageTarget.barangay_name}</p>
              <button onClick={() => setManageTarget(null)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>

            {manageError && <p className="text-sm text-red-600 mb-3">{manageError}</p>}

            <form onSubmit={saveManage} className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Contact name</label>
                <input
                  value={manageForm.name}
                  onChange={(e) => setManageForm({ ...manageForm, name: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Email</label>
                <input
                  type="email"
                  value={manageForm.email}
                  onChange={(e) => setManageForm({ ...manageForm, email: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button type="submit" disabled={manageSaving} className="interactive w-full text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60">
                {manageSaving ? 'Saving...' : 'Save changes'}
              </button>
            </form>

            <div className="flex gap-2 pt-3 border-t border-brand-ink/10">
              <button
                onClick={() => confirmToggleStatus(manageTarget)}
                className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20"
              >
                {manageTarget.account_status === 'suspended' ? 'Reactivate login' : 'Suspend login'}
              </button>
              <button
                onClick={() => confirmDelete(manageTarget)}
                className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-red-300 text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

function StatCard({ icon, iconBg, value, label }) {
  return (
    <div className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg}`}>{icon}</span>
      <p className="text-xs text-brand-ink/50 mt-3">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function Row({ label, value, capitalize }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-brand-ink/50">{label}</span>
      <span className={`font-medium ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

export default AdminLguAccounts;
