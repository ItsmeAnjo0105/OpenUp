import AppointmentCard from './AppointmentCard';
import { toDateKey } from '../../utils/appointmentStatus';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

function startOfCalendarGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return start;
}

// Compact appointment cards inside each date square (never bare dots), with a
// "+N more" that opens the full list for that date -- same real colored cards
// as week/day, just smaller.
function MonthView({ currentDate, bookingsByDate, onSelectBooking, onShowMore }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = toDateKey(new Date());

  const gridStart = startOfCalendarGrid(year, month);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-brand-ink/10">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-xs font-medium text-brand-ink/50 text-center py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const dateKey = toDateKey(date);
          const isCurrentMonth = date.getMonth() === month;
          const dayBookings = bookingsByDate[dateKey] || [];
          const visible = dayBookings.slice(0, MAX_VISIBLE);
          const overflow = dayBookings.length - visible.length;

          return (
            <div
              key={dateKey}
              className={`min-h-[96px] border-b border-r border-brand-ink/5 p-1.5 ${isCurrentMonth ? '' : 'bg-brand-ink/5'}`}
            >
              <p className={`text-xs mb-1 ${
                dateKey === today ? 'w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center font-semibold' : isCurrentMonth ? 'text-brand-ink/70' : 'text-brand-ink/30'
              }`}>
                {date.getDate()}
              </p>
              <div>
                {visible.map((b) => (
                  <AppointmentCard key={b.booking_id} booking={b} onClick={onSelectBooking} compact />
                ))}
                {overflow > 0 && (
                  <button
                    onClick={() => onShowMore(dateKey, dayBookings)}
                    className="text-[10px] font-medium text-brand-primary hover:underline px-1"
                  >
                    + {overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonthView;
