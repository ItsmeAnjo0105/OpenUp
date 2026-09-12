import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, authHeader } from '../config';

// Shared by both the resident and psychologist dashboards. sender_role is the only
// identity the server ever returns for a message ('resident' or 'psychologist') --
// this component never has a real name to display even if it wanted to.
function ChatPanel({ bookingId, myRole }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/bookings/${bookingId}/messages`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setMessages(data) : setError(data.error)))
      .catch(() => setError('Could not load messages.'));

    const socket = io(API_URL);
    socketRef.current = socket;

    socket.emit('join-booking-chat', { bookingId, token: localStorage.getItem('openup_token') });
    socket.on('chat-error', ({ error }) => setError(error));
    socket.on('new-message', (message) => {
      if (message.booking_id === Number(bookingId)) {
        setMessages((prev) => [...prev, message]);
      }
    });

    return () => socket.disconnect();
  }, [bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;

    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/messages`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send message.');
        return;
      }
      setDraft('');
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <div className="border border-brand-ink/10 rounded-xl overflow-hidden flex flex-col h-96">
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-brand-bg">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {messages.map((m) => (
          <div
            key={m.message_id}
            className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
              m.sender_role === myRole
                ? 'ml-auto bg-brand-primary text-white'
                : 'bg-brand-surface text-brand-ink border border-brand-ink/10'
            }`}
          >
            <p>{m.body}</p>
            <p className={`text-[10px] mt-0.5 ${m.sender_role === myRole ? 'text-white/70' : 'text-brand-ink/40'}`}>
              {m.sender_role === 'resident' ? 'Resident' : 'Counselor'}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex border-t border-brand-ink/10">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 text-sm focus:outline-none"
        />
        <button type="submit" className="px-4 text-sm font-medium text-brand-primary">
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
