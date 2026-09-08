import { useEffect, useState } from 'react';
import { API_URL } from '../config';

const MOOD_EMOJI = { 1: '😞', 2: '😟', 3: '😐', 4: '🙂', 5: '😌' };
const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function MoodCalendar({ userId, month, year }) {
  const now = new Date();

  // month/year props only seed the initial view — navigation is managed internally
  const [displayMonth, setDisplayMonth] = useState(month ?? now.getMonth()); // 0-indexed
  const [displayYear, setDisplayYear] = useState(year ?? now.getFullYear());

  const isCurrentMonth = displayMonth === now.getMonth() && displayYear === now.getFullYear();

  const goToPrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayMonth(11);
      setDisplayYear(displayYear - 1);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return; // don't browse into a fully future month
    if (displayMonth === 11) {
      setDisplayMonth(0);
      setDisplayYear(displayYear + 1);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
  };

  const [entries, setEntries] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    if (!userId) return;

    fetch(`${API_URL}/mood-entries/user/${userId}`)
      .then((res) => res.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch(`${API_URL}/voice-journal/user/${userId}`)
      .then((res) => res.json())
      .then((data) => setJournalEntries(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [userId]);

  const entryByDate = new Map(entries.map((e) => [e.entry_date, e.mood_level]));
  const journalByDate = new Map(
    journalEntries.map((j) => [j.created_at.slice(0, 10), j.transcript])
  );

  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(displayYear, displayMonth, 1).getDay();

  const selectedMoodLevel = selectedDate ? entryByDate.get(selectedDate) : null;
  const selectedJournal = selectedDate ? journalByDate.get(selectedDate) : null;

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <p className="font-medium">Mood calendar</p>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <button
            onClick={goToPrevMonth}
            aria-label="Previous month"
            className="w-7 h-7 flex items-center justify-center rounded-full text-brand-ink/60 hover:bg-brand-ink/5"
          >
            ‹
          </button>
          <p className="text-sm font-medium w-32 text-center">
            {MONTH_NAMES[displayMonth]} {displayYear}
          </p>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="w-7 h-7 flex items-center justify-center rounded-full text-brand-ink/60 hover:bg-brand-ink/5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs uppercase text-brand-ink/40 mb-2">
        {WEEKDAYS.map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {[...Array(firstDayOfWeek)].map((_, i) => <div key={`empty-${i}`} />)}

        {[...Array(daysInMonth)].map((_, i) => {
          const day = i + 1;
          const dateStr = toDateStr(displayYear, displayMonth, day);
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const moodLevel = entryByDate.get(dateStr);
          const isLogged = moodLevel !== undefined;
          const clickable = isLogged;

          let content;
          let cellStyle = {
            minWidth: '44px',
            minHeight: '44px',
            borderRadius: '8px',
          };

          if (isToday) {
            cellStyle.backgroundColor = '#2b4d3f';
            content = (
              <>
                {isLogged && <span style={{ fontSize: '16px' }}>{MOOD_EMOJI[moodLevel]}</span>}
                <span style={{ fontSize: '10px' }} className="text-white/90">{day}</span>
              </>
            );
          } else if (isFuture) {
            content = (
              <>
                <span className="text-brand-ink/60" style={{ fontSize: '16px' }}>·</span>
                <span className="text-brand-ink/60" style={{ fontSize: '10px' }}>{day}</span>
              </>
            );
          } else if (isLogged) {
            content = (
              <>
                <span style={{ fontSize: '16px' }}>{MOOD_EMOJI[moodLevel]}</span>
                <span className="text-brand-ink/60" style={{ fontSize: '10px' }}>{day}</span>
              </>
            );
          } else {
            // skipped — past day, no entry
            content = (
              <>
                <span className="text-brand-ink/40" style={{ fontSize: '14px' }}>○</span>
                <span className="text-brand-ink/40" style={{ fontSize: '10px' }}>{day}</span>
              </>
            );
          }

          const Wrapper = clickable ? 'button' : 'div';

          return (
            <Wrapper
              key={day}
              onClick={clickable ? () => setSelectedDate(dateStr) : undefined}
              className={`aspect-square flex flex-col items-center justify-center gap-0.5 ${
                !isToday ? 'bg-brand-ink/5' : ''
              } ${isFuture ? 'opacity-40' : ''} ${clickable ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={cellStyle}
            >
              {content}
            </Wrapper>
          );
        })}
      </div>

      {selectedDate && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">
                {new Date(selectedDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-brand-ink/50 text-xl"
              >
                ✕
              </button>
            </div>

            {selectedMoodLevel && (
              <div className="flex items-center gap-3 bg-brand-ink/5 rounded-xl p-4 mb-4">
                <span className="text-3xl">{MOOD_EMOJI[selectedMoodLevel]}</span>
                <p className="font-medium">{MOOD_LABELS[selectedMoodLevel]}</p>
              </div>
            )}

            <p className="text-xs font-medium text-brand-ink/50 mb-1">Voice journal note</p>
            {selectedJournal ? (
              <p className="text-sm text-brand-ink/80">"{selectedJournal.trim()}"</p>
            ) : (
              <p className="text-sm text-brand-ink/40">No journal entry for this day.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MoodCalendar;
