import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconSearch,
  IconX,
  IconCircleCheck,
  IconChevronRight,
  IconAlertCircle,
  IconChevronDown,
  IconChevronUp,
  IconCalendarOff,
} from '@tabler/icons-react';
import AppointmentDetailModal from './AppointmentDetailModal';
import { API_URL, authHeader } from '../../config';
import { playHover, playClick } from '../../utils/sound';
import { formatTimeRange, residentName, typeLabel } from '../../utils/appointmentStatus';
import { initialsOf } from '../../utils/inquiryStatus';

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

// Residents have no profile photo in this app, so the "picture" is initials --
// same treatment as Resident Inquiries.
function Avatar({ booking }) {
  return (
    <span className={`w-9 h-9 rounded-full ${avatarColor(booking.resident_id)} flex items-center justify-center text-xs font-semibold shrink-0`} aria-hidden="true">
      {initialsOf(residentName(booking))}
    </span>
  );
}

const SESSION_TYPES = [
  { value: 'all', label: 'All session types' },
  { value: 'counseling', label: 'Counseling Session' },
  { value: 'crisis', label: 'Crisis Session' },
];

function paymentOf(b) {
  const payments = Array.isArray(b.Payment) ? b.Payment : [];
  return payments.find((p) => p.status === 'paid') || payments[0] || null;
}

function PaymentBadge({ booking }) {
  const p = paymentOf(booking);
  if (p?.status === 'paid') {
    return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{booking.care_credit_id != null ? 'Paid · Care Credit' : 'Paid'}</span>;
  }
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{p?.status || 'No payment'}</span>;
}

function CompletedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary">
      <IconCircleCheck size={12} /> Completed
    </span>
  );
}

