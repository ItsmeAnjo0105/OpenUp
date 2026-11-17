import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconAlertTriangle,
  IconCalendarEvent,
  IconClock,
  IconCircleDot,
} from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const AVATAR_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
];

function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Mirrors the band copy on the resident-facing Assessment results screen, so
// a psychologist sees the same vocabulary the resident saw.
const BAND_LABELS = {
  low: 'Feeling steady',
  moderate: 'Some strain showing',
  elevated: 'Carrying a lot right now',
};
const SECTION_MAX_SCORE = 15; // 5 items x 0-3 each, same scale as Assessment.jsx

const STATUS_DOT = {
  confirmed: 'bg-green-500',
  completed: 'bg-green-500',
  pending: 'bg-amber-400',
  cancelled: 'bg-brand-ink/25',
  declined: 'bg-brand-ink/25',
};
const STATUS_BADGE = {
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-brand-ink/5 text-brand-ink/50',
  declined: 'bg-brand-ink/5 text-brand-ink/50',
};

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function PsychologistClientDetail() {
  const { residentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const [noteDraft, setNoteDraft] = useState('');
  const [noteStatus, setNoteStatus] = useState('idle'); // idle | saving | saved | error

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/clients/${residentId}/wellness`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { setError(body?.error || 'Could not load this client.'); return; }
        setData(body);
        const mostRecent = body.sessions?.[0]?.schedule;
        setSelectedDate(mostRecent ? new Date(mostRecent) : new Date());
        if (mostRecent) {
          const d = new Date(mostRecent);
          setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
        }
      })
      .catch(() => setError('Could not load this client.'));
  }, [residentId]);

  const sessionsByDay = useMemo(() => {
    const map = new Map();
    (data?.sessions || []).forEach((s) => {
      const key = dateKey(new Date(s.schedule));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return map;
  }, [data]);

  const assessmentsByDay = useMemo(() => {
    const map = new Map();
    (data?.assessments || []).forEach((a) => {
      const key = dateKey(new Date(a.created_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return map;
  }, [data]);

  const selectedSessions = selectedDate ? sessionsByDay.get(dateKey(selectedDate)) || [] : [];
  const selectedAssessment = selectedDate
    ? (assessmentsByDay.get(dateKey(selectedDate)) || [])[0]
    : null;
  const selectedBooking = selectedSessions[0];

  const selectedBookingId = selectedBooking?.booking_id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!selectedBookingId) return undefined;
    fetch(`${API_URL}/bookings/${selectedBookingId}/notes`, { headers: authHeader() })
      .then((res) => res.json())
      .then((body) => { if (!cancelled) { setNoteDraft(body?.body || ''); setNoteStatus('idle'); } })
      .catch(() => { if (!cancelled) setNoteStatus('error'); });
    return () => { cancelled = true; };
  }, [selectedBookingId]);

  const saveNote = () => {
    if (!selectedBookingId) return;
    setNoteStatus('saving');
    fetch(`${API_URL}/bookings/${selectedBookingId}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ body: noteDraft }),
    })
      .then((res) => { if (!res.ok) throw new Error(); setNoteStatus('saved'); })
      .catch(() => setNoteStatus('error'));
  };

  if (error) {
    return (
      <PsychologistLayout>
        <Link to="/psychologist/clients" className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
          <IconArrowLeft size={15} /> Back to Clients
        </Link>
        <p className="text-sm text-red-600">{error}</p>
      </PsychologistLayout>
    );
  }
  if (!data) {
    return (
      <PsychologistLayout>
        <p className="text-sm text-brand-ink/50">Loading...</p>
      </PsychologistLayout>
    );
  }

  const { client, mood_entries: moodEntries, sessions } = data;
  const color = colorForName(client.name);
  const recentMoodLabels = [...new Set(moodEntries.map((m) => m.mood_label).filter(Boolean))].slice(0, 5);

  const monthLabel = monthCursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const firstWeekday = monthCursor.getDay();
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));

  const today = new Date();

  return (
    <PsychologistLayout>
      <Link to="/psychologist/clients" className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
        <IconArrowLeft size={15} /> Back to Clients
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <span className={`w-14 h-14 rounded-full ${color.bg} ${color.text} font-semibold text-lg flex items-center justify-center shrink-0`}>
            {(client.name || '?')[0]?.toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold">{client.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {recentMoodLabels.length === 0 ? (
                <span className="text-xs text-brand-ink/40">No mood check-ins yet</span>
              ) : (
                recentMoodLabels.map((label) => (
                  <span key={label} className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary">
                    {label}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
        <PsychologistTopBar />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-brand-surface rounded-2xl shadow-sm p-4 text-center">
          <p className="text-xs text-brand-ink/50">Total Sessions</p>
          <p className="text-xl font-semibold mt-1">{client.total_sessions}</p>
        </div>
        <div className="bg-brand-surface rounded-2xl shadow-sm p-4 text-center">
          <p className="text-xs text-brand-ink/50">Last Check-in</p>
          <p className="text-sm font-semibold mt-1.5">
            {client.last_session
              ? new Date(client.last_session).toLocaleDateString('en-PH', { dateStyle: 'medium' })
              : '—'}
          </p>
        </div>
        <div className="bg-brand-surface rounded-2xl shadow-sm p-4 text-center flex flex-col items-center justify-center">
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${client.is_active ? 'bg-green-100 text-green-700' : 'bg-brand-ink/5 text-brand-ink/50'}`}>
            {client.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-3 bg-brand-surface rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5">
              <IconCalendarEvent size={17} className="text-brand-primary" /> Check-in Calendar
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { playClick(); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)); }}
                onMouseEnter={playHover}
                className="interactive w-7 h-7 rounded-full border border-brand-ink/15 flex items-center justify-center"
              >
                <IconChevronLeft size={14} />
              </button>
              <span className="text-sm font-medium w-32 text-center">{monthLabel}</span>
              <button
                onClick={() => { playClick(); setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)); }}
                onMouseEnter={playHover}
                className="interactive w-7 h-7 rounded-full border border-brand-ink/15 flex items-center justify-center"
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-brand-ink/40 mb-1.5">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const daySessions = sessionsByDay.get(dateKey(day)) || [];
              const isSelected = selectedDate && sameDay(day, selectedDate);
              const isToday = sameDay(day, today);
              const dotStatus = daySessions.find((s) => s.status === 'confirmed' || s.status === 'completed')
                ? 'confirmed'
                : daySessions.find((s) => s.status === 'pending')
                ? 'pending'
                : daySessions.length
                ? 'cancelled'
                : null;
              return (
                <button
                  key={i}
                  onClick={() => { playClick(); setSelectedDate(day); }}
                  onMouseEnter={playHover}
                  className={`interactive-nav relative h-10 rounded-lg text-sm flex flex-col items-center justify-center gap-0.5 ${
                    isSelected ? 'bg-brand-primary text-white' : isToday ? 'bg-brand-primary/10' : 'hover:bg-brand-ink/5'
                  }`}
                >
                  {day.getDate()}
                  {dotStatus && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : STATUS_DOT[dotStatus]}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-4 text-xs text-brand-ink/50">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Check-in completed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-ink/25" /> Cancelled</span>
          </div>
        </div>

        <div className="lg:col-span-2 bg-brand-surface rounded-2xl shadow-sm p-5">
          <h2 className="font-display text-base font-semibold mb-4">Check-in Details</h2>
          {!selectedDate ? (
            <p className="text-sm text-brand-ink/40">Select a date on the calendar.</p>
          ) : selectedSessions.length === 0 ? (
            <p className="text-sm text-brand-ink/40">No session on {selectedDate.toLocaleDateString('en-PH', { dateStyle: 'medium' })}.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {selectedDate.toLocaleDateString('en-PH', { dateStyle: 'medium' })}
                </p>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[selectedBooking.status] || 'bg-brand-ink/5 text-brand-ink/50'}`}>
                  {selectedBooking.status}
                </span>
              </div>

              {selectedAssessment?.safety_flag && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl p-3 text-xs">
                  <IconAlertTriangle size={15} className="shrink-0 mt-0.5" />
                  Flagged a possible safety concern on this check-in.
                </div>
              )}

              {selectedAssessment ? (
                <>
                  {[
                    { label: 'Mood', score: selectedAssessment.mood_score },
                    { label: 'Anxiety', score: selectedAssessment.anxiety_score },
                    { label: 'Stress', score: selectedAssessment.stress_score },
                  ].map((s) => {
                    const percent = Math.round((s.score / SECTION_MAX_SCORE) * 100);
                    return (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium">{s.label}</p>
                          <p className="text-xs text-brand-ink/50 tabular-nums">{percent}%</p>
                        </div>
                        <div className="h-1.5 bg-brand-ink/10 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-primary rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div>
                    <p className="text-xs text-brand-ink/50">Mood Label</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedAssessment.safety_flag ? "Let's get you support" : BAND_LABELS[selectedAssessment.overall_band] || '—'}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-brand-ink/40">No wellness check-in submitted for this session.</p>
              )}

              <div>
                <p className="text-xs text-brand-ink/50 mb-1.5">Notes</p>
                <textarea
                  value={noteDraft}
                  onChange={(e) => { setNoteDraft(e.target.value); setNoteStatus('idle'); }}
                  rows={4}
                  placeholder="Private notes for this session (only you can see these)..."
                  className="w-full border border-brand-ink/15 rounded-xl px-3 py-2 text-sm bg-brand-bg/40 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-brand-ink/40">
                    {noteStatus === 'saved' && 'Saved.'}
                    {noteStatus === 'saving' && 'Saving...'}
                    {noteStatus === 'error' && <span className="text-red-600">Could not save.</span>}
                  </span>
                  <button
                    onClick={() => { playClick(); saveNote(); }}
                    onMouseEnter={playHover}
                    disabled={noteStatus === 'saving'}
                    className="interactive text-xs font-medium px-3.5 py-1.5 rounded-full text-white disabled:opacity-40"
                    style={{ backgroundColor: '#2b4d3f' }}
                  >
                    Save note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
        <h2 className="font-display text-base font-semibold mb-4">Session History</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-brand-ink/40">No sessions with this client yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => {
              const d = new Date(s.schedule);
              const isSelected = selectedDate && sameDay(d, selectedDate);
              return (
                <button
                  key={s.booking_id}
                  onClick={() => {
                    playClick();
                    setSelectedDate(d);
                    setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                  onMouseEnter={playHover}
                  className={`interactive-nav flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left ${
                    isSelected ? 'bg-brand-primary/10' : 'hover:bg-brand-ink/5'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <IconClock size={14} className="text-brand-ink/40" />
                    {d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_BADGE[s.status] || 'bg-brand-ink/5 text-brand-ink/50'}`}>
                    <IconCircleDot size={10} className="inline mr-1 -mt-0.5" />
                    {s.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PsychologistLayout>
  );
}

export default PsychologistClientDetail;
