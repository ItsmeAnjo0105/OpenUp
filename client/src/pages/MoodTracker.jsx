import { useState, useEffect } from 'react';
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

function MoodTracker() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const loadEntries = () => {
    fetch(`${API_URL}/mood-entries/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (user) loadEntries();
  }, [user]);

  const handleLogMood = async (level) => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/mood-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, mood_level: level }),
      });
      loadEntries();
    } catch {
      // silent fail is fine here; chart just won't update
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const today = new Date().toISOString().split('T')[0];
  const todayEntry = entries.find((e) => e.entry_date === today);

  // Last 7 days for the bar chart
  const last7 = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const entry = entries.find((e) => e.entry_date === dateStr);
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      mood: entry ? entry.mood_level : 0,
    };
  });

  // Current month calendar
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const loggedDates = new Set(entries.map((e) => e.entry_date));

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-display text-2xl font-semibold">Mood Tracker</h1>

        <div className="bg-brand-primary rounded-2xl p-6">
          <p className="text-white font-medium mb-4">Log today's mood</p>
          <div className="flex justify-between">
            {moods.map((m) => (
              <button
                key={m.level}
                onClick={() => handleLogMood(m.level)}
                disabled={saving}
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

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <p className="font-medium mb-4">This week</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={last7}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} />
              <Bar dataKey="mood" fill="#2F5D50" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <p className="font-medium mb-4">Mood calendar</p>
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-brand-ink/40 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(firstDayOfWeek)].map((_, i) => <div key={`empty-${i}`} />)}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const logged = loggedDates.has(dateStr);
              return (
                <div
                  key={day}
                  className={`aspect-square flex items-center justify-center rounded-lg text-sm ${
                    logged ? 'bg-brand-primary text-white font-medium' : 'bg-brand-ink/5 text-brand-ink/60'
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default MoodTracker;
