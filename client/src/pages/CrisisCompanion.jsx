import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconHistory, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const GREETING = { role: 'assistant', content: "Hi, I'm here with you. What's on your mind today?" };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const PREFERENCES = [
  { value: 'listen', label: 'Just listen' },
  { value: 'advice', label: 'I need advice' },
  { value: 'understand', label: 'Help me understand my feelings' },
  { value: 'calm', label: 'Help me calm down' },
];

// The companion is told not to use markdown (see COMPANION_SYSTEM_PROMPT), but
// this is a safety net for whatever slips through anyway: splits into
// paragraph/list-item lines and turns any stray **bold** into real emphasis,
// instead of showing literal asterisks and a wall of run-together text.
function formatCompanionMessage(content) {
  const lines = content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const isListItem = /^(\d+[.)]|[-•])\s+/.test(line);
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, j) => (
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
        : <span key={j}>{part}</span>
    ));
    return (
      <p key={i} className={isListItem ? 'pl-3 -indent-3' : ''}>
        {parts}
      </p>
    );
  });
}

function CrisisCompanion() {
  const [messages, setMessages] = useState([GREETING]);
  const [conversationId, setConversationId] = useState(null);
  const [preference, setPreference] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [matching, setMatching] = useState(false);
  const [crisisStatus, setCrisisStatus] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [alertedIds, setAlertedIds] = useState([]);
  const [alertError, setAlertError] = useState('');
  const [rating, setRating] = useState(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const bottomRef = useRef(null);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!crisisDetected || !user) return;
    fetch(`${API_URL}/trusted-contacts`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setContacts(data); })
      .catch(() => {});
    fetch(`${API_URL}/emergency-contacts`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setEmergencyContacts(data); })
      .catch(() => {});
  }, [crisisDetected]);

  const handleAlertContact = async (contactId) => {
    setAlertError('');
    try {
      const res = await fetch(`${API_URL}/trusted-contacts/${contactId}/alert`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setAlertError(data.error || 'Could not log this alert.');
        return;
      }
      setAlertedIds((prev) => [...prev, contactId]);
    } catch {
      setAlertError('Could not reach the server.');
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch(`${API_URL}/crisis-companion/chat`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: newMessages, conversation_id: conversationId, preference }),
      });
      const data = await res.json();

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      if (data.crisis_detected) setCrisisDetected(true);
      if (data.conversation_id) setConversationId(data.conversation_id);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  const startNewConversation = () => {
    playClick();
    setMessages([GREETING]);
    setConversationId(null);
    setPreference(null);
    setCrisisDetected(false);
    setCrisisStatus(null);
    setRating(null);
    setRatingSubmitted(false);
    setHistoryOpen(false);
  };

  const loadConversations = () => {
    setHistoryError('');
    fetch(`${API_URL}/crisis-companion/conversations`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setConversations(data);
        else setHistoryError(data?.error || 'Could not load your conversation history.');
      })
      .catch(() => setHistoryError('Could not reach the server.'));
  };

  const openHistory = () => {
    playClick();
    loadConversations();
    setHistoryOpen(true);
  };

  const openConversation = async (id) => {
    playClick();
    setLoadingConversation(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_URL}/crisis-companion/conversations/${id}/messages`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) { setHistoryError(data?.error || 'Could not load this conversation.'); return; }
      setMessages([GREETING, ...data.map((m) => ({ role: m.role, content: m.content }))]);
      setConversationId(id);
      setPreference(null);
      setCrisisDetected(data.some((m) => m.crisis_detected));
      setCrisisStatus(null);
      setRating(null);
      setRatingSubmitted(false);
      setHistoryOpen(false);
    } catch {
      setHistoryError('Could not reach the server.');
    } finally {
      setLoadingConversation(false);
    }
  };

  const deleteConversation = (conversation) => {
    setConfirmDialog({
      title: 'Delete this conversation?',
      message: `"${conversation.title}" will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`${API_URL}/crisis-companion/conversations/${conversation.conversation_id}`, {
          method: 'DELETE',
          headers: authHeader(),
        });
        if (res.ok) {
          if (conversation.conversation_id === conversationId) startNewConversation();
          loadConversations();
        }
      },
    });
  };

  const submitRating = async (value) => {
    setRating(value);
    try {
      const res = await fetch(`${API_URL}/crisis-companion/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, rating: value }),
      });
      if (res.ok) setRatingSubmitted(true);
    } catch {
      // leave the stars selected so the user can retry
    }
  };

  const handleCrisisMatch = async () => {
    setMatching(true);
    try {
      const res = await fetch(`${API_URL}/crisis-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id }),
      });
      const data = await res.json();

      if (data.matched) {
        navigate(`/session/${data.booking.booking_id}`);
      } else {
        setCrisisStatus('queued');
      }
    } catch {
      setCrisisStatus('error');
    } finally {
      setMatching(false);
    }
  };

  if (!user) return null;

  return (
    <Layout>
      <div className="max-w-xl mx-auto flex flex-col h-[80vh]">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="font-display text-2xl font-semibold">AI Crisis Companion</h1>
          <div className="flex gap-2 shrink-0 mt-0.5">
            <button
              onClick={startNewConversation}
              onMouseEnter={playHover}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 flex items-center gap-1"
            >
              <IconPlus size={14} /> New chat
            </button>
            <button
              onClick={openHistory}
              onMouseEnter={playHover}
              className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 flex items-center gap-1"
            >
              <IconHistory size={14} /> History
            </button>
          </div>
        </div>
        <p className="text-brand-ink/60 text-sm mb-4">
          A private, judgment-free space to talk. Not a replacement for professional care.
          {loadingConversation && <span className="text-brand-ink/40"> Loading conversation...</span>}
        </p>

        {crisisDetected && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-4">
            <p className="text-sm text-purple-900 mb-4">
              It sounds like you might be going through something serious. Connecting with a
              licensed psychologist can help.
            </p>
            {crisisStatus === 'queued' ? (
              <div className="text-sm text-purple-900">
                <p>No one is free this exact moment, but you're first in line.</p>
                {emergencyContacts.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="font-medium">If you need help right now:</p>
                    {emergencyContacts.map((c) => (
                      <p key={c.contact_id}>
                        {c.name}: <a href={`tel:${c.phone}`} className="underline font-medium">{c.phone}</a>
                        {c.description && <span className="text-purple-900/70"> -- {c.description}</span>}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-purple-900/70">
                    No verified crisis hotline is configured yet. Please contact your nearest hospital
                    or barangay emergency services directly.
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={handleCrisisMatch}
                disabled={matching}
                className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
              >
                {matching ? 'Connecting...' : 'Connect with a Licensed Psychologist'}
              </button>
            )}

            {alertError && <p className="text-xs text-red-600 mt-3">{alertError}</p>}

            {contacts.length > 0 ? (
              <div className="mt-4 pt-4 border-t border-purple-200">
                <p className="text-xs text-purple-900/70 mb-2">
                  Or let someone you trust know you're struggling right now:
                </p>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c) => (
                    <button
                      key={c.contact_id}
                      onClick={() => handleAlertContact(c.contact_id)}
                      disabled={alertedIds.includes(c.contact_id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-purple-300 text-purple-900 disabled:opacity-50"
                    >
                      {alertedIds.includes(c.contact_id) ? `Logged for ${c.name}` : `Alert ${c.name}`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-purple-900/50 mt-2">
                  This records that you asked to reach out to them — please still contact them
                  yourself if you can, since automatic delivery isn't set up yet.
                </p>
              </div>
            ) : (
              <p className="text-xs text-purple-900/60 mt-4 pt-4 border-t border-purple-200">
                Add a trusted contact in your <a href="/profile" className="underline">Profile</a> to
                be able to reach out to them from here.
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto chat-scroll space-y-3.5 mb-4 pr-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <span className="w-7 h-7 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-sm shrink-0">
                  💚
                </span>
              )}
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed break-words space-y-1.5 ${
                m.role === 'user'
                  ? 'bg-brand-primary text-white rounded-br-md'
                  : 'bg-brand-surface shadow-sm text-brand-ink/80 rounded-bl-md'
              }`}>
                {m.role === 'assistant' ? formatCompanionMessage(m.content) : m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {messages.length > 2 && (
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <p className="text-xs text-brand-ink/50">
              {ratingSubmitted ? 'Thanks for letting us know.' : 'How helpful has this conversation been?'}
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={ratingSubmitted}
                  onClick={() => submitRating(star)}
                  className="text-lg leading-none disabled:cursor-default"
                  aria-label={`Rate ${star} out of 5`}
                >
                  {rating != null && star <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {PREFERENCES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { playClick(); setPreference((prev) => (prev === p.value ? null : p.value)); }}
              onMouseEnter={playHover}
              className={`interactive text-[11px] font-medium px-3 py-1.5 rounded-full border ${
                preference === p.value
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'border-brand-ink/15 text-brand-ink/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type how you're feeling..."
            className="flex-1 border border-brand-ink/15 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-medium hover:bg-brand-primary-dark disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8" onClick={() => setHistoryOpen(false)}>
          <div
            className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-md w-full max-h-[80vh] overflow-y-auto chat-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">Conversation history</p>
              <button onClick={() => setHistoryOpen(false)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>
            <p className="text-xs text-brand-ink/50 mb-4">Only you can see your own conversations.</p>

            {historyError && <p className="text-sm text-red-600 mb-3">{historyError}</p>}

            {conversations.length === 0 ? (
              <p className="text-sm text-brand-ink/50">No past conversations yet.</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((c) => (
                  <div
                    key={c.conversation_id}
                    className={`flex items-center gap-2 border rounded-xl p-3 ${
                      c.conversation_id === conversationId ? 'border-brand-primary' : 'border-brand-ink/10'
                    }`}
                  >
                    <button
                      onClick={() => openConversation(c.conversation_id)}
                      onMouseEnter={playHover}
                      className="interactive flex-1 text-left min-w-0"
                    >
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {c.crisis_detected && <span title="Flagged for crisis language">⚠️</span>}
                        {c.title}
                      </p>
                      <p className="text-xs text-brand-ink/50 mt-0.5">{fmtDate(c.last_message_at)}</p>
                    </button>
                    <button
                      onClick={() => deleteConversation(c)}
                      onMouseEnter={playHover}
                      className="interactive text-brand-ink/40 hover:text-red-600 p-1.5 shrink-0"
                      aria-label="Delete conversation"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </Layout>
  );
}

export default CrisisCompanion;
