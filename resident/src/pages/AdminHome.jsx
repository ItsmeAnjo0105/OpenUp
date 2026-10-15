import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconUsers, IconStethoscope, IconBuildingBank, IconClipboardCheck, IconAlertTriangle,
} from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';

function AdminHome() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [lguAccounts, setLguAccounts] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [error, setError] = useState('');
  const user = getStoredUser();

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/admin/users`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/psychologists?status=pending`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/lgu-accounts`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/escalations`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ]).then(([usersRes, pendingRes, lguRes, escRes]) => {
      if (usersRes.ok && Array.isArray(usersRes.data)) setUsers(usersRes.data);
      if (pendingRes.ok && Array.isArray(pendingRes.data)) setPending(pendingRes.data);
      if (lguRes.ok && Array.isArray(lguRes.data)) setLguAccounts(lguRes.data);
      if (escRes.ok && Array.isArray(escRes.data)) setEscalations(escRes.data);
    }).catch(() => setError('Could not reach the server.'));
  }, []);

  const residentCount = users.filter((u) => u.role === 'resident').length;
  const psychologistCount = users.filter((u) => u.role === 'psychologist').length;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">Welcome, {user.name}</h1>
          <p className="text-brand-ink/60 text-sm">Platform overview.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-6">
        <Link to="/admin/residents" className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 block">
          <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center"><IconUsers size={18} /></span>
          <p className="text-xs text-brand-ink/50 mt-3">Residents</p>
          <p className="text-2xl font-semibold mt-0.5">{residentCount}</p>
        </Link>
        <Link to="/admin/psychologists" className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 block">
          <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center"><IconStethoscope size={18} /></span>
          <p className="text-xs text-brand-ink/50 mt-3">Psychologists</p>
          <p className="text-2xl font-semibold mt-0.5">{psychologistCount}</p>
        </Link>
        <Link to="/admin/lgu-accounts" className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 block">
          <span className="w-9 h-9 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center"><IconBuildingBank size={18} /></span>
          <p className="text-xs text-brand-ink/50 mt-3">LGU accounts</p>
          <p className="text-2xl font-semibold mt-0.5">{lguAccounts.length}</p>
        </Link>
        <Link to="/admin/verification" className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 block">
          <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"><IconClipboardCheck size={18} /></span>
          <p className="text-xs text-brand-ink/50 mt-3">Pending verification</p>
          <p className="text-2xl font-semibold mt-0.5">{pending.length}</p>
        </Link>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6">
        <h2 className="font-display text-lg font-semibold text-purple-900 mb-1 flex items-center gap-2">
          <IconAlertTriangle size={18} /> Emergency escalations
        </h2>
        <p className="text-xs text-purple-900/70 mb-4">
          Raised by a psychologist during a live session. Review these as soon as possible.
        </p>

        {escalations.length === 0 ? (
          <p className="text-sm text-purple-900/60">No escalations raised.</p>
        ) : (
          <div className="space-y-3">
            {escalations.map((e) => (
              <div key={e.escalation_id} className="bg-white border border-purple-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">
                    {e.Booking?.User?.name || 'A resident'} · with {e.Psychologist?.User?.name || 'a psychologist'}
                  </p>
                  <span className="text-xs text-brand-ink/50">
                    {new Date(e.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                {e.note && <p className="text-sm text-brand-ink/70 mt-1">"{e.note}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default AdminHome;
