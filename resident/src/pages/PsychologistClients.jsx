import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

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

function initials(name) {
  return (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function PsychologistClients() {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [wellness, setWellness] = useState(null);
  const [wellnessError, setWellnessError] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [noteStatus, setNoteStatus] = useState({});

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

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">My Clients</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Residents you've had a booking with. Open one to review their mood and wellness check-in
        history, session history, and add private progress notes.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {clients.length === 0 && !error ? (
        <p className="text-brand-ink/50 text-sm">No clients yet -- once a resident books with you, they'll show up here.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clients.map((c) => (
            <button
              key={c.user_id}
              onClick={() => openClient(c)}
              className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-center gap-3 text-left hover:shadow-md transition-shadow"
            >
              <span className="w-11 h-11 rounded-full bg-brand-primary/10 text-brand-primary font-semibold flex items-center justify-center shrink-0">
                {initials(c.name)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-brand-ink/50">
                  {c.total_sessions} session{c.total_sessions === 1 ? '' : 's'}
                  {c.last_session && ` · last ${new Date(c.last_session).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`}
                </p>
              </div>
            </button>
          ))}
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