const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const localDateKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Appointment Management > Completed Sessions. Lists ONLY bookings explicitly
// marked completed (Booking.completed_at). Past paid sessions nobody has marked
// yet are shown in a separate, collapsible "awaiting confirmation" notice and are
// never counted in the total.
function CompletedSessions({ sessionPrice, onChanged }) {
  const [completed, setCompleted] = useState([]);
  const [awaiting, setAwaiting] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [sessionType, setSessionType] = useState('all');
  const [showAwaiting, setShowAwaiting] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    fetch(`${API_URL}/psychologists/me/completed-sessions`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setCompleted(Array.isArray(data.completed) ? data.completed : []);
          setAwaiting(Array.isArray(data.awaiting_completion) ? data.awaiting_completion : []);
          setError('');
        } else setError(data?.error || 'Could not load completed sessions.');
      })
      .catch(() => setError('Could not reach the server.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => completed.filter((b) => {
    if (search && !residentName(b).toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (date && localDateKey(b.schedule) !== date) return false;
    if (month && localDateKey(b.schedule).slice(0, 7) !== month) return false;
    if (sessionType === 'crisis' && b.session_type !== 'crisis') return false;
    if (sessionType === 'counseling' && b.session_type === 'crisis') return false;
    return true;
  }), [completed, search, date, month, sessionType]);

  const filtersActive = Boolean(search || date || month || sessionType !== 'all');
  const clearFilters = () => { playClick(); setSearch(''); setDate(''); setMonth(''); setSessionType('all'); };

  const open = (b) => { playClick(); setSelected(b); };

  return (
    <>
      {/* Total */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="bg-brand-surface rounded-2xl shadow-sm px-5 py-3.5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center">
            <IconCircleCheck size={20} className="text-brand-primary" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-brand-ink/50 font-medium">Total completed sessions</p>
            <p className="font-display text-2xl font-semibold leading-tight">{completed.length}</p>
          </div>
        </div>
        {filtersActive && (
          <p className="text-sm text-brand-ink/60">Showing {visible.length} of {completed.length}</p>
        )}
      </div>

      {/* Past sessions that still need confirming -- never counted above. */}
      {awaiting.length > 0 && (
        <div className="rounded-2xl mb-4 px-4 py-3 bg-amber-50 border border-amber-200">
          <button
            onClick={() => { playClick(); setShowAwaiting((v) => !v); }}
            onMouseEnter={playHover}
            className="interactive-nav w-full flex items-center gap-2 text-left text-sm text-amber-900"
          >
            <IconAlertCircle size={16} className="shrink-0" />
            <span className="flex-1">
              <span className="font-semibold">{awaiting.length} past paid session{awaiting.length > 1 ? 's' : ''}</span>{' '}
              {awaiting.length > 1 ? 'have' : 'has'} not been marked as completed yet.
            </span>
            {showAwaiting ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </button>
          {showAwaiting && (
            <ul className="mt-3 space-y-1.5">
              {awaiting.map((b) => (
                <li key={b.booking_id}>
                  <button
                    onClick={() => open(b)}
                    onMouseEnter={playHover}
                    className="interactive-card w-full flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-left"
                  >
                    <Avatar booking={b} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{residentName(b)}</span>
                      <span className="block text-xs text-brand-ink/55">{dateOnly(b.schedule)} · {formatTimeRange(b.schedule)}</span>
                    </span>
                    <span className="text-xs font-medium text-brand-primary whitespace-nowrap">Review &amp; mark</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Search + filters */}
      <div className="bg-brand-surface rounded-2xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <IconSearch size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by resident name..."
            aria-label="Search by resident name"
            className="w-full border border-brand-ink/15 rounded-full pl-9 pr-9 py-2 text-sm bg-brand-surface"
          />
          {search && (
            <button onClick={() => setSearch('')} className="interactive absolute right-3 top-1/2 -translate-y-1/2 text-brand-ink/40 hover:text-brand-ink/70" aria-label="Clear search">
              <IconX size={14} />
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-brand-ink/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); if (e.target.value) setMonth(''); }}
            className="border border-brand-ink/15 rounded-full px-3 py-1.5 text-sm text-brand-ink bg-brand-surface"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-brand-ink/55">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => { setMonth(e.target.value); if (e.target.value) setDate(''); }}
            className="border border-brand-ink/15 rounded-full px-3 py-1.5 text-sm text-brand-ink bg-brand-surface"
          />
        </label>
        <select
          value={sessionType}
          onChange={(e) => setSessionType(e.target.value)}
          aria-label="Session type"
          className="border border-brand-ink/15 rounded-full px-3 py-2 text-sm bg-brand-surface"
        >
          {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} onMouseEnter={playHover} className="interactive text-xs font-medium px-3 py-2 rounded-full text-brand-primary">
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loaded && !error && completed.length === 0 && (
        <div className="bg-brand-surface rounded-2xl shadow-sm text-center px-6 py-14">
          <span className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto mb-3">
            <IconCalendarOff size={26} className="text-brand-primary" />
          </span>
          <p className="text-sm font-semibold">No completed sessions yet</p>
          <p className="text-xs text-brand-ink/50 mt-1 max-w-sm mx-auto">
            After a paid session takes place, open it in the Calendar and choose <span className="font-medium">Mark as completed</span>.
            It will then appear here.
          </p>
        </div>
      )}

      {loaded && completed.length > 0 && visible.length === 0 && (
        <div className="bg-brand-surface rounded-2xl shadow-sm text-center px-6 py-10">
          <p className="text-sm text-brand-ink/60">No completed sessions match these filters.</p>
        </div>
      )}

      {visible.length > 0 && (
        <>
          {/* Table (md and up) */}
          <div className="hidden md:block bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-brand-ink/45 border-b border-brand-ink/10">
                  <th className="font-medium px-4 py-3">Resident</th>
                  <th className="font-medium px-4 py-3">Date</th>
                  <th className="font-medium px-4 py-3">Time</th>
                  <th className="font-medium px-4 py-3">Session type</th>
                  <th className="font-medium px-4 py-3">Status</th>
                  <th className="font-medium px-4 py-3">Payment</th>
                  <th className="font-medium px-4 py-3">Completed on</th>
                  <th className="px-2 py-3" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr
                    key={b.booking_id}
                    onClick={() => open(b)}
                    onMouseEnter={playHover}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(b); } }}
                    tabIndex={0}
                    className="cursor-pointer border-b last:border-0 border-brand-ink/5 hover:bg-brand-primary/5 focus:outline-none focus-visible:bg-brand-primary/5"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar booking={b} />
                        <span className="font-medium truncate">{residentName(b)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{dateOnly(b.schedule)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-brand-ink/70">{formatTimeRange(b.schedule)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-brand-ink/70">{typeLabel(b.session_type)}</td>
                    <td className="px-4 py-3"><CompletedBadge /></td>
                    <td className="px-4 py-3"><PaymentBadge booking={b} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-brand-ink/70">{dateOnly(b.completed_at)}</td>
                    <td className="px-2 py-3"><IconChevronRight size={15} className="text-brand-ink/30" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <ul className="md:hidden space-y-2">
            {visible.map((b) => (
              <li key={b.booking_id}>
                <button
                  onClick={() => open(b)}
                  className="interactive-card w-full bg-brand-surface rounded-2xl shadow-sm p-4 text-left"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <Avatar booking={b} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{residentName(b)}</p>
                      <p className="text-xs text-brand-ink/55">{dateOnly(b.schedule)} · {formatTimeRange(b.schedule)}</p>
                    </div>
                    <IconChevronRight size={15} className="text-brand-ink/30" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CompletedBadge />
                    <PaymentBadge booking={b} />
                    <span className="text-[11px] text-brand-ink/55">{typeLabel(b.session_type)}</span>
                  </div>
                  <p className="text-[11px] text-brand-ink/45 mt-2">Completed {dateOnly(b.completed_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected && (
        <AppointmentDetailModal
          booking={selected}
          sessionPrice={sessionPrice}
          onClose={() => setSelected(null)}
          onChanged={() => { load(); onChanged?.(); }}
        />
      )}
    </>
  );
}

export default CompletedSessions;
