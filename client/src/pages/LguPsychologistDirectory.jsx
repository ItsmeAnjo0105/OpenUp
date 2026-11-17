import { useEffect, useMemo, useState } from 'react';
import { IconStethoscope, IconSearch, IconUsers, IconEye, IconX } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { API_URL } from '../config';
import { avatarColorFor } from '../utils/avatar';
import { playHover, playClick } from '../utils/sound';

function LguPsychologistDirectory() {
  const [psychologists, setPsychologists] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewTarget, setViewTarget] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/psychologists`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setPsychologists(body) : setError(body?.error || 'Could not load the directory.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const visible = useMemo(() => {
    if (!search) return psychologists;
    const needle = search.toLowerCase();
    return psychologists.filter((p) => {
      const haystack = `${p.User?.name || ''} ${p.credentials || ''} ${(p.specialties || []).join(' ')}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [psychologists, search]);

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (p) => (
        <div className="flex items-center gap-2.5">
          {p.profile_photo_url ? (
            <img src={p.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${avatarColorFor(p.User?.name)}`}>
              {(p.User?.name || '?')[0]?.toUpperCase()}
            </span>
          )}
          <span className="font-medium truncate">{p.User?.name}</span>
        </div>
      ),
    },
    { key: 'credentials', label: 'Credentials', render: (p) => <span className="text-brand-ink/70">{p.credentials || '—'}</span> },
    {
      key: 'specialties',
      label: 'Specialties',
      render: (p) => (
        <div className="flex flex-wrap gap-1.5 max-w-xs">
          {Array.isArray(p.specialties) && p.specialties.length > 0
            ? p.specialties.slice(0, 2).map((s) => (
                <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">{s}</span>
              ))
            : <span className="text-brand-ink/40">—</span>}
          {Array.isArray(p.specialties) && p.specialties.length > 2 && (
            <span className="text-[11px] text-brand-ink/40">+{p.specialties.length - 2}</span>
          )}
        </div>
      ),
    },
    {
      key: 'years_experience',
      label: 'Experience',
      render: (p) => <span className="text-brand-ink/60">{p.years_experience != null ? `${p.years_experience} yrs` : '—'}</span>,
    },
    {
      key: 'session_price',
      label: 'Price / session',
      render: (p) => <span className="text-brand-ink/60">₱{Number(p.session_price || 0).toLocaleString()}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (p) => (
        <div className="flex justify-end">
          <button
            onClick={() => { playClick(); setViewTarget(p); }}
            onMouseEnter={playHover}
            className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 flex items-center gap-1"
          >
            <IconEye size={13} /> View
          </button>
        </div>
      ),
    },
  ];

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconStethoscope size={22} className="text-brand-primary" /> Psychologist Directory
          </h1>
          <p className="text-brand-ink/60 text-sm">Every verified psychologist available to residents on OpenUp.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6 max-w-2xl">
        <StatCard icon={<IconUsers size={19} />} label="Total Psychologists" value={psychologists.length} iconBg="bg-brand-primary/10 text-brand-primary" />
      </div>

      <div className="relative mb-4 max-w-sm">
        <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, credentials, specialty..."
          className="w-full border border-brand-ink/15 rounded-full pl-10 pr-4 py-2.5 text-sm bg-brand-surface"
        />
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          rows={visible}
          keyField="psychologist_id"
          itemLabel="psychologists"
          emptyMessage={psychologists.length === 0 ? 'No verified psychologists yet.' : 'No psychologists match this search.'}
        />
      </div>

      {viewTarget && <ViewPsychologistModal psychologist={viewTarget} onClose={() => setViewTarget(null)} />}
    </LguLayout>
  );
}

function ViewPsychologistModal({ psychologist: p, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {p.profile_photo_url ? (
              <img src={p.profile_photo_url} alt="" className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <span className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold text-white ${avatarColorFor(p.User?.name)}`}>
                {(p.User?.name || '?')[0]?.toUpperCase()}
              </span>
            )}
            <div>
              <p className="font-display text-base font-semibold">{p.User?.name}</p>
              <p className="text-xs text-brand-ink/50">{p.credentials}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Experience</dt><dd className="font-medium text-right">{p.years_experience != null ? `${p.years_experience} years` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-brand-ink/50">Price / session</dt><dd className="font-medium text-right">₱{Number(p.session_price || 0).toLocaleString()}</dd></div>
          {Array.isArray(p.specialties) && p.specialties.length > 0 && (
            <div className="pt-1">
              <dt className="text-brand-ink/50 mb-1.5">Specialties</dt>
              <dd className="flex flex-wrap gap-1.5">
                {p.specialties.map((s) => (
                  <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">{s}</span>
                ))}
              </dd>
            </div>
          )}
          {p.bio && (
            <div className="pt-1">
              <dt className="text-brand-ink/50 mb-1">Bio</dt>
              <dd>{p.bio}</dd>
            </div>
          )}
        </dl>
        <button onClick={onClose} className="interactive w-full mt-5 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Close</button>
      </div>
    </div>
  );
}

export default LguPsychologistDirectory;
