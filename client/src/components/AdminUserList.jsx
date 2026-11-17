import { useEffect, useMemo, useState } from 'react';
import {
  IconUsers, IconCircleCheck, IconPlayerPause, IconBan,
  IconEye, IconPencil, IconTrash, IconDownload, IconX,
} from '@tabler/icons-react';
import AdminTopBar from './AdminTopBar';
import ConfirmDialog from './ConfirmDialog';
import DataTable from './DataTable';
import StatCard from './StatCard';
import { API_URL, authHeader } from '../config';
import { avatarColorFor } from '../utils/avatar';
import { playHover, playClick } from '../utils/sound';

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-700',
};

function statusDot(status) {
  if (status === 'active') return 'bg-green-500';
  if (status === 'suspended') return 'bg-amber-500';
  return 'bg-red-500';
}

function toCsv(rows) {
  const header = ['Name', 'Email', 'Status', 'Date Registered'];
  const lines = rows.map((u) => [u.name, u.email, u.status, new Date(u.created_at).toLocaleDateString('en-PH')]
    .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

// Shared by AdminResidents.jsx and AdminPsychologists.jsx -- the same roster
// list, pre-filtered to one role per page instead of a dropdown picking
// between both.
function AdminUserList({ title, subtitle, icon, fixedRole }) {
  const [users, setUsers] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

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
  useEffect(() => {
    fetch(`${API_URL}/barangays`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setBarangays(data); })
      .catch(() => {});
  }, []);

  const barangayName = (id) => barangays.find((b) => b.barangay_id === id)?.name || '—';

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

  const confirmDeleteUser = (targetUser) => {
    setConfirmDialog({
      title: 'Are you sure you want to delete this account?',
      message: `This permanently deletes ${targetUser.name}'s account and every record tied to it -- bookings, mood history, journal entries, wellness check-ins, messages, everything. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: () => deleteUser(targetUser),
    });
  };

  const filtered = useMemo(() => {
    let rows = users.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      const diff = new Date(b.created_at) - new Date(a.created_at);
      return sort === 'oldest' ? -diff : diff;
    });
    return rows;
  }, [users, statusFilter, search, sort]);

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    suspended: users.filter((u) => u.status === 'suspended').length,
    rejected: users.filter((u) => u.status === 'rejected').length,
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `openup-${fixedRole}s-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColorFor(u.name)}`}>
            {(u.name || '?')[0]?.toUpperCase()}
          </span>
          <span className="font-medium truncate">{u.name}</span>
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (u) => <span className="text-brand-ink/70">{u.email}</span> },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLES[u.status] || 'bg-brand-ink/5 text-brand-ink/60'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot(u.status)}`} /> {u.status}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Date Registered',
      render: (u) => <span className="text-brand-ink/60">{new Date(u.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (u) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={() => { playClick(); setViewTarget(u); }}
            onMouseEnter={playHover}
            className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 flex items-center gap-1"
          >
            <IconEye size={13} /> View
          </button>
          <button
            onClick={() => { playClick(); setEditTarget(u); }}
            onMouseEnter={playHover}
            className="interactive text-xs font-medium px-3 py-1.5 rounded-full text-white flex items-center gap-1"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            <IconPencil size={13} /> Edit
          </button>
          <button
            onClick={() => { playClick(); confirmDeleteUser(u); }}
            onMouseEnter={playHover}
            className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600 flex items-center gap-1"
          >
            <IconTrash size={13} /> Delete
          </button>
        </div>
      ),
    },
  ];

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 mb-6">
        <StatCard icon={<IconUsers size={19} />} label={`Total ${title}`} value={stats.total} iconBg="bg-brand-primary/10 text-brand-primary" />
        <StatCard icon={<IconCircleCheck size={19} />} label="Active" value={stats.active} iconBg="bg-green-100 text-green-700" />
        <StatCard icon={<IconPlayerPause size={19} />} label="Suspended" value={stats.suspended} iconBg="bg-amber-100 text-amber-700" />
        <StatCard icon={<IconBan size={19} />} label="Rejected" value={stats.rejected} iconBg="bg-red-100 text-red-700" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => { playClick(); setStatusFilter(e.target.value); }}
            onMouseEnter={playHover}
            className="interactive text-sm border border-brand-ink/15 rounded-full px-3.5 py-2 bg-brand-surface"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={sort}
            onChange={(e) => { playClick(); setSort(e.target.value); }}
            onMouseEnter={playHover}
            className="interactive text-sm border border-brand-ink/15 rounded-full px-3.5 py-2 bg-brand-surface"
          >
            <option value="newest">Date Registered (Newest)</option>
            <option value="oldest">Date Registered (Oldest)</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
        <button
          onClick={() => { playClick(); exportCsv(); }}
          onMouseEnter={playHover}
          className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full border border-brand-ink/20"
        >
          <IconDownload size={14} /> Export
        </button>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          keyField="user_id"
          itemLabel={title.toLowerCase()}
          emptyMessage="No users match this filter."
        />
      </div>

      {viewTarget && (
        <ViewUserModal user={viewTarget} barangayName={barangayName(viewTarget.barangay_id)} onClose={() => setViewTarget(null)} />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          barangays={barangays}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => { setUsers((prev) => prev.map((u) => (u.user_id === updated.user_id ? { ...u, ...updated } : u))); setEditTarget(null); }}
        />
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </>
  );
}

