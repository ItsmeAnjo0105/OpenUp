import { useEffect, useMemo, useState } from 'react';
import { IconStethoscope, IconSearch } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL } from '../config';

function LguPsychologistDirectory() {
  const [psychologists, setPsychologists] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

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

      <div className="relative mt-6 mb-5 max-w-sm">
        <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, credentials, specialty..."
          className="w-full border border-brand-ink/15 rounded-full pl-10 pr-4 py-2.5 text-sm bg-brand-surface"
        />
      </div>

      {psychologists.length === 0 && !error ? (
        <p className="text-sm text-brand-ink/50">No verified psychologists yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-brand-ink/50">No psychologists match this search.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visible.map((p) => (
            <div key={p.psychologist_id} className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-2">
                {p.profile_photo_url ? (
                  <img src={p.profile_photo_url} alt="" className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-semibold">
                    {(p.User?.name || '?')[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.User?.name}</p>
                  <p className="text-xs text-brand-ink/50 truncate">{p.credentials}</p>
                </div>
              </div>
              {p.years_experience != null && (
                <p className="text-xs text-brand-ink/60 mb-1">{p.years_experience} years experience</p>
              )}
              {Array.isArray(p.specialties) && p.specialties.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.specialties.map((s) => (
                    <span key={s} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">{s}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-brand-ink/50 mt-3">₱{Number(p.session_price).toLocaleString()} / session</p>
            </div>
          ))}
        </div>
      )}
    </LguLayout>
  );
}

export default LguPsychologistDirectory;
