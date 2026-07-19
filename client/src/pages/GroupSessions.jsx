import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL } from '../config';

function GroupSessions() {
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/group-sessions`)
      .then((res) => res.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Group Sessions</h1>
        <p className="text-brand-ink/60 text-sm mb-8">Join a live group discussion with a licensed psychologist.</p>

        <div className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-brand-ink/50 text-sm">No group sessions scheduled yet.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.group_session_id} className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.topic}</p>
                  <p className="text-brand-ink/50 text-sm">
                    with {s.Psychologist?.User?.name || 'a psychologist'} ·{' '}
                    {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/group-session/${s.group_session_id}`)}
                  className="bg-brand-primary text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-brand-primary-dark"
                >
                  Join
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

export default GroupSessions;