function ViewUserModal({ user, barangayName, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white ${avatarColorFor(user.name)}`}>
              {(user.name || '?')[0]?.toUpperCase()}
            </span>
            <div>
              <p className="font-display text-base font-semibold">{user.name}</p>
              <p className="text-xs text-brand-ink/50 capitalize">{user.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Email</dt><dd className="font-medium text-right truncate">{user.email}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Barangay</dt><dd className="font-medium text-right">{barangayName}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Status</dt><dd className="font-medium text-right capitalize">{user.status}</dd></div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">Date Registered</dt>
            <dd className="font-medium text-right">{new Date(user.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</dd>
          </div>
        </dl>
        <button onClick={onClose} className="interactive w-full mt-5 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Close</button>
      </div>
    </div>
  );
}

function EditUserModal({ user, barangays, onClose, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [barangayId, setBarangayId] = useState(user.barangay_id || '');
  const [status, setStatus] = useState(user.status === 'rejected' ? 'active' : user.status);
  const [status0] = useState(user.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true);
    try {
      const profileRes = await fetch(`${API_URL}/admin/users/${user.user_id}/profile`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, barangay_id: Number(barangayId) }),
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) { setError(profileData.error || 'Could not save changes.'); setSaving(false); return; }

      let finalUser = profileData;
      if (status !== status0 && ['active', 'suspended'].includes(status)) {
        const statusRes = await fetch(`${API_URL}/admin/users/${user.user_id}/status`, {
          method: 'PATCH',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const statusData = await statusRes.json();
        if (!statusRes.ok) { setError(statusData.error || 'Saved name/barangay, but could not update status.'); setSaving(false); return; }
        finalUser = { ...finalUser, status: statusData.status };
      }
      onSaved(finalUser);
    } catch {
      setError('Could not reach the server.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">Edit {user.name}</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <p className="text-sm text-brand-ink/60 mb-4">Email can't be changed here -- it's this account's login identifier.</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Barangay</label>
            <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface">
              {barangays.map((b) => <option key={b.barangay_id} value={b.barangay_id}>{b.name}</option>)}
            </select>
          </div>
          {status0 !== 'rejected' && (
            <div>
              <label className="text-xs font-medium text-brand-ink/60 block mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm bg-brand-surface">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Cancel</button>
            <button type="submit" disabled={saving} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full text-white disabled:opacity-60" style={{ backgroundColor: '#2b4d3f' }}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUserList;
