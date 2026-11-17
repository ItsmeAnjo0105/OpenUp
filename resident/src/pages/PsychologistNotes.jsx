import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

function PsychologistNotes() {
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/notes`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setNotes(data);
        else setError(data?.error || 'Could not load your notes.');
      })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Notes</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Private session notes across your clients -- only you can see these.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {notes.length === 0 && !error ? (
        <p className="text-sm text-brand-ink/50">
          No session notes yet -- notes you write during a session will show up here.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Link
              key={n.note_id}
              to={`/session/${n.booking_id}`}
              className="block bg-brand-surface rounded-2xl shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold">{n.Booking?.User?.name || 'Client'}</p>
                <p className="text-xs text-brand-ink/50">
                  {new Date(n.Booking?.schedule).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <p className="text-sm text-brand-ink/70 whitespace-pre-wrap line-clamp-3">{n.body}</p>
            </Link>
          ))}
        </div>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistNotes;
