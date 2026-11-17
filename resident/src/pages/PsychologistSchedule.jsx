import { useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import DateOverrideCalendar from '../components/DateOverrideCalendar';
import MonthView from '../components/calendar/MonthView';
import WeekView from '../components/calendar/WeekView';
import DayView from '../components/calendar/DayView';
import AppointmentDetailModal from '../components/calendar/AppointmentDetailModal';
import AppointmentCard from '../components/calendar/AppointmentCard';
import CompletedSessions from '../components/calendar/CompletedSessions';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';
import { toDateKey, STATUS_META } from '../utils/appointmentStatus';
import { groupOverridesByDate } from '../utils/availabilityGrid';

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeForView(viewMode, currentDate) {
  if (viewMode === 'day') {
    const start = new Date(currentDate); start.setHours(0, 0, 0, 0);
    const end = new Date(currentDate); end.setHours(23, 59, 59, 999);
    return [start, end];
  }
  if (viewMode === 'week') {
    const start = startOfWeek(currentDate);
    const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
    return [start, end];
  }
  // month: pad out to the full 6-week grid MonthView actually renders
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 41); gridEnd.setHours(23, 59, 59, 999);
  return [gridStart, gridEnd];
}

function headerLabel(viewMode, currentDate) {
  if (viewMode === 'day') return currentDate.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  if (viewMode === 'week') {
    const [start, end] = rangeForView('week', currentDate);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.toLocaleDateString('en-PH', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
      : `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return currentDate.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

function PsychologistSchedule() {
  const [tab, setTab] = useState('calendar'); // 'calendar' | 'availability' | 'completed'
  const [viewMode, setViewMode] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [weeklyWindows, setWeeklyWindows] = useState([]);
  const [dateOverrides, setDateOverrides] = useState([]);
  const [sessionPrice, setSessionPrice] = useState(null);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [moreList, setMoreList] = useState(null); // { dateKey, bookings } | null

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/availability`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setWeeklyWindows(data); })
      .catch(() => {});
    fetch(`${API_URL}/psychologists/me`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (data?.session_price != null) setSessionPrice(data.session_price); })
      .catch(() => {});
  }, []);

  const [start, end] = useMemo(() => rangeForView(viewMode, currentDate), [viewMode, currentDate]);

  const loadBookings = () => {
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
    fetch(`${API_URL}/psychologists/me/bookings?${params}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setBookings(data);
        else setError(data?.error || 'Could not load appointments.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(loadBookings, [start.getTime(), end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    fetch(`${API_URL}/psychologists/me/date-overrides?month=${month}`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setDateOverrides(data); })
      .catch(() => {});
  }, [currentDate]);

  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const key = toDateKey(b.schedule);
      (map[key] ||= []).push(b);
    });
    return map;
  }, [bookings]);

  const dateOverridesByDate = useMemo(() => groupOverridesByDate(dateOverrides), [dateOverrides]);

  const removeWeeklyWindow = async (availabilityId) => {
    try {
      const res = await fetch(`${API_URL}/psychologists/me/availability/${availabilityId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setWeeklyWindows((prev) => prev.filter((w) => w.availability_id !== availabilityId));
    } catch {
      // leave as-is
    }
  };

  const navigate = (delta) => {
    playClick();
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + delta);
    else if (viewMode === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setCurrentDate(d);
  };

  const goToday = () => { playClick(); setCurrentDate(new Date()); };

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">Appointment Management</h1>
          <p className="text-brand-ink/60 text-sm">See who booked, when, and whether they've paid -- all in one calendar.</p>
        </div>
        <PsychologistTopBar />
      </div>

      <div className="flex flex-wrap gap-2 mt-5 mb-5">
        <button
          onClick={() => setTab('calendar')}
          className={`text-sm font-medium px-4 py-2 rounded-full ${tab === 'calendar' ? 'bg-brand-primary text-white' : 'border border-brand-ink/20 text-brand-ink/60'}`}
        >
          Calendar
        </button>
        <button
          onClick={() => setTab('availability')}
          className={`text-sm font-medium px-4 py-2 rounded-full ${tab === 'availability' ? 'bg-brand-primary text-white' : 'border border-brand-ink/20 text-brand-ink/60'}`}
        >
          Manage Availability
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`text-sm font-medium px-4 py-2 rounded-full ${tab === 'completed' ? 'bg-brand-primary text-white' : 'border border-brand-ink/20 text-brand-ink/60'}`}
        >
          Completed Sessions
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {tab === 'completed' ? (
        <CompletedSessions sessionPrice={sessionPrice} onChanged={loadBookings} />
      ) : tab === 'availability' ? (
        <>
          <p className="text-sm text-brand-ink/60 mb-4">
            Changes here take effect immediately -- residents can only book slots inside these windows, and this
            calendar's "working hours" shading updates to match.
          </p>
          <DateOverrideCalendar weeklyWindows={weeklyWindows} onRemoveWeeklyWindow={removeWeeklyWindow} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(-1)} onMouseEnter={playHover} className="interactive w-8 h-8 rounded-full hover:bg-brand-ink/5 flex items-center justify-center text-brand-ink/60">
                <IconChevronLeft size={16} />
              </button>
              <button onClick={() => navigate(1)} onMouseEnter={playHover} className="interactive w-8 h-8 rounded-full hover:bg-brand-ink/5 flex items-center justify-center text-brand-ink/60">
                <IconChevronRight size={16} />
              </button>
              <button onClick={goToday} onMouseEnter={playHover} className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20 ml-1">
                Today
              </button>
              <p className="font-display text-base font-semibold ml-2">{headerLabel(viewMode, currentDate)}</p>
            </div>
            <div className="flex gap-1 bg-brand-ink/5 rounded-full p-1">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  onClick={() => { playClick(); setViewMode(v.value); }}
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-full ${viewMode === v.value ? 'bg-brand-surface shadow-sm text-brand-ink' : 'text-brand-ink/50'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4 text-[11px] text-brand-ink/50 flex-wrap">
            {Object.entries(STATUS_META).filter(([k]) => k !== 'declined').map(([key, m]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} /> {m.label}
              </span>
            ))}
          </div>

          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              onSelectBooking={setSelectedBooking}
              onShowMore={(dateKey, list) => setMoreList({ dateKey, bookings: list })}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              weeklyWindows={weeklyWindows}
              dateOverridesByDate={dateOverridesByDate}
              onSelectBooking={setSelectedBooking}
            />
          )}
          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              bookingsByDate={bookingsByDate}
              weeklyWindows={weeklyWindows}
              dateOverridesByDate={dateOverridesByDate}
              onSelectBooking={setSelectedBooking}
            />
          )}
        </>
      )}

      {moreList && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8" onClick={() => setMoreList(null)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-lg font-semibold">
                {new Date(`${moreList.dateKey}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <button onClick={() => setMoreList(null)} className="text-brand-ink/50 text-xl leading-none">✕</button>
            </div>
            <div className="space-y-2">
              {moreList.bookings
                .slice()
                .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))
                .map((b) => (
                  <AppointmentCard
                    key={b.booking_id}
                    booking={b}
                    onClick={(booking) => { setMoreList(null); setSelectedBooking(booking); }}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {selectedBooking && (
        <AppointmentDetailModal
          booking={selectedBooking}
          sessionPrice={sessionPrice}
          onClose={() => setSelectedBooking(null)}
          onChanged={loadBookings}
        />
      )}
    </PsychologistLayout>
  );
}

export default PsychologistSchedule;
