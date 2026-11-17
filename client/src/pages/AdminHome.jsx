import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconUsers, IconStethoscope, IconBuildingBank, IconClipboardCheck, IconAlertTriangle,
  IconHeartbeat, IconDatabase, IconPlugConnected, IconCircleCheck, IconCircleX,
} from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';

function AdminHome() {
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [lguAccounts, setLguAccounts] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const user = getStoredUser();

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/admin/users`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/psychologists?status=pending`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/lgu-accounts`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/escalations`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/system-health`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ]).then(([usersRes, pendingRes, lguRes, escRes, healthRes]) => {
      if (usersRes.ok && Array.isArray(usersRes.data)) setUsers(usersRes.data);
      if (pendingRes.ok && Array.isArray(pendingRes.data)) setPending(pendingRes.data);
      if (lguRes.ok && Array.isArray(lguRes.data)) setLguAccounts(lguRes.data);
      if (escRes.ok && Array.isArray(escRes.data)) setEscalations(escRes.data);
      if (healthRes.ok) setHealth(healthRes.data);
    }).catch(() => setError('Could not reach the server.'));
  }, []);

  const uptimeLabel = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

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

      {health && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
            <IconHeartbeat size={18} className="text-brand-primary" /> System health
          </h2>
          <p className="text-xs text-brand-ink/50 mb-4">
            Real, checkable signals only -- no invented uptime percentage or error rate, since
            there's no monitoring infrastructure in this app to source one from.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <HealthItem
              icon={<IconDatabase size={16} />}
              label="Database"
              ok={health.database === 'online'}
              detail={health.database === 'online' ? 'Online' : 'Offline'}
            />
            <HealthItem
              icon={<IconPlugConnected size={16} />}
              label="AI Companion"
              ok={health.integrations_configured.ai_companion}
              detail={health.integrations_configured.ai_companion ? 'Configured' : 'Not configured'}
            />
            <HealthItem
              icon={<IconPlugConnected size={16} />}
              label="Payments"
              ok={health.integrations_configured.payments}
              detail={health.integrations_configured.payments ? 'Configured' : 'Not configured'}
            />
            <HealthItem
              icon={<IconPlugConnected size={16} />}
              label="Video sessions"
              ok={health.integrations_configured.video_sessions}
              detail={health.integrations_configured.video_sessions ? 'Configured' : 'Not configured'}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-brand-ink/60 pt-3 border-t border-brand-ink/10">
            <span>
              Care Credit ledger:{' '}
              {health.care_credit_ledger.reconciled === null ? 'Unknown' : health.care_credit_ledger.reconciled
                ? <span className="text-green-700 font-medium">Reconciled</span>
                : <span className="text-red-600 font-medium">{health.care_credit_ledger.orphaned_used_credits} orphaned credit(s)</span>}
              {' '}({health.care_credit_ledger.total_issued} total issued)
            </span>
            <span>Server process uptime: {uptimeLabel(health.process_uptime_seconds)}</span>
          </div>
        </div>
      )}

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

function HealthItem({ icon, label, ok, detail }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-brand-ink/50">{label}</p>
        <p className="text-sm font-medium flex items-center gap-1">
          {ok ? <IconCircleCheck size={13} className="text-green-600" /> : <IconCircleX size={13} className="text-red-600" />}
          {detail}
        </p>
      </div>
    </div>
  );
}

export default AdminHome;
