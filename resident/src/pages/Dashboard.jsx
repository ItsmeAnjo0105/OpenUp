import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import EmotionPicker from '../components/EmotionPicker';
import MoodGate from '../components/MoodGate';
import { API_URL } from '../config';

function Dashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [moodLoaded, setMoodLoaded] = useState(false);
  const [moodGateDismissed, setMoodGateDismissed] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const loadMoodEntries = () => {
    fetch(`${API_URL}/mood-entries/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => {
        setMoodEntries(Array.isArray(data) ? data : []);
        setMoodLoaded(true);
      })
      // Leave moodLoaded false on failure -- the popup just won't show rather
      // than risk nagging someone who already answered.
      .catch(() => {});
  };

  const loadBookings = () => {
    fetch(`${API_URL}/bookings/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    loadBookings();
    loadMoodEntries();
  }, [user, navigate]);

  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState('');
  const [bookingActionError, setBookingActionError] = useState('');
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const handleCancelBooking = async (bookingId) => {
    setBookingActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('openup_token')}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingActionError(data.error || 'Could not cancel this booking.');
        return;
      }
      loadBookings();
    } catch {
      setBookingActionError('Could not reach the server.');
    }
  };

  const confirmCancelBooking = (bookingId) => {
    setConfirmDialog({
      title: 'Are you sure you want to cancel this booking?',
      message: "This can't be undone. Any Care Credit or payment tied to it will be released.",
      confirmLabel: 'Cancel booking',
      onConfirm: () => handleCancelBooking(bookingId),
    });
  };

  const handleReschedule = async (bookingId) => {
    if (!rescheduleValue) return;
    setBookingActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/reschedule`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('openup_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schedule: rescheduleValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingActionError(data.error || 'Could not reschedule this booking.');
        return;
      }
      setReschedulingId(null);
      setRescheduleValue('');
      loadBookings();
    } catch {
      setBookingActionError('Could not reach the server.');
    }
  };

  const handlePay = async (paymentId) => {
    setPayError('');
    setPayingId(paymentId);
    try {
      const res = await fetch(`${API_URL}/payments/${paymentId}/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('openup_token')}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error || 'Could not start checkout.');
        setPayingId(null);
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setPayError('Could not reach the server.');
      setPayingId(null);
    }
  };

  const handleLogMood = async (emotion) => {
    setSavingMood(true);
    try {
      await fetch(`${API_URL}/mood-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, mood_level: emotion.level, mood_label: emotion.label }),
      });
      loadMoodEntries();
    } catch {
      // silent fail is fine here; the chart just won't update
    } finally {
      setSavingMood(false);
    }
  };

  if (!user) return null;

  const firstName = user.name.split(' ')[0];
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = moodEntries.find((e) => e.entry_date === today);
  const showMoodGate = moodLoaded && !todayEntry && !moodGateDismissed;

  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const entry = moodEntries.find((e) => e.entry_date === dateStr);
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      mood: entry ? entry.mood_level : 0,
    };
  });

  const nextSession = bookings
    .filter((b) => new Date(b.schedule) >= new Date())
    .sort((a, b) => new Date(a.schedule) - new Date(b.schedule))[0];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Hi, {firstName} 🌿</h1>
          <p className="text-brand-ink/60 text-sm">How are you feeling today?</p>
        </div>

        <div className="bg-brand-primary rounded-2xl p-6">
          <p className="text-white font-medium mb-4">How are you right now?</p>
          <EmotionPicker
            selectedLabel={todayEntry?.mood_label}
            onPick={handleLogMood}
            disabled={savingMood}
            variant="dark"
          />
        </div>

        <Link
          to="/assessment"
          className="flex items-center justify-between bg-brand-primary/10 rounded-2xl p-5 hover:bg-brand-primary/15 transition-colors"
        >
          <div>
            <p className="font-medium text-sm">Not sure how you feel?</p>
            <p className="text-brand-ink/60 text-sm">Take a quick assessment</p>
          </div>
          <span className="bg-brand-primary text-white text-sm font-medium px-4 py-2 rounded-full">
            Start
          </span>
        </Link>

        <div className="grid grid-cols-3 gap-3">
          <Link
            to="/crisis-companion"
            className="bg-brand-surface rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
          >
            <span className="text-2xl">💬</span>
            <span className="text-sm font-medium">Talk</span>
          </Link>
          <Link
            to="/booking"
            className="bg-brand-surface rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
          >
            <span className="text-2xl">📅</span>
            <span className="text-sm font-medium">Book</span>
          </Link>
          <Link
            to="/voice-journal"
            className="bg-brand-surface rounded-2xl shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
          >
            <span className="text-2xl">🎙️</span>
            <span className="text-sm font-medium">Journal</span>
          </Link>
        </div>

        {nextSession && (
          <div className="bg-brand-primary rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-white/20 text-white font-semibold flex items-center justify-center shrink-0">
                {(nextSession.Psychologist?.User?.name || '?')
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <div>
                <p className="text-white font-medium text-sm">
                  {nextSession.Psychologist?.User?.name || 'Your psychologist'}
                </p>
                <p className="text-white/70 text-sm">
                  {new Date(nextSession.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>
            <Link
              to={`/session/${nextSession.booking_id}`}
              className="bg-white text-brand-primary text-sm font-medium px-5 py-2 rounded-full hover:bg-white/90"
            >
              Join
            </Link>
          </div>
        )}

        {bookings.length > 0 && (
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <p className="font-medium mb-4">Your bookings</p>
            {payError && <p className="text-sm text-red-600 mb-3">{payError}</p>}
            {bookingActionError && <p className="text-sm text-red-600 mb-3">{bookingActionError}</p>}
            <div className="space-y-3">
              {bookings.map((b) => {
                const payment = b.Payment?.[0];
                const canManage = b.status === 'pending' || b.status === 'confirmed';
                return (
                  <div key={b.booking_id} className="border border-brand-ink/10 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">
                          {b.Psychologist?.User?.name || `Psychologist #${b.psychologist_id}`}
                        </p>
                        <p className="text-xs text-brand-ink/60 mt-1">
                          {new Date(b.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                          {' · '}
                          <span className="capitalize">{b.status}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {payment && payment.status === 'pending' && (
                          <button
                            onClick={() => handlePay(payment.payment_id)}
                            disabled={payingId === payment.payment_id}
                            className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                          >
                            {payingId === payment.payment_id
                              ? 'Redirecting...'
                              : `Pay ₱${Number(payment.amount).toLocaleString()}`}
                          </button>
                        )}
                        {payment && payment.status === 'paid' && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                            Paid
                          </span>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => {
                                setReschedulingId(reschedulingId === b.booking_id ? null : b.booking_id);
                                setRescheduleValue('');
                              }}
                              className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => confirmCancelBooking(b.booking_id)}
                              className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {reschedulingId === b.booking_id && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={rescheduleValue}
                          onChange={(e) => setRescheduleValue(e.target.value)}
                          className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
                        />
                        <button
                          onClick={() => handleReschedule(b.booking_id)}
                          disabled={!rescheduleValue}
                          className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                        >
                          Confirm new time
                        </button>
                      </div>
                    )}
                    {reschedulingId === b.booking_id && b.status === 'confirmed' && (
                      <p className="text-xs text-brand-ink/50 mt-2">
                        Rescheduling a confirmed session sends it back to your psychologist for re-acceptance.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <p className="font-medium mb-4">Your mood this week</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={last7}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
              <Bar dataKey="mood" fill="#2F5D50" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      {showMoodGate && (
        <MoodGate
          user={user}
          onLogged={() => { setMoodGateDismissed(true); loadMoodEntries(); }}
          onSkip={() => setMoodGateDismissed(true)}
        />
      )}
    </Layout>
  );
}

export default Dashboard;
