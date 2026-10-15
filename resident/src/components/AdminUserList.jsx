import { useEffect, useState } from 'react';
import AdminTopBar from './AdminTopBar';
import ConfirmDialog from './ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

// Shared by AdminResidents.jsx and AdminPsychologists.jsx -- same "Manage
// users" list from the original single-page Admin Dashboard, pre-filtered
// to one role per page instead of a dropdown picking between both.
function AdminUserList({ title, subtitle, icon, fixedRole }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/admin/users?role=${fixedRole}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setUsers(data);
        else setError(data?.error || 'Could not load users.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, [fixedRole]);

  const toggleStatus = async (targetUser) => {
    setError('');
    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await fetch(`${API_URL}/admin/users/${targetUser.user_id}/status`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setUsers((prev) => prev.map((u) => (u.user_id === targetUser.user_id ? { ...u, status: nextStatus } : u)));
    } catch {
      setError('Could not reach the server.');
    }
  };

  const deleteUser = async (targetUser) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/users/${targetUser.user_id}`, { method: 'DELETE', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setUsers((prev) => prev.filter((u) => u.user_id !== targetUser.user_id));
    } catch {
      setError('Could not reach the server.');
    }
  };

  const confirmToggleStatus = (targetUser) => {
    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    setConfirmDialog({
      title: `Are you sure you want to ${nextStatus === 'suspended' ? 'suspend' : 'reactivate'} this account?`,
      message: nextStatus === 'suspended'
        ? `${targetUser.name} will no longer be able to log in.`
        : `${targetUser.name} will be able to log in again.`,
      confirmLabel: nextStatus === 'suspended' ? 'Suspend' : 'Reactivate',
      destructive: nextStatus === 'suspended',
      onConfirm: () => toggleStatus(targetUser),
    });
  };

  const confirmDeleteUser = (targetUser) => {
    setConfirmDialog({
      title: 'Are you sure you want to delete this account?',
      message: `This permanently deletes ${targetUser.name}'s account and every record tied to it -- bookings, mood history, journal entries, wellness check-ins, messages, everything. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: () => deleteUser(targetUser),
    });
  };

  const filtered = users.filter((u) => {
    if (statusFilter && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            {icon} {title}
          </h1>
          <p className="text-brand-ink/60 text-sm">{subtitle}</p>
        </div>
        <AdminTopBar search={search} onSearchChange={setSearch} searchPlaceholder="Search name or email..." />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-6 mb-5">
        {['', 'active', 'suspended', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { playClick(); setStatusFilter(s); }}
            onMouseEnter={playHover}
            className={`interactive text-xs font-medium px-3.5 py-2 rounded-full capitalize ${
              statusFilter === s ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            {s || 'All statuses'}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No users match this filter.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => (
              <div key={u.user_id} className="border border-brand-ink/10 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{u.name}</p>
                  <p className="text-xs text-brand-ink/50 truncate">{u.email}</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize mt-1 inline-block ${
                    u.status === 'suspended' ? 'bg-red-100 text-red-700' : u.status === 'rejected' ? 'bg-brand-ink/5 text-brand-ink/50' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { playClick(); confirmToggleStatus(u); }}
                    onMouseEnter={playHover}
                    className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                  >
                    {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </button>
                  <button
                    onClick={() => { playClick(); confirmDeleteUser(u); }}
                    onMouseEnter={playHover}
                    className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </>
  );
}

export default AdminUserList;
