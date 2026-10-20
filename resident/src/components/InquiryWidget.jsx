import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { IconUser, IconX, IconMinus, IconSend2 } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';

// Floating pre-booking inquiry chat, docked bottom-right -- lets a resident
// message a psychologist they haven't booked with yet. Real-time via the
// same socket-room pattern ChatPanel.jsx uses for booking chat, just keyed by
// (resident_id, psychologist_id) instead of a booking_id.
function InquiryWidget({ psychologist, residentId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  const psychologistId = psychologist.psychologist_id;
  const name = psychologist.User?.name || `Psychologist #${psychologistId}`;

  useEffect(() => {
    fetch(`${API_URL}/inquiries/${psychologistId}/messages`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setMessages(data) : setError(data.error)))
      .catch(() => setError('Could not load messages.'));

    const socket = io(API_URL);
    socketRef.current = socket;

    socket.emit('join-inquiry-chat', { residentId, psychologistId, token: localStorage.getItem('openup_token') });
    socket.on('chat-error', ({ error: err }) => setError(err));
    socket.on('new-inquiry-message', (message) => {
      if (message.psychologist_id === psychologistId && message.resident_id === residentId) {
        setMessages((prev) => [...prev, message]);
      }
    });

    return () => socket.disconnect();
  }, [psychologistId, residentId]);

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, minimized]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setError('');
    try {
      const res = await fetch(`${API_URL}/inquiries/${psychologistId}/messages`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send that.'); return; }
      // The socket event covers other open tabs/participants; add it here too
      // so this sender sees it instantly without waiting on their own echo.
      setMessages((prev) => (prev.some((m) => m.message_id === data.message_id) ? prev : [...prev, data]));
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-brand-surface rounded-2xl shadow-xl overflow-hidden flex flex-col" style={{ border: '1px solid rgba(28,36,32,0.1)', height: minimized ? 'auto' : '34rem' }}>
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0" style={{ backgroundColor: '#2b4d3f' }}>
        {psychologist.profile_photo_url ? (
          <img src={psychologist.profile_photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <IconUser size={16} color="white" />
          </span>
        )}
        <p className="text-sm font-semibold text-white truncate flex-1">{name}</p>
        <button onClick={() => setMinimized((v) => !v)} className="text-white/70 hover:text-white p-1">
          <IconMinus size={15} />
        </button>
        <button onClick={onClose} className="text-white/70 hover:text-white p-1">
          <IconX size={16} />
        </button>
      </div>

      {!minimized && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-40">
            {error && <p className="text-xs text-red-600 px-1">{error}</p>}
            {messages.length === 0 && !error && (
              <p className="text-xs text-brand-ink/40 text-center py-6">
                Ask {name.split(' ')[0]} a question before booking a session.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.message_id} className={`flex ${m.sender_role === 'resident' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] text-sm px-3 py-2 rounded-2xl ${
                    m.sender_role === 'resident' ? 'text-white' : 'bg-brand-ink/5 text-brand-ink'
                  }`}
                  style={m.sender_role === 'resident' ? { backgroundColor: '#2b4d3f' } : undefined}
                >
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="flex items-center gap-2 px-3 py-2.5 border-t border-brand-ink/10 shrink-0">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message"
              className="flex-1 text-sm border border-brand-ink/15 rounded-full px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-40"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              <IconSend2 size={15} />
            </button>
          </form>

          <p className="text-[10px] text-brand-ink/40 text-center pb-2 px-3">
            Not for emergencies. If you're in crisis, use the AI Crisis Companion.
          </p>
        </>
      )}
    </div>
  );
}

export default InquiryWidget;
