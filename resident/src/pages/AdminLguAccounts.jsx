import { useEffect, useMemo, useState } from 'react';
import {
  IconBuildingBank, IconCircleCheck, IconClockExclamation, IconHourglass,
  IconPlus, IconX, IconEye, IconUserOff,
} from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

// Subscription.status (active / expired / cancelled / inactive) from the real
// Subscription row. "Renewal Due" = active and within 30 days of expiry, and
// "Pending Approval" = a renewal request waiting for an admin -- both come
// from /admin/subscriptions (see the subscription lifecycle on the server).
const STATUS_META = {
  active: { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' },
  expired: { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-600' },
  past_due: { label: 'Expired', bg: 'bg-gray-100', text: 'text-gray-600' },
  inactive: { label: 'No subscription', bg: 'bg-brand-ink/5', text: 'text-brand-ink/60' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100', text: 'text-red-700' },
};
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'renewal_due', label: 'Renewal Due' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'expired', label: 'Expired' },
  { key: 'deactivated', label: 'Deactivated' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Same checks the server enforces, so mistakes are caught before the
// confirmation prompt instead of after it.
function validateAccount({ name, email, password }, { passwordRequired }) {
  if (!name.trim()) return 'Contact name is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
  if (passwordRequired && !password) return 'Password is required.';
  if (password && password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return '';
}

function AdminLguAccounts() {
  const [lguAccounts, setLguAccounts] = useState([]);
  const [finance, setFinance] = useState([]);
  const [accReport, setAccReport] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [barangays, setBarangays] = useState([]);
  const [toast, setToast] = useState(null); // { tone: 'success' | 'error', text }

  const [onboardOpen, setOnboardOpen] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ name: '', email: '', password: '', confirm_password: '', barangay_id: '' });
  const [onboardError, setOnboardError] = useState('');
  const [onboardSaving, setOnboardSaving] = useState(false);

  const [viewTarget, setViewTarget] = useState(null);
  const [manageTarget, setManageTarget] = useState(null);
  const [manageForm, setManageForm] = useState({ name: '', email: '', password: '' });
  const [manageError, setManageError] = useState('');
  const [manageSaving, setManageSaving] = useState(false);

  const load = () => {
    Promise.all([
      fetch(`${API_URL}/admin/lgu-accounts`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/subscriptions`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/budgets`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/accomplishment-report`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/barangays`).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ]).then(([lguRes, subRes, budRes, accRes, brgyRes]) => {
      if (brgyRes.ok && Array.isArray(brgyRes.data)) setBarangays(brgyRes.data);
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

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

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
      subscription_status: sub?.status === 'past_due' ? 'expired' : (sub?.status || 'inactive'),
      renewal_due: Boolean(sub?.renewal_due),
      pending_approval: sub?.upcoming_status === 'pending',
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
    renewal_due: rows.filter((r) => r.renewal_due).length,
    pending_approval: rows.filter((r) => r.pending_approval).length,
    expired: rows.filter((r) => r.subscription_status === 'expired').length,
    deactivated: rows.filter((r) => r.account_status === 'suspended').length,
  }), [rows]);

  const visible = rows
    .filter((r) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'deactivated') return r.account_status === 'suspended';
      if (statusFilter === 'renewal_due') return r.renewal_due;
      if (statusFilter === 'pending_approval') return r.pending_approval;
      return r.subscription_status === statusFilter;
    })
    .filter((r) => !search || r.barangay_name.toLowerCase().includes(search.toLowerCase()));

  // Every barangay that doesn't have an LGU login yet (one account per barangay).
  const availableBarangays = barangays
    .filter((b) => !lguAccounts.some((l) => l.barangay_id === b.barangay_id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const closeOnboard = () => {
    setOnboardOpen(false);
    setOnboardError('');
    setOnboardForm({ name: '', email: '', password: '', confirm_password: '', barangay_id: '' });
  };

  const barangayName = (id) => barangays.find((b) => String(b.barangay_id) === String(id))?.name || 'this barangay';

  const createAccount = async () => {
    setOnboardSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/lgu-accounts`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: onboardForm.name.trim(),
          email: onboardForm.email.trim(),
          password: onboardForm.password,
          barangay_id: Number(onboardForm.barangay_id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setOnboardError(data.error || 'Could not onboard this barangay.'); return; }
      const name = barangayName(onboardForm.barangay_id);
      closeOnboard();
      setToast({ tone: 'success', text: `LGU account created for ${name}.` });
      load();
    } catch {
      setOnboardError('Could not reach the server.');
    } finally {
      setOnboardSaving(false);
    }
  };

  const submitOnboard = (e) => {
    e.preventDefault();
    const err = !onboardForm.barangay_id ? 'Select a barangay.' : validateAccount(onboardForm, { passwordRequired: true });
    if (err) { setOnboardError(err); return; }
    if (onboardForm.password !== onboardForm.confirm_password) { setOnboardError('Passwords do not match.'); return; }
    setOnboardError('');
    setConfirmDialog({
      title: 'Create this LGU account?',
      message: `A login for ${barangayName(onboardForm.barangay_id)} will be created for ${onboardForm.name.trim()} (${onboardForm.email.trim()}). They can sign in to the barangay dashboard right away.`,
      confirmLabel: 'Yes, create account',
      destructive: false,
      onConfirm: createAccount,
    });
  };

  const openManage = (row) => {
    setManageTarget(row);
    setManageForm({ name: row.contact_name, email: row.email, password: '' });
    setManageError('');
  };

  const manageChanges = manageTarget ? [
    manageForm.name.trim() !== manageTarget.contact_name && `contact name to "${manageForm.name.trim()}"`,
    manageForm.email.trim().toLowerCase() !== String(manageTarget.email).toLowerCase() && `login email to ${manageForm.email.trim()}`,
    manageForm.password && 'the password',
  ].filter(Boolean) : [];

  const updateAccount = async () => {
    setManageSaving(true);
    try {
      const body = {};
      if (manageForm.name.trim() !== manageTarget.contact_name) body.name = manageForm.name.trim();
      if (manageForm.email.trim().toLowerCase() !== String(manageTarget.email).toLowerCase()) body.email = manageForm.email.trim();
      if (manageForm.password) body.password = manageForm.password;
      const res = await fetch(`${API_URL}/admin/lgu-accounts/${manageTarget.user_id}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setManageError(data.error || 'Could not save changes.'); return; }
      setToast({ tone: 'success', text: `${manageTarget.barangay_name} account updated.` });
      setManageTarget(null);
      load();
    } catch {
      setManageError('Could not reach the server.');
    } finally {
      setManageSaving(false);
    }
  };

  const saveManage = (e) => {
    e.preventDefault();
    const err = validateAccount(manageForm, { passwordRequired: false });
    if (err) { setManageError(err); return; }
    if (manageChanges.length === 0) { setManageError('No changes to save.'); return; }
    setManageError('');
    setConfirmDialog({
      title: 'Save changes to this LGU account?',
      message: `This will change the ${manageChanges.join(', ')} for ${manageTarget.barangay_name}.${
        manageForm.password ? ' The barangay office will need the new password to sign in.' : ''}`,
      confirmLabel: 'Yes, save changes',
      destructive: false,
      onConfirm: updateAccount,
    });
  };

  const setAccountStatus = async (row, status) => {
    try {
      const res = await fetch(`${API_URL}/admin/lgu-accounts/${row.user_id}/status`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ tone: 'error', text: data.error || 'Could not update this account.' }); return; }
      setToast({
        tone: 'success',
        text: status === 'deactivated' ? `${row.barangay_name} account deactivated.` : `${row.barangay_name} account reactivated.`,
      });
      setManageTarget(null);
      load();
    } catch {
      setToast({ tone: 'error', text: 'Could not reach the server.' });
    }
  };

  const confirmToggleStatus = (row) => {
    const deactivating = row.account_status !== 'suspended';
    playClick();
    setConfirmDialog({
      title: deactivating ? 'Deactivate this LGU account?' : 'Reactivate this LGU account?',
      message: deactivating
        ? `${row.contact_name} will be signed out and can no longer log in to the ${row.barangay_name} dashboard. Its residents, Care Credits and subscription are kept, and you can reactivate it at any time.`
        : `${row.contact_name} will be able to log in to the ${row.barangay_name} dashboard again.`,
      confirmLabel: deactivating ? 'Yes, deactivate' : 'Yes, reactivate',
      destructive: deactivating,
      onConfirm: () => setAccountStatus(row, deactivating ? 'deactivated' : 'active'),
    });
  };

  const deleteAccount = async (row) => {
    try {
      const res = await fetch(`${API_URL}/admin/users/${row.user_id}`, { method: 'DELETE', headers: authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setToast({ tone: 'error', text: data.error || 'Could not delete this account.' }); return; }
      setToast({ tone: 'success', text: `${row.barangay_name} LGU login deleted.` });
      setManageTarget(null);
      load();
    } catch {
      setToast({ tone: 'error', text: 'Could not reach the server.' });
    }
  };

  const confirmDelete = (row) => {
    setConfirmDialog({
      title: 'Permanently delete this LGU account?',
      message: `This permanently deletes ${row.contact_name}'s login for ${row.barangay_name}. This cannot be undone. To only block access, use Deactivate instead.`,
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

      {toast && (
        <div
          role="status"
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-70 flex items-center gap-2 text-white text-sm font-medium pl-4 pr-2 py-2.5 rounded-full shadow-lg max-w-[calc(100vw-2rem)] ${
            toast.tone === 'error' ? 'bg-red-600' : 'bg-brand-primary'
          }`}
        >
          {toast.tone === 'error' ? <IconX size={16} className="shrink-0" /> : <IconCircleCheck size={16} className="shrink-0" />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="p-1 rounded-full hover:bg-white/15" aria-label="Dismiss"><IconX size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-6">
        <StatCard icon={<IconBuildingBank size={18} />} iconBg="bg-sky-100 text-sky-700" value={counts.total} label="Total LGU accounts" />
        <StatCard icon={<IconCircleCheck size={18} />} iconBg="bg-green-100 text-green-700" value={counts.active} label="Active" />
        <StatCard icon={<IconClockExclamation size={18} />} iconBg="bg-amber-100 text-amber-700" value={counts.renewal_due} label="Renewal due" />
        <StatCard icon={<IconHourglass size={18} />} iconBg="bg-sky-100 text-sky-700" value={counts.pending_approval} label="Pending approval" />
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
            {f.key === 'deactivated' && counts.deactivated > 0 && <span className="ml-1.5 opacity-70">{counts.deactivated}</span>}
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
                  <th className="px-5 py-3 font-medium">Subscription</th>
                  <th className="px-5 py-3 font-medium">Login</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const meta = STATUS_META[r.subscription_status] || STATUS_META.inactive;
                  return (
                    <tr key={r.user_id} className={`border-t border-brand-ink/10 ${r.account_status === 'suspended' ? 'bg-red-50/40' : ''}`}>
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
                      </td>
                      <td className="px-5 py-3">
                        {r.account_status === 'suspended' ? (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 whitespace-nowrap">Deactivated</span>
                        ) : (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">Active</span>
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
                          <button
                            onClick={() => confirmToggleStatus(r)}
                            onMouseEnter={playHover}
                            className={`interactive flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border ${
                              r.account_status === 'suspended' ? 'border-brand-primary/40 text-brand-primary' : 'border-red-300 text-red-600'
                            }`}
                          >
                            {r.account_status === 'suspended'
                              ? <><IconCircleCheck size={13} /> Reactivate</>
                              : <><IconUserOff size={13} /> Deactivate</>}
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => !onboardSaving && closeOnboard()}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">Onboard Barangay</p>
              <button onClick={() => !onboardSaving && closeOnboard()} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
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
                  {availableBarangays.map((b) => (
                    <option key={b.barangay_id} value={b.barangay_id}>{b.name}{b.city ? ` (${b.city})` : ''}</option>
                  ))}
                </select>
                {availableBarangays.length === 0 && (
                  <p className="text-[11px] text-brand-ink/50 mt-1">Every barangay already has an LGU account.</p>
                )}
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
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Password (min. {MIN_PASSWORD} characters)</label>
                <input
                  type="password" required autoComplete="new-password" value={onboardForm.password}
                  onChange={(e) => setOnboardForm({ ...onboardForm, password: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Confirm password</label>
                <input
                  type="password" required autoComplete="new-password" value={onboardForm.confirm_password}
                  onChange={(e) => setOnboardForm({ ...onboardForm, confirm_password: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeOnboard} disabled={onboardSaving} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">
                  Cancel
                </button>
                <button type="submit" disabled={onboardSaving} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {onboardSaving ? 'Creating...' : 'Create account'}
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
              <Row label="Login" value={viewTarget.account_status === 'suspended' ? 'Deactivated' : 'Active'} />
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
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">New password (optional)</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={manageForm.password}
                  onChange={(e) => setManageForm({ ...manageForm, password: e.target.value })}
                  placeholder="Leave blank to keep the current password"
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
                className={`interactive flex-1 text-sm font-medium py-2.5 rounded-full border ${
                  manageTarget.account_status === 'suspended' ? 'border-brand-primary/40 text-brand-primary' : 'border-amber-300 text-amber-700'
                }`}
              >
                {manageTarget.account_status === 'suspended' ? 'Reactivate account' : 'Deactivate account'}
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
