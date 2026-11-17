import { useEffect, useState } from 'react';
import { API_URL, authHeader } from '../config';
import ConfirmDialog from './ConfirmDialog';
import { formatHour12 } from '../utils/time';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

function pad(n) {
  return String(n).padStart(2, '0');
}

// A real month calendar (actual dates, not weekdays) for setting one-off hours
// on a specific day -- distinct from the weekly recurring pattern above it.
// Any override on a date makes the weekly pattern irrelevant for that date
// (see db/psychologist_date_overrides.sql and the merge logic server-side).
function DateOverrideCalendar({ weeklyWindows, onRemoveWeeklyWindow }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [overrides, setOverrides] = useState([]);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [form, setForm] = useState({ start_time: '09:00', end_time: '17:00' });
  const [formError, setFormError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const monthStr = `${viewYear}-${pad(viewMonth + 1)}`;

  const load = () => {
    fetch(`${API_URL}/psychologists/me/date-overrides?month=${monthStr}`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setOverrides(data); })
      .catch(() => setError('Could not load your date overrides.'));
  };

  useEffect(load, [monthStr]);

  const changeMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
    setSelectedDate(null);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const overridesForDate = (dateStr) => overrides.filter((o) => o.date === dateStr);

  const defaultWindowsForDate = (dateStr) => {
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    return weeklyWindows.filter((w) => w.day_of_week === dow);
  };

  const dateInfo = (dateStr) => {
    const dateOverrides = overridesForDate(dateStr);
    if (dateOverrides.length > 0) {
      if (dateOverrides[0].is_closed) return { status: 'closed', windows: [] };
      return { status: 'custom', windows: dateOverrides };
    }
    const defaults = defaultWindowsForDate(dateStr);
    return defaults.length > 0 ? { status: 'default', windows: defaults } : { status: 'none', windows: [] };
  };

  const openModal = (dateStr) => {
    setSelectedDate(dateStr);
    setFormError('');
    setForm({ start_time: '09:00', end_time: '17:00' });
  };

  const addOverrideWindow = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch(`${API_URL}/psychologists/me/date-overrides`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, ...form }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Could not add this window.'); return; }
      setOverrides((prev) => [...prev, data]);
    } catch {
      setFormError('Could not reach the server.');
    }
  };

  const markClosed = async () => {
    setFormError('');
    try {
      const res = await fetch(`${API_URL}/psychologists/me/date-overrides/close`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Could not close this date.'); return; }
      setOverrides((prev) => [...prev.filter((o) => o.date !== selectedDate), data]);
    } catch {
      setFormError('Could not reach the server.');
    }
  };

  const removeOverrideRow = async (overrideId) => {
    try {
      const res = await fetch(`${API_URL}/psychologists/me/date-overrides/${overrideId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setOverrides((prev) => prev.filter((o) => o.override_id !== overrideId));
    } catch {
      // leave as-is
    }
  };

  const resetToDefault = async () => {
    try {
      const res = await fetch(`${API_URL}/psychologists/me/date-overrides?date=${selectedDate}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setOverrides((prev) => prev.filter((o) => o.date !== selectedDate));
    } catch {
      // leave as-is
    }
  };

  const modalInfo = selectedDate ? dateInfo(selectedDate) : null;
  const selectedWeekday = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long' })
    : '';

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
      <h2 className="font-medium mb-1">Specific dates</h2>
      <p className="text-xs text-brand-ink/50 mb-4">
        Pick a date to set one-off hours or take that day off -- overrides your weekly default just for that date.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-full hover:bg-brand-ink/5 text-brand-ink/60">‹</button>
        <p className="font-display font-semibold">{MONTH_LABELS[viewMonth]} {viewYear}</p>
        <button type="button" onClick={() => changeMonth(1)} className="w-8 h-8 rounded-full hover:bg-brand-ink/5 text-brand-ink/60">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center max-w-md">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-[11px] font-medium text-brand-ink/40 py-1">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} />;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
          const isPast = dateStr < todayStr;
          const info = isPast ? null : dateInfo(dateStr);

          let classes = 'aspect-square rounded-lg text-sm flex items-center justify-center transition-colors relative ';
          if (isPast) classes += 'text-brand-ink/25 cursor-not-allowed';
          else if (info.status === 'custom') classes += 'bg-brand-primary/15 text-brand-primary hover:bg-brand-primary/25 cursor-pointer font-semibold ring-1 ring-brand-primary/40';
          else if (info.status === 'closed') classes += 'bg-red-50 text-red-400 hover:bg-red-100 cursor-pointer';
          else if (info.status === 'default') classes += 'bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer font-medium';
          else classes += 'bg-brand-ink/5 text-brand-ink/30 hover:bg-brand-ink/10 cursor-pointer';

          return (
            <button type="button" key={dateStr} disabled={isPast} onClick={() => openModal(dateStr)} className={classes}>
              {d}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[11px] text-brand-ink/50 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-200" /> Default hours</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-primary/25" /> Custom hours</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100" /> Closed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-ink/10" /> No hours</span>
      </div>

      {selectedDate && modalInfo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setSelectedDate(null)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <button onClick={() => setSelectedDate(null)} className="text-brand-ink/50 text-xl">✕</button>
            </div>

            <p className="text-xs text-brand-ink/50 mb-4">
              {modalInfo.status === 'custom' && 'Using custom hours for this date.'}
              {modalInfo.status === 'closed' && 'Marked as closed -- no bookable hours this date.'}
              {modalInfo.status === 'default' && 'Using your weekly default hours for this date.'}
              {modalInfo.status === 'none' && 'No hours set for this weekday, and no override.'}
            </p>

            {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}

            <div className="space-y-2 mb-4">
              {modalInfo.windows.length === 0 ? (
                <p className="text-xs text-brand-ink/40">No hours.</p>
              ) : (
                modalInfo.windows.map((w) => (
                  <div key={w.override_id || `${w.start_time}-${w.end_time}`} className="flex items-center justify-between text-sm bg-brand-bg rounded-lg px-3 py-2">
                    <span>{formatHour12(w.start_time)} – {formatHour12(w.end_time)}</span>
                    {w.override_id ? (
                      <button
                        onClick={() => setConfirmDialog({
                          title: 'Are you sure you want to remove this window?',
                          message: `${selectedDate} ${formatHour12(w.start_time)}–${formatHour12(w.end_time)} will no longer be bookable.`,
                          confirmLabel: 'Remove',
                          onConfirm: () => removeOverrideRow(w.override_id),
                        })}
                        className="text-xs text-red-600"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDialog({
                          title: 'Are you sure you want to delete this window?',
                          message: `${formatHour12(w.start_time)}–${formatHour12(w.end_time)} is part of your default ${selectedWeekday} hours, so this removes it from every ${selectedWeekday}, not just this date.`,
                          confirmLabel: 'Delete',
                          onConfirm: () => onRemoveWeeklyWindow(w.availability_id),
                        })}
                        className="text-xs text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={addOverrideWindow} className="flex flex-wrap items-end gap-2 mb-4">
              <div>
                <label className="text-xs text-brand-ink/50 block mb-1">From</label>
                <select
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="border border-brand-ink/15 rounded-lg px-2 py-1.5 text-sm"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{formatHour12(h)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-brand-ink/50 block mb-1">To</label>
                <select
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className="border border-brand-ink/15 rounded-lg px-2 py-1.5 text-sm"
                >
                  {HOURS.map((h) => <option key={h} value={h}>{formatHour12(h)}</option>)}
                </select>
              </div>
              <button type="submit" className="text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
                Add hours
              </button>
            </form>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-brand-ink/10">
              <button
                onClick={() => setConfirmDialog({
                  title: 'Are you sure you want to mark this date as closed?',
                  message: 'Residents will not be able to book any session on this date.',
                  confirmLabel: 'Mark closed',
                  onConfirm: markClosed,
                })}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-200 text-red-600 transition-colors hover:bg-red-600 hover:text-white hover:border-red-600"
              >
                Mark this date as closed
              </button>
              {modalInfo.status !== 'none' && modalInfo.status !== 'default' && (
                <button
                  onClick={() => setConfirmDialog({
                    title: 'Are you sure you want to reset this date to your weekly default?',
                    message: 'Any custom hours or closed status for this date will be removed.',
                    confirmLabel: 'Reset',
                    onConfirm: resetToDefault,
                  })}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/15 text-brand-ink/70 transition-colors hover:bg-brand-ink/10"
                >
                  Reset to weekly default
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

export default DateOverrideCalendar;
