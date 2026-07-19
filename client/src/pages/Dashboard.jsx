import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';
import Layout from '../components/Layout';
import { API_URL } from '../config';

const moods = [
  { level: 1, label: 'Low', emoji: '😞' },
  { level: 2, label: 'Down', emoji: '😕' },
  { level: 3, label: 'Okay', emoji: '😐' },
  { level: 4, label: 'Good', emoji: '🙂' },
  { level: 5, label: 'Calm', emoji: '😌' },
];

function Dashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [savingMood, setSavingMood] = useState(false);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const loadMoodEntries = () => {
    fetch(`${API_URL}/mood-entries/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setMoodEntries(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    fetch(`${API_URL}/bookings/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch(() => {});

    loadMoodEntries();
  }, [user, navigate]);

  const handleLogMood = async (level) => {
    setSavingMood(true);
    try {
      await fetch(`${API_URL}/mood-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, mood_level: level }),
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
          <div className="flex justify-between">
            {moods.map((m) => (
              <button
                key={m.level}
                onClick={() => handleLogMood(m.level)}
                disabled={savingMood}
                className={`flex flex-col items-center gap-1 ${
                  todayEntry?.mood_level === m.level ? 'scale-110' : 'opacity-80 hover:opacity-100'
                } transition-transform`}
              >
                <span className={`text-3xl w-12 h-12 flex items-center justify-center rounded-full ${
                  todayEntry?.mood_level === m.level ? 'bg-white' : 'bg-white/20'
                }`}>
                  {m.emoji}
                </span>
                <span className="text-xs text-white font-medium">{m.label}</span>
              </button>
            ))}
          </div>
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
    </Layout>
  );
}

export default Dashboard;
