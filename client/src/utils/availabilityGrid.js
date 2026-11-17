// Mirrors the server's own merge logic (GET /psychologists/:id/availability):
// a date with any override row ignores the weekly pattern entirely -- either
// it's a day off (is_closed), or its own custom window list. Otherwise the
// weekly recurring pattern for that weekday applies. Replicated client-side so
// the Week/Day views can shade working vs. non-working hours without an extra
// round trip per visible date.
export function availableHoursForDate(dateStr, weeklyWindows, dateOverridesByDate) {
  const overrides = dateOverridesByDate[dateStr];
  let windows;
  if (overrides) {
    windows = overrides[0].is_closed ? [] : overrides;
  } else {
    const dow = new Date(`${dateStr}T00:00:00`).getDay();
    windows = weeklyWindows.filter((w) => w.day_of_week === dow);
  }
  const hours = new Set();
  windows.forEach((w) => {
    const startH = Number(w.start_time.split(':')[0]);
    const endH = Number(w.end_time.split(':')[0]);
    for (let h = startH; h < endH; h++) hours.add(h);
  });
  return hours;
}

export function groupOverridesByDate(overrides) {
  const byDate = {};
  overrides.forEach((o) => { (byDate[o.date] ||= []).push(o); });
  return byDate;
}
