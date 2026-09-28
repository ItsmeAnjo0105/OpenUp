import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

function PsychologistGroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ topic: '', schedule: '' });
  const [creating, setCreating] = useState(false);

  const loadSessions = () => {
    fetch(`${API_URL}/psychologists/me/group-sessions`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setSessions(data);
        else setError(data?.error || 'Could not load your group sessions.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(loadSessions, []);

  const createSession = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/group-sessions`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not schedule this session.'); return; }
      setForm({ topic: '', schedule: '' });
      setSessions((prev) => [...prev, data].sort((a, b) => new Date(a.schedule) - new Date(b.schedule)));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  };

  const upcoming = sessions.filter((s) => new Date(s.schedule) >= new Date());
  const past = sessions.filter((s) => new Date(s.schedule) < new Date());

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Group Sessions</h1>
      <p className="text-brand-ink/60 text-sm mb-8">Schedule and host group discussions with your clients.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="font-medium mb-4">Schedule a session</h2>
        <form onSubmit={createSession} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-brand-ink/50 block mb-1">Topic</label>
            <input
              value={form.topic}
              onChange={(e) => setForm({ ...form, topic: e.target.value })}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-brand-ink/50 block mb-1">Date & time</label>
            <input
              type="datetime-local"
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              required
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60"
          >
            {creating ? 'Scheduling...' : 'Schedule'}
          </button>
        </form>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="font-medium mb-4">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-brand-ink/40">Nothing scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((s) => (
              <div key={s.group_session_id} className="flex items-center justify-between border border-brand-ink/10 rounded-xl p-4">
                <div>
                  <p className="text-sm font-semibold">{s.topic}</p>
                  <p className="text-xs text-brand-ink/50">
                    {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <Link
                  to={`/group-session/${s.group_session_id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                >
                  Facilitate
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <h2 className="font-medium mb-4">Past</h2>
          <div className="space-y-2">
            {past.map((s) => (
              <div key={s.group_session_id} className="flex items-center justify-between text-sm">
                <span>{s.topic}</span>
                <span className="text-brand-ink/50">
                  {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistGroupSessions;
