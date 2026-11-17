// Voice Journal's classifier returns Ekman-style labels. Grouped into three
// valence buckets so the same mapping drives the entry avatar, the tag pill
// color, the "All Entries" filter, and the Avg Mood stat -- one source of
// truth instead of several guesses scattered across components.
export const EMOTION_META = {
  joy: { emoji: '🙂', level: 5, group: 'positive', hex: '#5DCAA5', pill: 'bg-emerald-100 text-emerald-700' },
  surprise: { emoji: '😮', level: 4, group: 'positive', hex: '#5DCAA5', pill: 'bg-emerald-100 text-emerald-700' },
  neutral: { emoji: '😐', level: 3, group: 'neutral', hex: '#FAC775', pill: 'bg-amber-100 text-amber-700' },
  sadness: { emoji: '😔', level: 2, group: 'difficult', hex: '#F0997B', pill: 'bg-rose-100 text-rose-700' },
  fear: { emoji: '😟', level: 2, group: 'difficult', hex: '#F0997B', pill: 'bg-rose-100 text-rose-700' },
  anger: { emoji: '😠', level: 1, group: 'difficult', hex: '#F0997B', pill: 'bg-rose-100 text-rose-700' },
  disgust: { emoji: '😣', level: 1, group: 'difficult', hex: '#F0997B', pill: 'bg-rose-100 text-rose-700' },
};

const DEFAULT_EMOTION_META = { emoji: '😐', level: 3, group: 'neutral', hex: '#FAC775', pill: 'bg-amber-100 text-amber-700' };

export function emotionMeta(label) {
  return EMOTION_META[(label || '').toLowerCase()] || DEFAULT_EMOTION_META;
}
