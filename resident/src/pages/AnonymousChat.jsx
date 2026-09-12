import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ChatPanel from '../components/ChatPanel';
import { API_URL } from '../config';

function AnonymousChat() {
  const [bookings, setBookings] = useState([]);
  const [selected, setSelected] = useState(null);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/bookings/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setBookings(data.filter((b) => b.status === 'pending' || b.status === 'confirmed')))
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Anonymous Chat</h1>
        <p className="text-brand-ink/60 text-sm mb-8">
          Message your psychologist directly. Only you and they can see this conversation.
        </p>

        {bookings.length === 0 ? (
          <p className="text-sm text-brand-ink/50">
            You don't have any active or pending appointments yet.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {bookings.map((b) => (
                <button
                  key={b.booking_id}
                  onClick={() => setSelected(b.booking_id)}
                  className={`text-sm px-4 py-2 rounded-full border ${
                    selected === b.booking_id
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'border-brand-ink/15 text-brand-ink/70'
                  }`}
                >
                  {b.Psychologist?.User?.name || `Psychologist #${b.psychologist_id}`} ·{' '}
                  {new Date(b.schedule).toLocaleDateString()}
                </button>
              ))}
            </div>

            {selected && <ChatPanel bookingId={selected} myRole="resident" />}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default AnonymousChat;
