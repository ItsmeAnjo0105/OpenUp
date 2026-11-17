import AppointmentCard from './AppointmentCard';
import { toDateKey } from '../../utils/appointmentStatus';
import { availableHoursForDate } from '../../utils/availabilityGrid';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 - 21:00
const ROW_HEIGHT = 64;

function formatHourLabel(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

// A detailed single-day timeline: time labels down the side, appointment
// cards positioned at their actual hour, working/blocked hours shaded behind
// them. Two bookings landing on the same hour can't happen for one
// psychologist (a DB unique constraint on psychologist+slot prevents it), so
// there's nothing to visually stack -- each hour row holds at most one card.
function DayView({ currentDate, bookingsByDate, weeklyWindows, dateOverridesByDate, onSelectBooking }) {
  const dateKey = toDateKey(currentDate);
  const availableHours = availableHoursForDate(dateKey, weeklyWindows, dateOverridesByDate);
  const dayBookings = bookingsByDate[dateKey] || [];
  const bookingsByHour = {};
  dayBookings.forEach((b) => { bookingsByHour[new Date(b.schedule).getHours()] = b; });

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-brand-ink/10">
        <p className="font-display text-base font-semibold">
          {currentDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 620 }}>
        {HOURS.map((h) => {
          const isAvailable = availableHours.has(h);
          const booking = bookingsByHour[h];
          return (
            <div
              key={h}
              className={`flex border-t border-brand-ink/5 ${isAvailable ? 'bg-emerald-50/30' : 'bg-brand-ink/[0.03]'}`}
              style={{ minHeight: ROW_HEIGHT }}
            >
              <div className="w-20 shrink-0 text-right pr-3 pt-1.5">
                <p className="text-xs text-brand-ink/40">{formatHourLabel(h)}</p>
                {!isAvailable && <p className="text-[10px] text-brand-ink/30 mt-0.5">Unavailable</p>}
              </div>
              <div className="flex-1 border-l border-brand-ink/5 p-1.5">
                {booking ? (
                  <div className="max-w-sm">
                    <AppointmentCard booking={booking} onClick={onSelectBooking} />
                  </div>
                ) : isAvailable ? (
                  <p className="text-[11px] text-emerald-700/50 italic pt-1">Open</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-brand-ink/10 text-[11px] text-brand-ink/50 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-50 border border-emerald-200" /> Working hours</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand-ink/10" /> Unavailable / blocked</span>
      </div>
    </div>
  );
}

export default DayView;
