import { useEffect, useState } from 'react';
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

const BAND_STYLE = {
  low: 'bg-green-100 text-green-700',
  moderate: 'bg-amber-100 text-amber-700',
  elevated: 'bg-red-100 text-red-700',
};

const BAND_LABEL = { low: 'Feeling steady', moderate: 'Some strain showing', elevated: 'Carrying a lot' };

const STATUS_STYLE = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-brand-ink/5 text-brand-ink/50',
  declined: 'bg-brand-ink/5 text-brand-ink/50',
};

function PsychologistClients() {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [wellness, setWellness] = useState(null);
  const [wellnessError, setWellnessError] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [noteStatus, setNoteStatus] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/clients`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setClients(data); })
      .catch(() => setError('Could not load your clients.'));
  }, []);

  const openClient = (client) => {
    setSelected(client);
    setWellness(null);
    setWellnessError('');
    setExpandedSessionId(null);
    fetch(`${API_URL}/psychologists/me/clients/${client.user_id}/wellness`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setWellness(data);
        else setWellnessError(data.error || 'Could not load their wellness history.');
      })
      .catch(() => setWellnessError('Could not reach the server.'));
  };

  const toggleSessionNotes = (bookingId) => {
    if (expandedSessionId === bookingId) {
      setExpandedSessionId(null);
      return;
    }
    setExpandedSessionId(bookingId);
    if (noteDrafts[bookingId] !== undefined) return; // already loaded
    fetch(`${API_URL}/bookings/${bookingId}/notes`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => setNoteDrafts((prev) => ({ ...prev, [bookingId]: data?.body || '' })))
      .catch(() => setNoteDrafts((prev) => ({ ...prev, [bookingId]: '' })));
  };

  const saveSessionNotes = async (bookingId) => {
    setNoteStatus((prev) => ({ ...prev, [bookingId]: 'saving' }));
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/notes`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteDrafts[bookingId] || '' }),
      });
      setNoteStatus((prev) => ({ ...prev, [bookingId]: res.ok ? 'saved' : 'error' }));
    } catch {
      setNoteStatus((prev) => ({ ...prev, [bookingId]: 'error' }));
    }
  };

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
                onClick={() => { playClick(); openClient(c); }}
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

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setSelected(null)}>
          <div
            className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">{selected.name}</p>
              <button onClick={() => setSelected(null)} className="text-brand-ink/50 text-xl">✕</button>
            </div>
            <p className="text-xs text-brand-ink/50 mb-5">{selected.email}</p>

            {wellnessError && <p className="text-sm text-red-600 mb-4">{wellnessError}</p>}

            {!wellness && !wellnessError && <p className="text-sm text-brand-ink/50">Loading...</p>}

            {wellness && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium mb-2">Recent moods</p>
                  {wellness.mood_entries.length === 0 ? (
                    <p className="text-sm text-brand-ink/40">No mood check-ins yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {wellness.mood_entries.slice(0, 14).map((m) => (
                        <span
                          key={m.entry_date}
                          className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-bg text-brand-ink/70"
                          title={m.entry_date}
                        >
                          {m.mood_label || `Level ${m.mood_level}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium mb-2">Wellness check-ins</p>
                  {wellness.assessments.length === 0 ? (
                    <p className="text-sm text-brand-ink/40">No wellness check-ins yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {wellness.assessments.map((a) => (
                        <div key={a.result_id} className="border border-brand-ink/10 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${BAND_STYLE[a.overall_band]}`}>
                              {BAND_LABEL[a.overall_band] || a.overall_band}
                            </span>
                            <span className="text-xs text-brand-ink/40">
                              {new Date(a.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                            </span>
                          </div>
                          {a.safety_flag && (
                            <p className="text-xs font-medium text-red-600 mb-2">
                              ⚠ Flagged a possible safety concern on this check-in.
                            </p>
                          )}
                          <div className="flex gap-4 text-xs text-brand-ink/50">
                            <span>Mood {a.mood_score}/15</span>
                            <span>Anxiety {a.anxiety_score}/15</span>
                            <span>Stress {a.stress_score}/15</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium mb-2">Session history</p>
                  {!wellness.sessions || wellness.sessions.length === 0 ? (
                    <p className="text-sm text-brand-ink/40">No sessions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {wellness.sessions.map((s) => {
                        const isOpen = expandedSessionId === s.booking_id;
                        const status = noteStatus[s.booking_id];
                        return (
                          <div key={s.booking_id} className="border border-brand-ink/10 rounded-xl overflow-hidden">
                            <button
                              onClick={() => toggleSessionNotes(s.booking_id)}
                              className="w-full flex items-center justify-between p-3 text-left"
                            >
                              <span className="text-sm">
                                {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[s.status] || 'bg-brand-ink/5 text-brand-ink/50'}`}>
                                {s.status}
                              </span>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3">
                                <p className="text-[11px] text-brand-ink/40 mb-1.5">Private progress notes -- your client can never see these.</p>
                                <textarea
                                  value={noteDrafts[s.booking_id] ?? ''}
                                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [s.booking_id]: e.target.value }))}
                                  rows={3}
                                  placeholder="Add progress notes for this session..."
                                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
                                />
                                <div className="flex items-center gap-2 mt-2">
                                  <button
                                    onClick={() => saveSessionNotes(s.booking_id)}
                                    disabled={status === 'saving'}
                                    className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                                  >
                                    {status === 'saving' ? 'Saving...' : 'Save notes'}
                                  </button>
                                  {status === 'saved' && <span className="text-xs text-brand-ink/50">Saved.</span>}
                                  {status === 'error' && <span className="text-xs text-red-600">Could not save.</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistClients;
