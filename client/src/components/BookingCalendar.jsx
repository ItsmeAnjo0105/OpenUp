import { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { formatHour12 } from '../utils/time';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

// Big date-picker: green days have at least one free slot, red days have none
// (fully booked or outside the psychologist's set hours), gray days are in the
// past. Picking a day reveals its actual free hour slots below the grid.
function BookingCalendar({ psychologistId, onSelect }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    const monthStr = `${viewYear}-${pad(viewMonth + 1)}`;
    fetch(`${API_URL}/psychologists/${psychologistId}/availability?month=${monthStr}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setAvailability(data);
        else setError(data?.error || 'Could not load availability.');
        setLoading(false);
      })
      .catch(() => {
        setError('Could not reach the server.');
        setLoading(false);
      });
  }, [psychologistId, viewYear, viewMonth]);

  const changeMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
    setSelectedDate(null);
    setSelectedSlot(null);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pickDate = (dateStr, info) => {
    if (!info?.available) return;
    setSelectedDate(dateStr);
    setSelectedSlot(null);
  };

  const pickSlot = (slot) => {
    setSelectedSlot(slot);
    onSelect(`${selectedDate}T${slot}:00+08:00`);
  };

  return (
    <div className="border border-brand-ink/10 rounded-2xl p-4 bg-brand-bg">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          className="w-8 h-8 rounded-full hover:bg-brand-ink/5 text-brand-ink/60"
        >
          ‹
        </button>
        <p className="font-display font-semibold">{MONTH_LABELS[viewMonth]} {viewYear}</p>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          className="w-8 h-8 rounded-full hover:bg-brand-ink/5 text-brand-ink/60"
        >
          ›
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-[11px] font-medium text-brand-ink/40 py-1">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} />;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
          const info = availability[dateStr];
          const isPast = dateStr < todayStr;
          const isSelected = selectedDate === dateStr;

          let classes = 'aspect-square rounded-lg text-sm flex items-center justify-center transition-colors ';
          if (loading) classes += 'bg-brand-ink/5 text-brand-ink/30';
          else if (isPast) classes += 'text-brand-ink/25 cursor-not-allowed';
          else if (info?.available) {
            classes += isSelected
              ? 'bg-brand-primary text-white font-semibold ring-2 ring-brand-primary ring-offset-2'
              : 'bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer font-medium';
          } else {
            classes += 'bg-red-50 text-red-300 cursor-not-allowed';
          }

          return (
            <button
              type="button"
              key={dateStr}
              disabled={loading || isPast || !info?.available}
              onClick={() => pickDate(dateStr, info)}
              className={classes}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[11px] text-brand-ink/50">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-200" /> Available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100" /> Unavailable</span>
      </div>

      {selectedDate && (
        <div className="mt-4 pt-4 border-t border-brand-ink/10">
          <p className="text-xs font-medium text-brand-ink/60 mb-2">
            Times on {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {(availability[selectedDate]?.all_slots || []).map((slot) => {
              const isFree = availability[selectedDate]?.slots?.includes(slot);
              const isSelected = selectedSlot === slot;

              let slotClasses = 'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ';
              if (!isFree) slotClasses += 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed';
              else if (isSelected) slotClasses += 'bg-brand-primary text-white border-brand-primary';
              else slotClasses += 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200 cursor-pointer';

              return (
                <button
                  type="button"
                  key={slot}
                  disabled={!isFree}
                  onClick={() => pickSlot(slot)}
                  className={slotClasses}
                >
                  {formatHour12(slot)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default BookingCalendar;
