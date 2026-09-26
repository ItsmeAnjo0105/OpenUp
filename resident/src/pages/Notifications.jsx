import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL, authHeader } from '../config';

const TYPE_ICON = { message: '💬', system: '📢', reminder: '⏰' };

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    fetch(`${API_URL}/notifications`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setNotifications(data);
        else setError(data?.error || 'Could not load notifications.');
      })
      .catch(() => setError('Could not load notifications.'));
  };

  useEffect(load, []);

  const markRead = async (notificationId) => {
    if (String(notificationId).startsWith('reminder-')) return; // synthetic, nothing to persist
    try {
      await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: authHeader(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === notificationId ? { ...n, read: true } : n))
      );
    } catch {
      // leave as-is
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Notifications</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Session reminders, messages, and updates.</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {notifications.length === 0 ? (
          <p className="text-sm text-brand-ink/50">Nothing here yet.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const content = (
                <div
                  className={`bg-brand-surface rounded-2xl shadow-sm p-4 flex items-start gap-3 ${
                    !n.read ? 'border-l-4 border-brand-primary' : ''
                  }`}
                >
                  <span className="text-lg">{TYPE_ICON[n.type] || '🔔'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-brand-ink/60 mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-brand-ink/40 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              );

              return n.link ? (
                <Link key={n.notification_id} to={n.link} onClick={() => markRead(n.notification_id)}>
                  {content}
                </Link>
              ) : (
                <div key={n.notification_id} onClick={() => markRead(n.notification_id)} className="cursor-pointer">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default Notifications;
