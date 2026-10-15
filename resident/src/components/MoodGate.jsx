import { useState } from 'react';
import EmotionPicker from './EmotionPicker';
import { API_URL } from '../config';

// A dashboard-entry popup asking how the resident is feeling right now. Not a
// hard block -- "Choose later" dismisses it for this visit, and the Dashboard's
// own mood widget (or this popup again next visit) is still there whenever
// they're ready to answer.
function MoodGate({ user, onLogged, onSkip }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pick = async (emotion) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/mood-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, mood_level: emotion.level, mood_label: emotion.label }),
      });
      if (!res.ok) {
        setError('Could not save that -- please try again.');
        setSaving(false);
        return;
      }
      onLogged();
    } catch {
      setError('Could not reach the server -- please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onSkip}>
      <div
        className="w-full max-w-lg bg-brand-surface rounded-3xl p-8 border-4 border-brand-primary shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h1 className="font-display text-2xl font-semibold text-brand-ink mb-1">How are you right now?</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Pick whatever fits closest.</p>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>}
        <EmotionPicker onPick={pick} disabled={saving} variant="light" />
        <button
          onClick={onSkip}
          className="text-sm text-brand-primary underline underline-offset-2 hover:text-brand-primary-dark mt-6"
        >
          Choose later
        </button>
      </div>
    </div>
  );
}

export default MoodGate;
