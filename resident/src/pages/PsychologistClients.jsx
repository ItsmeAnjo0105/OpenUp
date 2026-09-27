import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

const BAND_STYLE = {
  low: 'bg-green-100 text-green-700',
  moderate: 'bg-amber-100 text-amber-700',
  elevated: 'bg-red-100 text-red-700',
};

const BAND_LABEL = { low: 'Feeling steady', moderate: 'Some strain showing', elevated: 'Carrying a lot' };

function initials(name) {
  return (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function PsychologistClients() {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [wellness, setWellness] = useState(null);
  const [wellnessError, setWellnessError] = useState('');

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
    fetch(`${API_URL}/psychologists/me/clients/${client.user_id}/wellness`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setWellness(data);
        else setWellnessError(data.error || 'Could not load their wellness history.');
      })
      .catch(() => setWellnessError('Could not reach the server.'));
  };

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">My Clients</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Residents you've had a booking with. Open one to review their mood and wellness check-in
        history before a session.
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
              </div>
            )}
          </div>
        </div>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistClients;
