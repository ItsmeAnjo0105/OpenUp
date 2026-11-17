import AppointmentCard from './AppointmentCard';
import { toDateKey } from '../../utils/appointmentStatus';
import { availableHoursForDate } from '../../utils/availabilityGrid';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 - 21:00
const ROW_HEIGHT = 48;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHourLabel(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

// Seven day columns, appointments placed by actual scheduled time -- a real
// unique-slot-per-psychologist constraint in the database means two of this
// psychologist's own appointments can never occupy the same hour, so there's
// no overlap layout to solve, just straightforward vertical placement.
function WeekView({ currentDate, bookingsByDate, weeklyWindows, dateOverridesByDate, onSelectBooking }) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const today = toDateKey(new Date());

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
      <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        <div className="border-b border-r border-brand-ink/10" />
        {days.map((d) => {
          const dateKey = toDateKey(d);
          return (
            <div key={dateKey} className="text-center py-2 border-b border-brand-ink/10">
              <p className="text-xs text-brand-ink/50">{DAY_LABELS[d.getDay()]}</p>
              <p className={`text-sm mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full ${
                dateKey === today ? 'bg-brand-primary text-white font-semibold' : 'text-brand-ink/80'
              }`}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid overflow-y-auto" style={{ gridTemplateColumns: '56px repeat(7, 1fr)', maxHeight: 560 }}>
        <div className="relative" style={{ height: HOURS.length * ROW_HEIGHT }}>
          {HOURS.map((h, i) => (
            <p key={h} className="absolute right-2 text-[10px] text-brand-ink/40" style={{ top: i * ROW_HEIGHT - 6 }}>
              {formatHourLabel(h)}
            </p>
          ))}
        </div>

        {days.map((d) => {
          const dateKey = toDateKey(d);
          const availableHours = availableHoursForDate(dateKey, weeklyWindows, dateOverridesByDate);
          const dayBookings = bookingsByDate[dateKey] || [];

          return (
            <div key={dateKey} className="relative border-r border-brand-ink/5" style={{ height: HOURS.length * ROW_HEIGHT }}>
              {HOURS.map((h, i) => (
                <div
                  key={h}
                  className={`absolute left-0 right-0 border-t border-brand-ink/5 ${availableHours.has(h) ? 'bg-emerald-50/40' : 'bg-brand-ink/[0.03]'}`}
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}
              {dayBookings.map((b) => {
                const hour = new Date(b.schedule).getHours();
                if (hour < HOURS[0] || hour > HOURS[HOURS.length - 1]) return null;
                const top = (hour - HOURS[0]) * ROW_HEIGHT;
                return (
                  <div key={b.booking_id} className="absolute left-0.5 right-0.5" style={{ top: top + 2, height: ROW_HEIGHT - 4 }}>
                    <AppointmentCard booking={b} onClick={onSelectBooking} compact style={{ height: '100%' }} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-brand-ink/10 text-[11px] text-brand-ink/50 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-50 border border-emerald-200" /> Working hours</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-ink/10" /> Unavailable</span>
      </div>
    </div>
  );
}

export default WeekView;
