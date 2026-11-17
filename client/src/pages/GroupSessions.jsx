import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL, authHeader } from '../config';

function GroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/group-sessions`)
      .then((res) => res.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Registers the resident against the session's participant cap before
  // letting them in -- without this, "max participants" would just be a
  // number on screen with nothing actually enforcing it.
  const handleJoin = async (groupSessionId) => {
    setJoiningId(groupSessionId);
    setError('');
    try {
      const res = await fetch(`${API_URL}/group-sessions/${groupSessionId}/join`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not join this session.'); return; }
      navigate(`/group-session/${groupSessionId}`);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Group Sessions</h1>
        <p className="text-brand-ink/60 text-sm mb-8">Join a live group discussion with a licensed psychologist.</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-brand-ink/50 text-sm">No group sessions scheduled yet.</p>
          ) : (
            sessions.map((s) => {
              const isFull = s.participant_count >= s.max_participants;
              return (
                <div key={s.group_session_id} className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.topic}</p>
                    <p className="text-brand-ink/50 text-sm">
                      with {s.Psychologist?.User?.name || 'a psychologist'} ·{' '}
                      {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}{s.participant_count}/{s.max_participants} joined
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoin(s.group_session_id)}
                    disabled={isFull || joiningId === s.group_session_id}
                    className="bg-brand-primary text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50 disabled:hover:bg-brand-primary"
                  >
                    {isFull ? 'Full' : joiningId === s.group_session_id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}

export default GroupSessions;
