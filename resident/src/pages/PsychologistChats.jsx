import { useEffect, useMemo, useState } from 'react';
import {
  IconMessageCircle2,
  IconSearch,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
  IconPhone,
  IconMessage,
  IconUserCircle,
} from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import ChatPanel from '../components/ChatPanel';
import CounselingSession from '../CounselingSession';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

function anonymizeResidentId(residentId) {
  return `Anonymous #${1000 + Number(residentId)}`;
}

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
];

function colorForId(id) {
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Chats' },
  { key: 'awaiting', label: 'Awaiting your reply' },
  { key: 'replied', label: 'Replied' },
];

function PsychologistChats() {
  const [chats, setChats] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const user = getStoredUser();

  const loadChats = () => {
    fetch(`${API_URL}/psychologists/me/chats`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setChats(data);
        else setError(data?.error || 'Could not load your chats.');
      })
      .catch(() => setError('Could not load your chats.'));
  };

  useEffect(() => { loadChats(); }, []);

  const visibleChats = useMemo(() => chats
    .filter((c) => {
      if (filter === 'awaiting' && !c.awaiting_reply) return false;
      if (filter === 'replied' && c.awaiting_reply) return false;
      if (search) {
        const needle = search.toLowerCase();
        const haystack = `${anonymizeResidentId(c.resident_id)} ${c.last_message || ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    }), [chats, filter, search]);

  const activeChat = chats.find((c) => c.booking_id === activeBookingId);

  const openChat = (bookingId, startCall = false) => {
    playClick();
    setActiveBookingId(bookingId);
    setInCall(startCall);
  };

  const goBack = () => {
    playClick();
    setActiveBookingId(null);
    setInCall(false);
    loadChats();
  };

  if (activeChat) {
    const color = colorForId(activeChat.resident_id);
    return (
      <PsychologistLayout>
        <button onClick={goBack} onMouseEnter={playHover} className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
          <IconArrowLeft size={15} /> Back to Chats
        </button>

        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-full ${color.bg} ${color.text} flex items-center justify-center shrink-0`}>
              <IconUserCircle size={22} />
            </span>
            <div>
              <p className="text-sm font-semibold">{anonymizeResidentId(activeChat.resident_id)}</p>
              <p className="text-xs text-brand-ink/50">{new Date(activeChat.schedule).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { playClick(); setInCall((v) => !v); }}
              onMouseEnter={playHover}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              <IconPhone size={14} /> {inCall ? 'End call' : 'Audio call'}
            </button>
            <PsychologistTopBar />
          </div>
        </div>

        {inCall && (
          <div className="mb-6">
            <CounselingSession bookingId={activeChat.booking_id} name={user.name} role={user.role} />
          </div>
        )}

        <ChatPanel bookingId={activeChat.booking_id} myRole="psychologist" />
      </PsychologistLayout>
    );
  }

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconMessageCircle2 size={22} className="text-brand-primary" /> Anonymous Chats
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Message clients from your confirmed sessions. Their identity stays masked.
          </p>
        </div>
        <PsychologistTopBar />
      </div>

      <div className="flex items-center gap-3 mt-6 mb-5">
        <div className="relative flex-1">
          <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full border border-brand-ink/15 rounded-full pl-10 pr-10 py-2.5 text-sm bg-brand-surface"
          />
          {search && (
            <button onClick={() => setSearch('')} className="interactive absolute right-4 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink/70">
              <IconX size={15} />
            </button>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => { playClick(); setFilterMenuOpen((v) => !v); }}
            onMouseEnter={playHover}
            className="interactive flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            {FILTER_OPTIONS.find((f) => f.key === filter)?.label} <IconChevronDown size={14} />
          </button>
          {filterMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-brand-surface rounded-xl shadow-md py-1 z-20" style={{ border: '1px solid rgba(28,36,32,0.08)' }}>
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { playClick(); setFilter(opt.key); setFilterMenuOpen(false); }}
                    onMouseEnter={playHover}
                    className={`interactive-nav w-full text-left px-3 py-2 text-sm ${filter === opt.key ? 'text-brand-primary font-medium' : 'text-brand-ink/70'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-3">
        {error && <p className="text-sm text-red-600 p-3">{error}</p>}

        {chats.length === 0 && !error ? (
          <p className="text-sm text-brand-ink/50 p-3">No confirmed sessions yet.</p>
        ) : visibleChats.length === 0 ? (
          <p className="text-sm text-brand-ink/50 p-3">No chats match this search or filter.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleChats.map((c) => {
              const color = colorForId(c.resident_id);
              return (
                <button
                  key={c.booking_id}
                  onClick={() => openChat(c.booking_id)}
                  onMouseEnter={playHover}
                  className={`interactive-card flex items-center gap-4 rounded-xl p-4 text-left border-l-4 ${
                    c.awaiting_reply ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent hover:bg-brand-ink/5'
                  }`}
                >
                  <span className={`w-11 h-11 rounded-full ${color.bg} ${color.text} flex items-center justify-center shrink-0`}>
                    <IconUserCircle size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{anonymizeResidentId(c.resident_id)}</p>
                      {c.awaiting_reply && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
                          New message
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brand-ink/50 truncate mt-0.5">
                      {c.last_message || 'No messages yet.'}
                    </p>
                  </div>
                  <p className="text-xs text-brand-ink/40 whitespace-nowrap hidden md:block">
                    {new Date(c.last_message_at || c.schedule).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      onClick={(e) => { e.stopPropagation(); openChat(c.booking_id, true); }}
                      onMouseEnter={playHover}
                      role="button"
                      tabIndex={-1}
                      className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full text-white"
                      style={{ backgroundColor: '#2b4d3f' }}
                    >
                      <IconPhone size={13} /> Audio call
                    </span>
                    <span
                      onClick={(e) => { e.stopPropagation(); openChat(c.booking_id); }}
                      onMouseEnter={playHover}
                      role="button"
                      tabIndex={-1}
                      className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15"
                    >
                      <IconMessage size={13} /> Chat
                    </span>
                    <IconChevronRight size={16} className="text-brand-ink/30" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PsychologistLayout>
  );
}

export default PsychologistChats;
