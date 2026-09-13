import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import ChatPanel from '../components/ChatPanel';
import CounselingSession from '../CounselingSession';
import { API_URL, authHeader, getStoredUser } from '../config';

function anonymizeResidentId(residentId) {
  return `Anonymous #${1000 + Number(residentId)}`;
}

function PsychologistChats() {
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [chattingWith, setChattingWith] = useState(null);
  const [inCallWith, setInCallWith] = useState(null);
  const user = getStoredUser();

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/bookings?status=confirmed`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setSessions(data);
        else setError(data?.error || 'Could not load your sessions.');
      })
      .catch(() => setError('Could not load your sessions.'));
  }, []);

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Anonymous Chats</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Message clients from your confirmed sessions. Their identity stays masked.
      </p>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {sessions.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No confirmed sessions yet.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.booking_id}>
                <div className="border border-brand-ink/10 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{anonymizeResidentId(s.resident_id)}</p>
                    <p className="text-xs text-brand-ink/60 mt-1">{new Date(s.schedule).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setInCallWith(inCallWith === s.booking_id ? null : s.booking_id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      {inCallWith === s.booking_id ? 'End call' : '📞 Audio call'}
                    </button>
                    <button
                      onClick={() => setChattingWith(chattingWith === s.booking_id ? null : s.booking_id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                    >
                      {chattingWith === s.booking_id ? 'Close chat' : 'Chat'}
                    </button>
                  </div>
                </div>
                {inCallWith === s.booking_id && (
                  <div className="mt-2">
                    <CounselingSession bookingId={s.booking_id} name={user.name} role={user.role} />
                  </div>
                )}
                {chattingWith === s.booking_id && (
                  <div className="mt-2">
                    <ChatPanel bookingId={s.booking_id} myRole="psychologist" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PsychologistLayout>
  );
}

export default PsychologistChats;
