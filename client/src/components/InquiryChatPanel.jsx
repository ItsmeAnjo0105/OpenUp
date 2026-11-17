import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { IconSend2, IconChecks, IconCheck } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// One Resident Inquiries thread (a resident <-> psychologist pair). Used by the
// psychologist's Resident Inquiries page and the resident's Messages page.
// Real-time via the 'inquiry-<residentId>-<psychologistId>' socket room; the
// server re-verifies membership from the JWT before letting the socket join.
//
// Props:
//   myRole          'psychologist' | 'resident'
//   residentId      always required (socket room key)
//   psychologistId  required for residents; a psychologist's own id is
//                   resolved server-side and never trusted from the client
//   otherName       shown above the other side's messages
//   onActivity      called after a send / incoming message (to refresh lists)
function InquiryChatPanel({ myRole, residentId, psychologistId, otherName, onActivity, className = '' }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const onActivityRef = useRef(onActivity);
  useEffect(() => { onActivityRef.current = onActivity; }, [onActivity]);

  const messagesUrl = myRole === 'psychologist'
    ? `${API_URL}/psychologists/me/inquiries/${residentId}/messages`
    : `${API_URL}/inquiries/${psychologistId}/messages`;

  useEffect(() => {
    // Callers remount this per thread (key=...), so state starts fresh.
    let cancelled = false;

    // GET also marks the other side's messages as read server-side.
    const load = () => fetch(messagesUrl, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (ok && Array.isArray(data)) setMessages(data);
        else setError(data?.error || 'Could not load messages.');
      })
      .catch(() => !cancelled && setError('Could not load messages.'))
      .finally(() => !cancelled && setLoading(false));

    load();

    const socket = io(API_URL);
    socket.emit('join-inquiry-chat', {
      residentId,
      psychologistId: myRole === 'resident' ? psychologistId : undefined,
      token: localStorage.getItem('openup_token'),
    });
    socket.on('chat-error', ({ error: err }) => setError(err));
    socket.on('new-inquiry-message', (message) => {
      if (Number(message.resident_id) !== Number(residentId)) return;
      if (myRole === 'resident' && Number(message.psychologist_id) !== Number(psychologistId)) return;
      setMessages((prev) => (prev.some((m) => m.message_id === message.message_id) ? prev : [...prev, message]));
      // Seeing it live while the thread is open counts as reading it.
      if (message.sender_role !== myRole) {
        load();
        onActivityRef.current?.();
      }
    });
    socket.on('inquiry-read', ({ reader_role: readerRole, read_at: readAt }) => {
      if (readerRole === myRole) return;
      setMessages((prev) => prev.map((m) => (m.sender_role === myRole && !m.read_at ? { ...m, read_at: readAt } : m)));
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [messagesUrl, residentId, psychologistId, myRole]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(messagesUrl, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not send that.'); return; }
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.message_id === data.message_id) ? prev : [...prev, data]));
      onActivityRef.current?.();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSending(false);
    }
  };

  const lastMineId = [...messages].reverse().find((m) => m.sender_role === myRole)?.message_id;

  return (
    <div className={`bg-brand-surface flex flex-col min-h-0 ${className}`}>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 min-h-0" style={{ backgroundColor: 'rgba(241,244,240,0.55)' }}>
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}
        {loading && messages.length === 0 && (
          <p className="text-sm text-brand-ink/40 text-center py-10">Loading conversation...</p>
        )}
        {!loading && messages.length === 0 && !error && (
          <p className="text-sm text-brand-ink/40 text-center py-10">No messages yet.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_role === myRole;
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const showName = !mine && (newDay || prev?.sender_role !== m.sender_role);
          return (
            <div key={m.message_id}>
              {newDay && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-brand-ink/40 bg-brand-surface px-3 py-1 rounded-full shadow-sm">
                    {dayLabel(m.created_at)}
                  </span>
                </div>
              )}
              {showName && otherName && (
                <p className="text-[11px] font-medium text-brand-ink/50 ml-1 mt-2 mb-0.5">{otherName}</p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] text-sm px-3.5 py-2 rounded-2xl whitespace-pre-wrap break-words ${
                    mine ? 'text-white rounded-br-md' : 'bg-brand-surface text-brand-ink rounded-bl-md shadow-sm'
                  }`}
                  style={mine ? { backgroundColor: '#2b4d3f' } : { border: '1px solid rgba(28,36,32,0.06)' }}
                >
                  {m.body}
                  <span className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${mine ? 'text-white/60' : 'text-brand-ink/40'}`}>
                    {new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    {mine && (m.read_at
                      ? <IconChecks size={12} className="text-emerald-300" aria-label="Read" />
                      : <IconCheck size={12} aria-label="Sent" />)}
                  </span>
                </div>
              </div>
              {mine && m.message_id === lastMineId && (
                <p className="text-[10px] text-brand-ink/40 text-right mr-1 mt-0.5">
                  {m.read_at ? `Seen ${new Date(m.read_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}` : 'Delivered'}
                </p>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 p-3 border-t border-brand-ink/10 shrink-0">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          rows={1}
          placeholder={myRole === 'psychologist' ? 'Write a reply... (Shift+Enter for a new line)' : 'Write a message...'}
          className="flex-1 resize-none max-h-32 text-sm border border-brand-ink/15 rounded-2xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-brand-surface"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="interactive flex items-center gap-1.5 h-10 px-4 rounded-full text-white text-sm font-medium shrink-0 disabled:opacity-40"
          style={{ backgroundColor: '#2b4d3f' }}
        >
          <IconSend2 size={15} /> <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
}

export default InquiryChatPanel;
