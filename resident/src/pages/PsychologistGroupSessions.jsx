import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

function PsychologistGroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [form, setForm] = useState({ topic: '', schedule: '', max_participants: 8 });
  const [creating, setCreating] = useState(false);

  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [actingId, setActingId] = useState(null);

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
      setForm({ topic: '', schedule: '', max_participants: 8 });
      setSessions((prev) => [...prev, { ...data, participant_count: 0 }].sort((a, b) => new Date(a.schedule) - new Date(b.schedule)));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  };

  const handleComplete = async (id) => {
    setActingId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/group-sessions/${id}/complete`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Could not mark this session completed.'); return; }
      setSessions((prev) => prev.map((s) => (s.group_session_id === id ? { ...s, status: 'completed' } : s)));
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const handleCancel = async (id) => {
    setActingId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/group-sessions/${id}/cancel`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Could not cancel this session.'); return; }
      setSessions((prev) => prev.map((s) => (s.group_session_id === id ? { ...s, status: 'cancelled' } : s)));
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const handleReschedule = async (id) => {
    if (!rescheduleValue) return;
    setActingId(id);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/group-sessions/${id}/reschedule`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: rescheduleValue }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Could not reschedule this session.'); return; }
      setSessions((prev) => prev.map((s) => (s.group_session_id === id ? { ...s, schedule: data.schedule } : s)));
      setReschedulingId(null);
      setRescheduleValue('');
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const upcoming = sessions
    .filter((s) => s.status === 'scheduled')
    .sort((a, b) => new Date(a.schedule) - new Date(b.schedule));
  const past = sessions
    .filter((s) => s.status !== 'scheduled')
    .sort((a, b) => new Date(b.schedule) - new Date(a.schedule));

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
          <div>
            <label className="text-xs text-brand-ink/50 block mb-1">Max participants</label>
            <input
              type="number"
              min={1}
              max={8}
              value={form.max_participants}
              onChange={(e) => setForm({ ...form, max_participants: Math.min(8, Math.max(1, Number(e.target.value) || 1)) })}
              required
              className="w-24 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
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

      {actionError && <p className="text-sm text-red-600 mb-4">{actionError}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="font-medium mb-4">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-brand-ink/40">Nothing scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((s) => (
              <div key={s.group_session_id} className="border border-brand-ink/10 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">{s.topic}</p>
                    <p className="text-xs text-brand-ink/50">
                      {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}{s.participant_count}/{s.max_participants} joined
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/group-session/${s.group_session_id}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      Facilitate
                    </Link>
                    <button
                      onClick={() => { setReschedulingId(s.group_session_id); setRescheduleValue(''); }}
                      disabled={actingId === s.group_session_id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => handleComplete(s.group_session_id)}
                      disabled={actingId === s.group_session_id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 disabled:opacity-50"
                    >
                      Mark completed
                    </button>
                    <button
                      onClick={() => handleCancel(s.group_session_id)}
                      disabled={actingId === s.group_session_id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {reschedulingId === s.group_session_id && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-brand-ink/10">
                    <input
                      type="datetime-local"
                      value={rescheduleValue}
                      onChange={(e) => setRescheduleValue(e.target.value)}
                      className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => handleReschedule(s.group_session_id)}
                      disabled={!rescheduleValue || actingId === s.group_session_id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                    >
                      Confirm new time
                    </button>
                    <button
                      onClick={() => { setReschedulingId(null); setRescheduleValue(''); }}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                    >
                      Nevermind
                    </button>
                  </div>
                )}
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
                <span className="flex items-center gap-2">
                  {s.topic}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {s.status}
                  </span>
                </span>
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
