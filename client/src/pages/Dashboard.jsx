import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

function Dashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    fetch(`http://localhost:5000/bookings/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => {
        setBookings(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, navigate]);

  if (!user) return null;

  const upcoming = bookings.filter((b) => new Date(b.schedule) >= new Date());

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <p className="text-brand-accent font-medium mb-1">Maayong adlaw,</p>
          <h1 className="font-display text-3xl font-semibold">{user.name}</h1>
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="font-display text-xl font-semibold mb-4">Upcoming Sessions</h2>

          {loading ? (
            <p className="text-brand-ink/50 text-sm">Loading...</p>
          ) : upcoming.length === 0 ? (
            <p className="text-brand-ink/50 text-sm">No upcoming sessions booked yet.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => (
                <div key={b.booking_id} className="flex items-center justify-between border border-brand-ink/10 rounded-lg px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">
                      Session with {b.Psychologist?.User?.name || 'your psychologist'}
                    </p>
                    <p className="text-brand-ink/50 text-sm">
                      {new Date(b.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <span className="text-xs font-medium bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full capitalize">
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default Dashboard;
