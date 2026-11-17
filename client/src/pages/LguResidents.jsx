import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowLeft, IconAlertTriangle, IconUserCog, IconFlag, IconFlagOff, IconX, IconUsers, IconFlag3, IconShieldCheck, IconEye, IconSearch } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { API_URL, authHeader } from '../config';
import { avatarColorFor } from '../utils/avatar';
import { playHover, playClick } from '../utils/sound';

const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };

function LguResidents() {
  const [residents, setResidents] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [flagTarget, setFlagTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/lgu/me/residents`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setResidents(body) : setError(body?.error || 'Could not load residents.')))
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    let rows = flaggedOnly ? residents.filter((r) => r.flagged) : residents;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q));
    }
    return rows;
  }, [residents, flaggedOnly, search]);

  const unflag = async (resident) => {
    try {
      const res = await fetch(`${API_URL}/lgu/me/residents/${resident.user_id}/flag`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) load();
    } catch {
      // leave as-is
    }
  };

  const confirmUnflag = (resident) => {
    setConfirmDialog({
      title: `Resolve the flag on ${resident.name}?`,
      message: "This clears your office's manual flag. Any automatic flag from their own check-in stays as-is.",
      confirmLabel: 'Resolve',
      destructive: false,
      onConfirm: () => unflag(resident),
    });
  };

  const stats = {
    total: residents.length,
    flagged: residents.filter((r) => r.flagged).length,
    clear: residents.filter((r) => !r.flagged).length,
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColorFor(r.name)}`}>
            {(r.name || '?')[0]?.toUpperCase()}
          </span>
          <span className="font-medium truncate">{r.name}</span>
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (r) => <span className="text-brand-ink/70">{r.email || '—'}</span> },
    {
      key: 'last_check_in',
      label: 'Last Check-in',
      render: (r) => <span className="text-brand-ink/60">{r.last_check_in ? new Date(r.last_check_in).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'None yet'}</span>,
    },
    {
      key: 'recent_mood_level',
      label: 'Recent Mood',
      render: (r) => <span className="text-brand-ink/60">{r.recent_mood_level != null ? MOOD_LABELS[r.recent_mood_level] : '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.auto_flagged && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit">
              <IconAlertTriangle size={12} /> Check-in flag
            </span>
          )}
          {r.manually_flagged && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 flex items-center gap-1 w-fit" title={r.manual_flag_reason || 'No reason given'}>
              <IconFlag size={12} /> Office flag
            </span>
          )}
          {!r.flagged && <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">Clear</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={() => { playClick(); setViewTarget(r); }}
            onMouseEnter={playHover}
            className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 flex items-center gap-1"
          >
            <IconEye size={13} /> View
          </button>
          {r.manually_flagged ? (
            <button
              onClick={() => { playClick(); confirmUnflag(r); }}
              onMouseEnter={playHover}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 inline-flex items-center gap-1"
            >
              <IconFlagOff size={13} /> Resolve
            </button>
          ) : (
            <button
              onClick={() => { playClick(); setFlagTarget(r); }}
              onMouseEnter={playHover}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-red-600 text-white inline-flex items-center gap-1"
            >
              <IconFlag size={13} /> Flag
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <LguLayout>
      <Link to="/lgu/dashboard" onMouseEnter={playHover} onClick={playClick} className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
        <IconArrowLeft size={15} /> Back to Dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconUserCog size={22} className="text-brand-primary" /> Manage Residents
          </h1>
          <p className="text-brand-ink/60 text-sm">Residents registered in your barangay and their most recent check-in.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <StatCard icon={<IconUsers size={19} />} label="Total Residents" value={stats.total} iconBg="bg-brand-primary/10 text-brand-primary" />
        <StatCard icon={<IconFlag3 size={19} />} label="Flagged" value={stats.flagged} iconBg="bg-red-100 text-red-700" />
        <StatCard icon={<IconShieldCheck size={19} />} label="Clear" value={stats.clear} iconBg="bg-green-100 text-green-700" />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { playClick(); setFlaggedOnly(false); }}
            onMouseEnter={playHover}
            className={`interactive text-xs font-medium px-3.5 py-2 rounded-full ${!flaggedOnly ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'}`}
          >
            All residents
          </button>
          <button
            onClick={() => { playClick(); setFlaggedOnly(true); }}
            onMouseEnter={playHover}
            className={`interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full ${flaggedOnly ? 'bg-red-600 text-white' : 'border border-brand-ink/15 text-brand-ink/70'}`}
          >
            <IconAlertTriangle size={13} /> Flagged only
          </button>
        </div>
        <div className="relative">
          <IconSearch size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="border border-brand-ink/15 rounded-full pl-9 pr-4 py-2 text-sm bg-brand-surface w-56"
          />
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={visible}
          keyField="user_id"
          itemLabel="residents"
          emptyMessage={residents.length === 0 ? 'No residents registered yet.' : 'No residents match this filter.'}
        />
      </div>

      {viewTarget && <ViewResidentModal resident={viewTarget} onClose={() => setViewTarget(null)} />}

      {flagTarget && (
        <FlagResidentModal
          resident={flagTarget}
          onClose={() => setFlagTarget(null)}
          onFlagged={() => { setFlagTarget(null); load(); }}
        />
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </LguLayout>
  );
}

function ViewResidentModal({ resident, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white ${avatarColorFor(resident.name)}`}>
              {(resident.name || '?')[0]?.toUpperCase()}
            </span>
            <div>
              <p className="font-display text-base font-semibold">{resident.name}</p>
              <p className="text-xs text-brand-ink/50">Resident</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Email</dt><dd className="font-medium text-right truncate">{resident.email || '—'}</dd></div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">Date Registered</dt>
            <dd className="font-medium text-right">{resident.created_at ? new Date(resident.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-ink/50">Last Check-in</dt>
            <dd className="font-medium text-right">{resident.last_check_in ? new Date(resident.last_check_in).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'None yet'}</dd>
          </div>
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Recent Mood</dt><dd className="font-medium text-right">{resident.recent_mood_level != null ? MOOD_LABELS[resident.recent_mood_level] : '—'}</dd></div>
          {resident.manually_flagged && (
            <div className="pt-1">
              <dt className="text-brand-ink/50 mb-1">Office flag reason</dt>
              <dd className="font-medium">{resident.manual_flag_reason || 'No reason given'}</dd>
            </div>
          )}
        </dl>
        <button onClick={onClose} className="interactive w-full mt-5 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Close</button>
      </div>
    </div>
  );
}

function FlagResidentModal({ resident, onClose, onFlagged }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('saving');
    try {
      const res = await fetch(`${API_URL}/lgu/me/residents/${resident.user_id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || 'Could not flag this resident.');
        setStatus('idle');
        return;
      }
      onFlagged();
    } catch {
      setError('Could not reach the server.');
      setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">Flag {resident.name}</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <p className="text-sm text-brand-ink/60 mb-4">
          Raises this resident as high-risk in your office's own judgment, separate from their check-in history.
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Reported during a barangay home visit..."
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
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
              className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-red-600 text-white disabled:opacity-60"
            >
              {status === 'saving' ? 'Flagging...' : 'Flag resident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LguResidents;
