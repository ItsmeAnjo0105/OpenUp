import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import DailyInsights from '../components/DailyInsights';
import MoodCalendar from '../components/MoodCalendar';
import EmotionPicker from '../components/EmotionPicker';
import { API_URL } from '../config';

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

  const handleLogMood = async (emotion) => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/mood-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, mood_level: emotion.level, mood_label: emotion.label }),
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
          <EmotionPicker
            selectedLabel={todayEntry?.mood_label}
            onPick={handleLogMood}
            disabled={saving}
            variant="dark"
          />
        </div>

        <DailyInsights userId={user.user_id} />

        <MoodCalendar userId={user.user_id} />
      </div>
    </Layout>
  );
}

export default MoodTracker;
