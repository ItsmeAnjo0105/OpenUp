import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, authHeader } from '../config';

// Chat embedded on the Session page. /bookings/:id/messages is a window onto
// the same resident <-> psychologist Resident Inquiries thread this booking
// belongs to, so messages here and on Resident Inquiries / Messages are one
// conversation. Only that booking's two participants can read or post.
function ChatPanel({ bookingId, myRole }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    let pair = null;
    fetch(`${API_URL}/bookings/${bookingId}/messages`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return setError(data.error);
        setMessages(data);
        if (data[0]) pair = { resident_id: data[0].resident_id, psychologist_id: data[0].psychologist_id };
      })
      .catch(() => setError('Could not load messages.'));

    const socket = io(API_URL);
    // The server joins this socket to the booking's pair thread room after
    // verifying the JWT belongs to one of the booking's participants.
    socket.emit('join-booking-chat', { bookingId, token: localStorage.getItem('openup_token') });
    socket.on('chat-error', ({ error: err }) => setError(err));
    socket.on('new-inquiry-message', (message) => {
      if (pair && (Number(message.resident_id) !== Number(pair.resident_id) || Number(message.psychologist_id) !== Number(pair.psychologist_id))) return;
      setMessages((prev) => (prev.some((m) => m.message_id === message.message_id) ? prev : [...prev, message]));
    });

    return () => socket.disconnect();
  }, [bookingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
      setMessages((prev) => (prev.some((m) => m.message_id === data.message_id) ? prev : [...prev, data]));
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
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className={`text-[10px] mt-0.5 ${m.sender_role === myRole ? 'text-white/70' : 'text-brand-ink/40'}`}>
              {m.sender_role === 'resident' ? 'Resident' : 'Psychologist'} ·{' '}
              {new Date(m.created_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
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
