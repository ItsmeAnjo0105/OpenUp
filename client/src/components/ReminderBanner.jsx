import { useEffect, useRef, useState } from 'react';
import { API_URL, authHeader } from '../config';

// Polls /notifications every 30s and surfaces a session-starting-soon toast the
// moment a confirmed booking is within 10 minutes. There's no background scheduler
// in this app (see db/notifications.sql), so this only fires while the tab is open --
// an honest limitation, not a silent gap: session reminders are computed live from
// real Booking rows, this banner just watches for one crossing the 10-minute mark.
function ReminderBanner() {
  const [reminder, setReminder] = useState(null);
  const shownRef = useRef(new Set(JSON.parse(sessionStorage.getItem('openup_shown_reminders') || '[]')));

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/notifications`, { headers: authHeader() });
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const now = Date.now();
        const due = data.find((n) => {
          if (n.type !== 'reminder' || shownRef.current.has(n.notification_id)) return false;
          const minutesUntil = (new Date(n.created_at).getTime() - now) / 60000;
          return minutesUntil > 0 && minutesUntil <= 10;
        });

        if (due) {
          setReminder(due);
          shownRef.current.add(due.notification_id);
          sessionStorage.setItem('openup_shown_reminders', JSON.stringify([...shownRef.current]));
        }
      } catch {
        // silent -- this is a convenience banner, not a critical path
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!reminder) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] bg-brand-primary text-white rounded-2xl shadow-lg p-4 max-w-xs">
      <p className="font-medium text-sm">⏰ {reminder.title}</p>
      <p className="text-xs text-white/80 mt-1">{reminder.body}</p>
      <div className="flex gap-2 mt-3">
        <a
          href={reminder.link}
          className="text-xs font-medium bg-white text-brand-primary px-3 py-1.5 rounded-full"
        >
          Join now
        </a>
        <button onClick={() => setReminder(null)} className="text-xs text-white/70">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default ReminderBanner;
