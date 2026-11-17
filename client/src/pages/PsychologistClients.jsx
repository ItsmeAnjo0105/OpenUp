import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconUsers, IconSearch, IconX, IconArrowRight, IconChevronDown, IconCircleDot } from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
];

// Deterministic so the same client always gets the same color, instead of
// a color that shuffles on every reload.
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const SORT_OPTIONS = [
  { key: 'recent', label: 'Most recent' },
  { key: 'sessions', label: 'Most sessions' },
  { key: 'name', label: 'Name A-Z' },
];

function PsychologistClients() {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/clients`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setClients(data); })
      .catch(() => setError('Could not load your clients.'));
  }, []);

  const visibleClients = clients
    .filter((c) => {
      if (statusFilter === 'active' && !c.is_active) return false;
      if (statusFilter === 'inactive' && c.is_active) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'sessions') return b.total_sessions - a.total_sessions;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return new Date(b.last_session || 0) - new Date(a.last_session || 0);
    });

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconUsers size={22} className="text-brand-primary" /> My Clients
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Residents you've had a booking with. Open one to review their mood and wellness check-in
            history, session history, and add private progress notes.
          </p>
        </div>
        <PsychologistTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="relative mt-6 mb-4">
        <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client..."
          className="w-full border border-brand-ink/15 rounded-full pl-10 pr-10 py-2.5 text-sm bg-brand-surface"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="interactive absolute right-4 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink/70"
          >
            <IconX size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { playClick(); setStatusFilter('all'); }}
            onMouseEnter={playHover}
            className={`interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full ${
              statusFilter === 'all' ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            <IconUsers size={13} /> All Clients
          </button>
          <button
            onClick={() => { playClick(); setStatusFilter('active'); }}
            onMouseEnter={playHover}
            className={`interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full ${
              statusFilter === 'active' ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            <IconCircleDot size={13} className="text-green-500" /> Active
          </button>
          <button
            onClick={() => { playClick(); setStatusFilter('inactive'); }}
            onMouseEnter={playHover}
            className={`interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full ${
              statusFilter === 'inactive' ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            <IconCircleDot size={13} className="text-brand-ink/30" /> Inactive
          </button>
          <div className="relative">
            <button
              onClick={() => { playClick(); setSortMenuOpen((v) => !v); }}
              onMouseEnter={playHover}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 text-brand-ink/70"
            >
              Sort by <IconChevronDown size={13} />
            </button>
            {sortMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortMenuOpen(false)} />
                <div className="absolute left-0 mt-1 w-36 bg-brand-surface rounded-xl shadow-md py-1 z-20" style={{ border: '1px solid rgba(28,36,32,0.08)' }}>
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => { playClick(); setSortBy(opt.key); setSortMenuOpen(false); }}
                      onMouseEnter={playHover}
                      className={`interactive-nav w-full text-left px-3 py-2 text-sm ${
                        sortBy === opt.key ? 'text-brand-primary font-medium' : 'text-brand-ink/70'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-brand-ink/40 whitespace-nowrap">
          {visibleClients.length} client{visibleClients.length === 1 ? '' : 's'}
        </p>
      </div>

      {clients.length === 0 && !error ? (
        <p className="text-brand-ink/50 text-sm">No clients yet -- once a resident books with you, they'll show up here.</p>
      ) : visibleClients.length === 0 ? (
        <p className="text-brand-ink/50 text-sm">No clients match this search or filter.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleClients.map((c) => {
            const color = colorForName(c.name);
            return (
              <button
                key={c.user_id}
                onClick={() => { playClick(); navigate(`/psychologist/clients/${c.user_id}`); }}
                onMouseEnter={playHover}
                className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 flex items-center gap-3 text-left border-l-4 border-transparent hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
              >
                <span className={`w-11 h-11 rounded-full ${color.bg} ${color.text} font-semibold flex items-center justify-center shrink-0`}>
                  {(c.name || '?')[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-brand-ink/50">
                    {c.total_sessions} session{c.total_sessions === 1 ? '' : 's'}
                    {c.last_session && ` · last ${new Date(c.last_session).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`}
                  </p>
                </div>
                <span className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                  <IconArrowRight size={14} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistClients;
