import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DailyInsights from '../components/DailyInsights';
import MoodCalendar from '../components/MoodCalendar';
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

        <DailyInsights userId={user.user_id} />

        <MoodCalendar userId={user.user_id} />
      </div>
    </Layout>
  );
}

export default MoodTracker;
