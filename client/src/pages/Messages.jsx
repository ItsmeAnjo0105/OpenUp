import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  IconMessageCircle2,
  IconSearch,
  IconX,
  IconChevronRight,
  IconArrowLeft,
  IconPhone,
} from '@tabler/icons-react';
import Layout from '../components/Layout';
import InquiryChatPanel from '../components/InquiryChatPanel';
import CounselingSession from '../CounselingSession';
import { API_URL, authHeader, getStoredUser } from '../config';
import { initialsOf, formatListTime } from '../utils/inquiryStatus';

// Resident's side of Resident Inquiries: every psychologist they've messaged
// (with or without a booking). Replaces the old booking-only Anonymous Chat --
// history from that chat was migrated into these same threads.
function Messages() {
  const user = getStoredUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(() => Number(searchParams.get('psychologist')) || null);
  const [inCall, setInCall] = useState(false);

  const load = useCallback(() => {
    fetch(`${API_URL}/residents/me/inquiries`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) { setThreads(data); setError(''); }
        else setError(data?.error || 'Could not load your messages.');
      })
      .catch(() => setError('Could not load your messages.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    const socket = io(API_URL);
    socket.emit('join-user-channel', { token: localStorage.getItem('openup_token') });
    socket.on('inquiry-updated', load);
    socket.on('booking-updated', load);
    return () => socket.disconnect();
  }, [load]);

  const visible = useMemo(() => threads.filter((t) => {
    if (!search) return true;
    return `${t.psychologist_name} ${t.last_message || ''}`.toLowerCase().includes(search.toLowerCase());
  }), [threads, search]);

  const active = threads.find((t) => t.psychologist_id === activeId);

  const open = (psychologistId) => {
    setActiveId(psychologistId);
    setInCall(false);
    setSearchParams({ psychologist: String(psychologistId) }, { replace: true });
  };

  const back = () => {
    setActiveId(null);
    setInCall(false);
    setSearchParams({}, { replace: true });
    load();
  };

  if (!user) return null;

  if (activeId) {
    return (
      <Layout>
        <button onClick={back} className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
          <IconArrowLeft size={15} /> Back to Messages
        </button>

        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {active?.profile_photo_url ? (
              <img src={active.profile_photo_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-sm shrink-0">
                {initialsOf(active?.psychologist_name)}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{active?.psychologist_name || 'Psychologist'}</p>
              <p className="text-xs text-brand-ink/50">
                {active?.call_schedule
                  ? `Confirmed session: ${new Date(active.call_schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`
                  : 'Only you and this psychologist can see this conversation.'}
              </p>
            </div>
          </div>
          {active?.call_booking_id && (
            <button
              onClick={() => {
                setInCall((v) => {
                  const next = !v;
                  if (next) fetch(`${API_URL}/bookings/${active.call_booking_id}/start-call`, { method: 'POST', headers: authHeader() }).catch(() => {});
                  return next;
                });
              }}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white shrink-0"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              <IconPhone size={14} /> {inCall ? 'End call' : 'Audio call'}
            </button>
          )}
        </div>

        {inCall && active?.call_booking_id && (
          <div className="mb-6">
            <CounselingSession bookingId={active.call_booking_id} name={user.name} role={user.role} />
          </div>
        )}

        <InquiryChatPanel
          key={activeId}
          myRole="resident"
          residentId={user.user_id}
          psychologistId={activeId}
          otherName={active?.psychologist_name}
          onActivity={load}
          className="rounded-2xl shadow-sm overflow-hidden h-[60vh] min-h-[24rem]"
        />
        <p className="text-[11px] text-brand-ink/40 text-center mt-3">
          Not for emergencies. If you're in crisis, use the AI Crisis Companion or call a hotline.
        </p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-1">
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <IconMessageCircle2 size={22} className="text-brand-primary" /> Messages
        </h1>
        <p className="text-brand-ink/60 text-sm">
          Your conversations with psychologists. Only you and they can see each conversation.
        </p>
      </div>

      <div className="relative mt-5 mb-5">
        <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="w-full border border-brand-ink/15 rounded-full pl-10 pr-10 py-2.5 text-sm bg-brand-surface"
        />
        {search && (
          <button onClick={() => setSearch('')} className="interactive absolute right-4 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink/70">
            <IconX size={15} />
          </button>
        )}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-3">
        {error && <p className="text-sm text-red-600 p-3">{error}</p>}
        {loaded && !error && threads.length === 0 && (
          <p className="text-sm text-brand-ink/50 p-3">
            No messages yet. You can ask any psychologist a question — no booking needed — from{' '}
            <Link to="/booking" className="text-brand-primary underline underline-offset-2">Book Counseling</Link>.
          </p>
        )}
        {loaded && threads.length > 0 && visible.length === 0 && (
          <p className="text-sm text-brand-ink/50 p-3">No messages match this search.</p>
        )}
        <div className="flex flex-col gap-2">
          {visible.map((t) => {
            const unread = t.unread_count > 0;
            return (
              <button
                key={t.psychologist_id}
                onClick={() => open(t.psychologist_id)}
                className={`interactive-card flex items-center gap-4 rounded-xl p-4 text-left border-l-4 ${
                  unread ? 'border-brand-primary bg-brand-primary/5' : 'border-transparent hover:bg-brand-ink/5'
                }`}
              >
                {t.profile_photo_url ? (
                  <img src={t.profile_photo_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold text-sm shrink-0">
                    {initialsOf(t.psychologist_name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{t.psychologist_name}</p>
                    {unread && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
                        {t.unread_count} new
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-brand-ink/50 truncate mt-0.5">
                    {t.last_sender_role === 'resident' && 'You: '}{t.last_message}
                  </p>
                </div>
                <p className="text-xs text-brand-ink/40 whitespace-nowrap">{formatListTime(t.last_message_at)}</p>
                <IconChevronRight size={16} className="text-brand-ink/30 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}

export default Messages;
