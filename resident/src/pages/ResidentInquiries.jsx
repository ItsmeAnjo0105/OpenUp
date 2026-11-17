import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  IconMessages,
  IconSearch,
  IconX,
  IconArrowLeft,
  IconPhone,
  IconCalendarEvent,
  IconCircleCheck,
  IconRotate,
  IconChevronDown,
  IconChevronUp,
  IconMapPin,
  IconUser,
  IconInbox,
} from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import InquiryChatPanel from '../components/InquiryChatPanel';
import CounselingSession from '../CounselingSession';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';
import { formatTimeRange } from '../utils/appointmentStatus';
import {
  BOOKING_STATUS_META,
  APPOINTMENT_STATUS_META,
  INQUIRY_STATUS_META,
  INQUIRY_FILTERS,
  PAYMENT_STATUS_LABEL,
  initialsOf,
  sessionTypeLabel,
  formatListTime,
} from '../utils/inquiryStatus';

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
];

function avatarColor(id) {
  const str = String(id);
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ id, name, size = 'w-11 h-11 text-sm' }) {
  return (
    <span className={`${size} ${avatarColor(id)} rounded-full flex items-center justify-center font-semibold shrink-0`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

export function BookingBadge({ status, size = 'sm' }) {
  const meta = BOOKING_STATUS_META[status] || BOOKING_STATUS_META.not_booked;
  return (
    <span
      title={meta.hint}
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold uppercase tracking-wide ${meta.className} ${
        size === 'sm' ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1'
      }`}
    >
      {meta.label}
    </span>
  );
}

function InquiryStatusTag({ status }) {
  const meta = INQUIRY_STATUS_META[status] || INQUIRY_STATUS_META.in_progress;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${meta.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
    </span>
  );
}

function formatAppointmentDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

// Appointment section shown under the resident's name inside a conversation.
function AppointmentSummary({ detail }) {
  const [showAll, setShowAll] = useState(false);
  const primary = detail.primary_appointment;
  const others = detail.appointments.filter((a) => a.booking_id !== primary?.booking_id);

  let body;
  if (detail.booking_status === 'booked' && primary) {
    body = (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 text-xs">
        <div><p className="text-brand-ink/45">Date</p><p className="font-medium">{formatAppointmentDate(primary.schedule)}</p></div>
        <div><p className="text-brand-ink/45">Time</p><p className="font-medium">{formatTimeRange(primary.schedule)}</p></div>
        <div><p className="text-brand-ink/45">Type</p><p className="font-medium">{sessionTypeLabel(primary.session_type)}</p></div>
        <div><p className="text-brand-ink/45">Payment</p><p className="font-medium text-emerald-700">{PAYMENT_STATUS_LABEL[primary.payment_status] || '—'}</p></div>
        <div><p className="text-brand-ink/45">Booking</p><p className="font-medium text-emerald-700">Confirmed{primary.rescheduled ? ' (rescheduled)' : ''}</p></div>
      </div>
    );
  } else if (detail.booking_status === 'awaiting_payment' && primary) {
    body = (
      <p className="text-xs text-amber-800">
        <span className="font-semibold">Appointment approved – Awaiting payment.</span>{' '}
        Requested for {formatAppointmentDate(primary.schedule)}, {formatTimeRange(primary.schedule)}.
      </p>
    );
  } else if (detail.booking_status === 'pending_approval' && primary) {
    body = (
      <p className="text-xs text-brand-ink/70">
        <span className="font-semibold">No confirmed appointment yet.</span>{' '}
        Request pending your approval for {formatAppointmentDate(primary.schedule)}, {formatTimeRange(primary.schedule)}.{' '}
        <Link to="/psychologist/schedule" className="text-brand-primary underline underline-offset-2">Review in Schedule</Link>
      </p>
    );
  } else {
    body = <p className="text-xs text-brand-ink/60 font-medium">No confirmed appointment yet.</p>;
  }

  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(47,93,80,0.05)', border: '1px solid rgba(47,93,80,0.10)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-primary">
          <IconCalendarEvent size={13} /> {detail.booking_status === 'booked' ? 'Next confirmed appointment' : 'Appointment'}
        </p>
        {others.length > 0 && (
          <button
            onClick={() => { playClick(); setShowAll((v) => !v); }}
            onMouseEnter={playHover}
            className="interactive-nav flex items-center gap-1 text-[11px] font-medium text-brand-primary"
          >
            {showAll ? 'Hide' : `View ${others.length} other appointment${others.length > 1 ? 's' : ''}`}
            {showAll ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
          </button>
        )}
      </div>
      {body}
      {showAll && (
        <ul className="mt-3 pt-3 border-t border-brand-ink/10 space-y-2">
          {others.map((a) => {
            const meta = APPOINTMENT_STATUS_META[a.appointment_status] || APPOINTMENT_STATUS_META.pending_approval;
            return (
              <li key={a.booking_id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  {formatAppointmentDate(a.schedule)} · {formatTimeRange(a.schedule)}
                  <span className="text-brand-ink/45"> · {sessionTypeLabel(a.session_type)}</span>
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.className}`}>{meta.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProfileModal({ detail, onClose }) {
  const r = detail.resident;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={`${r.name} profile`} className="relative bg-brand-surface rounded-2xl shadow-xl w-full max-w-md p-6">
        <button onClick={onClose} className="interactive absolute top-4 right-4 text-brand-ink/40 hover:text-brand-ink/70" aria-label="Close">
          <IconX size={18} />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <Avatar id={r.resident_id} name={r.name} size="w-14 h-14 text-lg" />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold truncate">{r.name}</p>
            <div className="mt-1"><BookingBadge status={detail.booking_status} size="md" /></div>
          </div>
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <IconUser size={15} className="text-brand-ink/40" />
            <dt className="text-brand-ink/50 w-28">Account</dt>
            <dd>Registered resident</dd>
          </div>
          <div className="flex items-center gap-2">
            <IconMapPin size={15} className="text-brand-ink/40" />
            <dt className="text-brand-ink/50 w-28">Barangay</dt>
            <dd>{r.barangay || 'Not provided'}</dd>
          </div>
          {r.member_since && (
            <div className="flex items-center gap-2">
              <IconCalendarEvent size={15} className="text-brand-ink/40" />
              <dt className="text-brand-ink/50 w-28">Member since</dt>
              <dd>{new Date(r.member_since).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <IconCalendarEvent size={15} className="text-brand-ink/40" />
            <dt className="text-brand-ink/50 w-28">Appointments</dt>
            <dd>{detail.appointments.length} with you</dd>
          </div>
        </dl>
        <p className="text-[11px] text-brand-ink/45 mt-5">
          Only the details needed to identify this resident are shown here. Contact details and wellness records stay private
          {r.is_client ? ' — wellness history is available in My Clients for residents you have sessions with.' : '.'}
        </p>
        {r.is_client && (
          <Link
            to={`/psychologist/clients/${r.resident_id}`}
            onClick={playClick}
            className="interactive mt-4 inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            Open client record
          </Link>
        )}
      </div>
    </div>
  );
}

function ResidentInquiries() {
  const user = getStoredUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inquiries, setInquiries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState(() => Number(searchParams.get('resident')) || null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [resolving, setResolving] = useState(false);

  const loadInquiries = useCallback(() => {
    fetch(`${API_URL}/psychologists/me/inquiries`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) { setInquiries(data); setError(''); }
        else setError(data?.error || 'Could not load resident inquiries.');
      })
      .catch(() => setError('Could not load resident inquiries.'))
      .finally(() => setLoaded(true));
  }, []);

  const loadDetail = useCallback((residentId) => {
    if (!residentId) return;
    fetch(`${API_URL}/psychologists/me/inquiries/${residentId}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) { setDetail(data); setDetailError(''); }
        else setDetailError(data?.error || 'Could not load this conversation.');
      })
      .catch(() => setDetailError('Could not load this conversation.'));
  }, []);

  useEffect(() => { loadInquiries(); }, [loadInquiries]);

  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);

  // Live sync: new messages, read receipts and ANY booking/payment change push
  // an event to this psychologist's own user channel; the badge is re-derived
  // server-side from the real records on each reload. A slow poll + refocus
  // reload also catch time-based changes (e.g. an unpaid request expiring).
  useEffect(() => {
    const socket = io(API_URL);
    socket.emit('join-user-channel', { token: localStorage.getItem('openup_token') });
    const refresh = () => {
      loadInquiries();
      if (activeId) loadDetail(activeId);
    };
    socket.on('inquiry-updated', refresh);
    socket.on('booking-updated', refresh);
    const poll = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      socket.disconnect();
      clearInterval(poll);
      window.removeEventListener('focus', refresh);
    };
  }, [activeId, loadInquiries, loadDetail]);

  const counts = useMemo(() => {
    const c = { all: inquiries.length };
    inquiries.forEach((i) => { c[i.inquiry_status] = (c[i.inquiry_status] || 0) + 1; });
    return c;
  }, [inquiries]);

  const totalUnread = useMemo(() => inquiries.reduce((n, i) => n + (i.unread_count || 0), 0), [inquiries]);

  const visible = useMemo(() => inquiries.filter((i) => {
    if (filter !== 'all' && i.inquiry_status !== filter) return false;
    if (search) {
      const needle = search.toLowerCase();
      if (!`${i.resident_name} ${i.last_message || ''}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  }), [inquiries, filter, search]);

  const activeRow = inquiries.find((i) => i.resident_id === activeId);
  const residentName = detail?.resident?.name || activeRow?.resident_name || '';

  const openConversation = (residentId) => {
    playClick();
    if (residentId !== activeId) {
      setDetail(null);
      setDetailError('');
      setInCall(false);
    }
    setActiveId(residentId);
    setSearchParams({ resident: String(residentId) }, { replace: true });
  };

  const closeConversation = () => {
    playClick();
    setActiveId(null);
    setDetail(null);
    setInCall(false);
    setSearchParams({}, { replace: true });
    loadInquiries();
  };

  const toggleResolved = async () => {
    if (!detail) return;
    playClick();
    setResolving(true);
    const action = detail.inquiry_status === 'resolved' ? 'reopen' : 'resolve';
    try {
      const res = await fetch(`${API_URL}/psychologists/me/inquiries/${activeId}/${action}`, { method: 'POST', headers: authHeader() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDetailError(data.error || 'Could not update this inquiry.');
      }
    } finally {
      setResolving(false);
      loadDetail(activeId);
      loadInquiries();
    }
  };

  const callBookingId = detail?.booking_status === 'booked' ? detail.primary_appointment?.booking_id : null;

  const toggleCall = () => {
    if (!callBookingId) return;
    playClick();
    setInCall((v) => {
      const next = !v;
      if (next) fetch(`${API_URL}/bookings/${callBookingId}/start-call`, { method: 'POST', headers: authHeader() }).catch(() => {});
      return next;
    });
  };

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconMessages size={22} className="text-brand-primary" /> Resident Inquiries
            {totalUnread > 0 && (
              <span className="text-[11px] font-semibold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center bg-red-500 text-white">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Respond to residents' questions, concerns, and requests for psychological support.
          </p>
        </div>
        <PsychologistTopBar />
      </div>

      <div className="grid lg:grid-cols-[minmax(19rem,22rem)_1fr] gap-4 lg:h-[calc(100vh-10rem)] lg:min-h-128">
        {/* ---- Conversation list ---- */}
        <section className={`bg-brand-surface rounded-2xl shadow-sm flex flex-col min-h-0 ${activeId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-3 space-y-2.5 border-b border-brand-ink/10">
            <div className="relative">
              <IconSearch size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search residents or messages..."
                className="w-full border border-brand-ink/15 rounded-full pl-9 pr-9 py-2 text-sm bg-brand-surface"
                aria-label="Search inquiries"
              />
              {search && (
                <button onClick={() => setSearch('')} className="interactive absolute right-3 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink/70" aria-label="Clear search">
                  <IconX size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 sidebar-scroll" role="tablist" aria-label="Filter by inquiry status">
              {INQUIRY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => { playClick(); setFilter(f.key); }}
                  onMouseEnter={playHover}
                  className={`interactive whitespace-nowrap text-[11px] font-medium px-2.5 py-1 rounded-full ${
                    filter === f.key ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/65'
                  }`}
                >
                  {f.label}{counts[f.key] ? ` · ${counts[f.key]}` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 min-h-0 max-h-[70vh] lg:max-h-none">
            {error && <p className="text-sm text-red-600 p-3">{error}</p>}
            {loaded && !error && inquiries.length === 0 && (
              <div className="text-center px-6 py-12">
                <IconInbox size={30} className="mx-auto text-brand-ink/25 mb-2" />
                <p className="text-sm text-brand-ink/50">No resident inquiries yet.</p>
                <p className="text-xs text-brand-ink/40 mt-1">When a resident messages you, their conversation appears here.</p>
              </div>
            )}
            {loaded && inquiries.length > 0 && visible.length === 0 && (
              <p className="text-sm text-brand-ink/50 p-3">No inquiries match this search or filter.</p>
            )}
            <ul className="flex flex-col gap-1">
              {visible.map((inq) => {
                const active = inq.resident_id === activeId;
                const unread = inq.unread_count > 0;
                return (
                  <li key={inq.resident_id}>
                    <button
                      onClick={() => openConversation(inq.resident_id)}
                      onMouseEnter={playHover}
                      className={`interactive-card w-full flex items-start gap-3 rounded-xl p-3 text-left border-l-4 ${
                        active ? 'border-brand-primary bg-brand-primary/10'
                          : unread ? 'border-brand-primary/60 bg-brand-primary/5' : 'border-transparent hover:bg-brand-ink/5'
                      }`}
                    >
                      <Avatar id={inq.resident_id} name={inq.resident_name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className={`text-sm truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{inq.resident_name}</p>
                          <BookingBadge status={inq.booking_status} />
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${unread ? 'text-brand-ink/80 font-medium' : 'text-brand-ink/50'}`}>
                          {inq.last_sender_role === 'psychologist' && <span className="text-brand-ink/40">You: </span>}
                          {inq.last_message}
                        </p>
                        <div className="mt-1"><InquiryStatusTag status={inq.inquiry_status} /></div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-[10px] ${unread ? 'text-brand-primary font-semibold' : 'text-brand-ink/40'}`}>
                          {formatListTime(inq.last_message_at)}
                        </span>
                        {unread && (
                          <span className="text-[10px] font-bold min-w-4.5 h-4.5 px-1 rounded-full flex items-center justify-center bg-brand-primary text-white" aria-label={`${inq.unread_count} unread`}>
                            {inq.unread_count > 9 ? '9+' : inq.unread_count}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---- Active conversation ---- */}
        <section className={`bg-brand-surface rounded-2xl shadow-sm flex-col min-h-0 overflow-hidden ${activeId ? 'flex' : 'hidden lg:flex'}`}>
          {!activeId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <span className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center mb-3">
                <IconMessages size={26} className="text-brand-primary" />
              </span>
              <p className="text-sm font-semibold">Select a conversation</p>
              <p className="text-xs text-brand-ink/50 mt-1 max-w-xs">
                Choose a resident on the left to read their messages, see their booking status, and reply.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-brand-ink/10 space-y-3 shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={closeConversation} onMouseEnter={playHover} className="interactive-nav lg:hidden text-brand-ink/60" aria-label="Back to inquiries">
                    <IconArrowLeft size={18} />
                  </button>
                  <button
                    onClick={() => { if (detail) { playClick(); setShowProfile(true); } }}
                    onMouseEnter={playHover}
                    className="interactive flex items-center gap-3 min-w-0 text-left"
                    title="View resident profile"
                  >
                    <Avatar id={activeId} name={residentName} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-base font-semibold truncate hover:underline underline-offset-2">{residentName || 'Loading...'}</p>
                        {detail && <BookingBadge status={detail.booking_status} size="md" />}
                      </div>
                      {detail && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <InquiryStatusTag status={detail.inquiry_status} />
                          {detail.resident.barangay && <span className="text-[11px] text-brand-ink/45 truncate">· {detail.resident.barangay}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {callBookingId && (
                      <button
                        onClick={toggleCall}
                        onMouseEnter={playHover}
                        className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full text-white"
                        style={{ backgroundColor: '#2b4d3f' }}
                      >
                        <IconPhone size={14} /> <span className="hidden sm:inline">{inCall ? 'End call' : 'Audio call'}</span>
                      </button>
                    )}
                    {detail && (
                      <button
                        onClick={toggleResolved}
                        onMouseEnter={playHover}
                        disabled={resolving}
                        className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 text-brand-ink/75 disabled:opacity-50"
                      >
                        {detail.inquiry_status === 'resolved'
                          ? <><IconRotate size={14} /> <span className="hidden sm:inline">Reopen</span></>
                          : <><IconCircleCheck size={14} /> <span className="hidden sm:inline">Mark resolved</span></>}
                      </button>
                    )}
                  </div>
                </div>
                {detailError && <p className="text-xs text-red-600">{detailError}</p>}
                {detail && <AppointmentSummary detail={detail} />}
              </div>

              {inCall && callBookingId && (
                <div className="p-4 border-b border-brand-ink/10 shrink-0">
                  <CounselingSession bookingId={callBookingId} name={user?.name} role={user?.role} />
                </div>
              )}

              <InquiryChatPanel
                key={activeId}
                myRole="psychologist"
                residentId={activeId}
                otherName={residentName}
                onActivity={() => { loadInquiries(); loadDetail(activeId); }}
                className="flex-1 h-[60vh] lg:h-auto"
              />
            </>
          )}
        </section>
      </div>

      {showProfile && detail && <ProfileModal detail={detail} onClose={() => setShowProfile(false)} />}
    </PsychologistLayout>
  );
}

export default ResidentInquiries;
