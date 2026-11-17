import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconWind } from '@tabler/icons-react';
import { API_URL } from '../config';
import { MOOD_RESPONSES, MOOD_FACTORS, toneClasses } from '../utils/moodResponses';

const BREATH_STEPS = ['Breathe in...', 'Hold...', 'Breathe out...', 'Hold...'];

function BreathingGuide() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const openedAt = Date.now();
    const interval = setInterval(() => {
      setStepIndex(Math.floor((Date.now() - openedAt) / 4000) % 4);
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => { setStepIndex(0); setOpen(true); }}
        className="interactive inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 bg-white"
      >
        <IconWind size={14} /> Try a 1-minute breathing exercise
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="w-16 h-16 rounded-full bg-sky-300/60 breathing-circle" />
      <p className="text-sm font-medium text-brand-ink/70">{BREATH_STEPS[stepIndex]}</p>
      <button onClick={() => setOpen(false)} className="text-xs text-brand-ink/40 underline">
        Close
      </button>
    </div>
  );
}

// Keyed by mood_id+mood_label from MoodTracker, so logging a new mood today
// (a fresh entry, or re-picking a different label) remounts this fresh
// instead of needing an effect to reset selectedTags/saved by hand.
function MoodResponse({ entry, userId, onTagsSaved }) {
  const [selectedTags, setSelectedTags] = useState(entry?.tags || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!entry) return null;

  const response = MOOD_RESPONSES[entry.mood_label];
  if (!response) return null;

  const colors = toneClasses(response.tone);

  const toggleTag = (tag) => {
    setSaved(false);
    setSaveError('');
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const saveTags = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_URL}/mood-entries/today`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, tags: selectedTags }),
      });
      if (!res.ok) {
        setSaveError("Couldn't save that -- your mood log itself is still fine.");
        return;
      }
      setSaved(true);
      onTagsSaved?.();
    } catch {
      setSaveError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-2xl p-5 border ${colors.bg} ${colors.border}`}>
      <p className={`text-sm font-medium ${colors.text}`}>{response.message}</p>

      {response.breathing && (
        <div className="mt-3">
          <BreathingGuide />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {response.tone === 'crisis' && (
          <Link
            to="/crisis-companion"
            className="interactive text-xs font-medium px-3.5 py-2 rounded-full text-white bg-rose-600"
          >
            Talk to AI Crisis Companion
          </Link>
        )}
        {(response.tone === 'crisis' || response.tone === 'support') && (
          <>
            <Link
              to="/messages"
              className="interactive text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 bg-white"
            >
              Message your psychologist
            </Link>
            <Link
              to="/booking"
              className="interactive text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 bg-white"
            >
              Book a session
            </Link>
          </>
        )}
        {(response.tone === 'steady' || response.tone === 'uplift') && (
          <Link
            to="/voice-journal"
            className="interactive text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/15 bg-white"
          >
            Note it in Voice Journal
          </Link>
        )}
      </div>

      <div className="mt-5 pt-4 border-t" style={{ borderColor: 'rgba(28,36,32,0.1)' }}>
        <p className={`text-xs font-medium mb-2 ${colors.accent}`}>What's contributing to this? (optional)</p>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_FACTORS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                selectedTags.includes(tag)
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white border-brand-ink/15 text-brand-ink/70'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        {selectedTags.length > 0 && (
          <button
            onClick={saveTags}
            disabled={saving}
            className="mt-3 text-xs font-medium px-3.5 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
          </button>
        )}
        {saveError && <p className="text-xs text-red-600 mt-2">{saveError}</p>}
      </div>
    </div>
  );
}

export default MoodResponse;
