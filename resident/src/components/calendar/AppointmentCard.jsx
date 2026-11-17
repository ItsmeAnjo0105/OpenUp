import { IconClock, IconCash, IconCheck, IconX, IconRefresh, IconCircleCheck } from '@tabler/icons-react';
import { deriveStatus, STATUS_META, formatTimeRange, residentName } from '../../utils/appointmentStatus';

const STATUS_ICONS = { clock: IconClock, cash: IconCash, check: IconCheck, x: IconX, refresh: IconRefresh, done: IconCircleCheck };

// The actual colored, rectangular event card (never a bare dot) -- used inside
// the month grid (compact), the week columns, and the day timeline (full).
function AppointmentCard({ booking, onClick, compact = false, style }) {
  const status = deriveStatus(booking);
  const meta = STATUS_META[status];
  const Icon = STATUS_ICONS[meta.icon];
  const name = residentName(booking);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(booking); }}
      style={style}
      className={`interactive w-full text-left rounded-lg border px-2 py-1 ${meta.card} ${compact ? 'mb-0.5' : 'mb-1.5 px-2.5 py-1.5'}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <Icon size={compact ? 10 : 12} className="shrink-0" />
        <p className={`font-semibold truncate ${compact ? 'text-[11px]' : 'text-xs'}`}>{name}</p>
      </div>
      <p className={`truncate opacity-80 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{formatTimeRange(booking.schedule)}</p>
      {!compact && <p className="text-[11px] font-medium mt-0.5">{meta.label}</p>}
    </button>
  );
}

export default AppointmentCard;
