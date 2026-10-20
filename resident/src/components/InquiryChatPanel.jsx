import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { IconSend2 } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';

// Psychologist's side of a pre-booking inquiry thread -- same socket-room
// pattern as ChatPanel/InquiryWidget, just always sending as 'psychologist'
// and with no anonymity toggle (inquiries are never anonymous).
function InquiryChatPanel({ residentId }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/inquiries/${residentId}/messages`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setMessages(data) : setError(data.error)))
      .catch(() => setError('Could not load messages.'));

    const socket = io(API_URL);
    socketRef.current = socket;

    // psychologistId is resolved server-side from the caller's own JWT for a
    // psychologist joining (never trusted from the client), so it's omitted here.
    socket.emit('join-inquiry-chat', { residentId, token: localStorage.getItem('openup_token') });
    socket.on('chat-error', ({ error: err }) => setError(err));
    socket.on('new-inquiry-message', (message) => {
      if (message.resident_id === Number(residentId)) {
        setMessages((prev) => (prev.some((m) => m.message_id === message.message_id) ? prev : [...prev, message]));
      }
    });

    return () => socket.disconnect();
  }, [residentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setError('');
    try {
      const res = await fetch(`${API_URL}/psychologists/me/inquiries/${residentId}/messages`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send that.'); return; }
      setMessages((prev) => (prev.some((m) => m.message_id === data.message_id) ? prev : [...prev, data]));
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm flex flex-col" style={{ height: '28rem' }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {messages.length === 0 && !error && (
          <p className="text-sm text-brand-ink/40 text-center py-10">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m.message_id} className={`flex ${m.sender_role === 'psychologist' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] text-sm px-3.5 py-2 rounded-2xl ${
                m.sender_role === 'psychologist' ? 'text-white' : 'bg-brand-ink/5 text-brand-ink'
              }`}
              style={m.sender_role === 'psychologist' ? { backgroundColor: '#2b4d3f' } : undefined}
            >
              {m.body}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-brand-ink/10">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply to this enquiry..."
          className="flex-1 text-sm border border-brand-ink/15 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-40"
          style={{ backgroundColor: '#2b4d3f' }}
        >
          <IconSend2 size={16} />
        </button>
      </form>
    </div>
  );
}

export default InquiryChatPanel;
