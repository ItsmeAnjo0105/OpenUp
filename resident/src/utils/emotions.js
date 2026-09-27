// Every entry maps to a 1-5 mood_level so the weekly bar chart and trend
// insights (server-side, keyed on mood_level) keep working unchanged --
// mood_label just carries the exact word the resident tapped for display.
export const EMOTIONS = [
  { label: 'Calm', emoji: '😌', level: 5 },
  { label: 'Happy', emoji: '🙂', level: 5 },
  { label: 'Energetic', emoji: '⚡', level: 5 },
  { label: 'Grateful', emoji: '🙏', level: 5 },
  { label: 'Good', emoji: '😊', level: 4 },
  { label: 'Excited', emoji: '🤩', level: 4 },
  { label: 'Okay', emoji: '😐', level: 3 },
  { label: 'Confused', emoji: '😕', level: 3 },
  { label: 'Tired', emoji: '😴', level: 3 },
  { label: 'Down', emoji: '🙁', level: 2 },
  { label: 'Irritated', emoji: '😠', level: 2 },
  { label: 'Anxious', emoji: '😰', level: 2 },
  { label: 'Mood swings', emoji: '😢', level: 2 },
  { label: 'Low energy', emoji: '🥱', level: 2 },
  { label: 'Apathetic', emoji: '😶', level: 2 },
  { label: 'Overwhelmed', emoji: '😩', level: 2 },
  { label: 'Sad', emoji: '😞', level: 1 },
  { label: 'Depressed', emoji: '😔', level: 1 },
  { label: 'Feeling guilty', emoji: '😣', level: 1 },
  { label: 'Very self-critical', emoji: '😖', level: 1 },
];

export const LEVEL_FALLBACK_LABEL = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };
export const LEVEL_FALLBACK_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😌' };
