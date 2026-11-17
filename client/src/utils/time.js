// Displays a 24-hour "HH:MM" (or "HH:MM:SS") string as 12-hour with AM/PM.
// The underlying value stays 24-hour everywhere (form state, API payloads,
// Booking.schedule) -- this only changes what's shown on screen.
export function formatHour12(time) {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${mStr} ${period}`;
}
