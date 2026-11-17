// Right-now, per-label responses shown immediately after logging a mood --
// the actionable-support layer Daily Insights' historical cards don't cover.
// `tone` picks the response card's color band; `actions` link only to routes
// that always have something to show regardless of admin-seeded content.
export const MOOD_RESPONSES = {
  Calm: { tone: 'uplift', message: "Good to hear you're feeling calm. Want to capture what's working today?" },
  Happy: { tone: 'uplift', message: 'Glad you are feeling happy. Noting what led here helps you find it again later.' },
  Energetic: { tone: 'uplift', message: "Nice -- that energy is worth putting toward something you care about today." },
  Grateful: { tone: 'uplift', message: 'Gratitude is worth holding onto. A quick note now can be worth re-reading on a harder day.' },
  Good: { tone: 'uplift', message: "Good to hear. What's contributed to that today?" },
  Excited: { tone: 'uplift', message: "That's a great feeling to log. What's it about?" },
  Okay: { tone: 'steady', message: 'An okay day still counts. Worth a closer look at what shaped it?' },
  Confused: { tone: 'steady', message: "Feeling unclear is worth sitting with, not rushing past." },
  Tired: { tone: 'steady', message: 'Tiredness is information -- your body might be asking for rest.' },
  Down: { tone: 'support', message: "It's okay to have a down day. A few slow breaths can help you reset." },
  Irritated: { tone: 'support', message: 'Irritation is often a signal something underneath needs attention.' },
  Anxious: { tone: 'support', message: 'Anxiety can ease with a few slow breaths. Try box breathing: in 4, hold 4, out 4, hold 4.', breathing: true },
  'Mood swings': { tone: 'support', message: "Shifting moods can be disorienting. You don't have to make sense of it alone." },
  'Low energy': { tone: 'support', message: 'Low energy is real, not laziness. Be gentle with what you expect of yourself today.' },
  Apathetic: { tone: 'support', message: 'Feeling numb or checked-out is still worth naming, even without a clear reason.' },
  Overwhelmed: { tone: 'support', message: "When everything feels like too much, it's okay to pick just one small thing.", breathing: true },
  Sad: { tone: 'support', message: "This sounds heavy. You don't have to carry it by yourself.", breathing: true },
  Depressed: { tone: 'crisis', message: "This sounds really heavy to carry. Support is here whenever you're ready for it.", breathing: true },
  'Feeling guilty': { tone: 'support', message: 'Guilt can distort how harshly you judge yourself. It deserves a second, kinder look.' },
  'Very self-critical': { tone: 'crisis', message: 'That inner voice is being harder on you than a friend would be. You deserve support, not just self-judgment.', breathing: true },
};

export const MOOD_FACTORS = ['Sleep', 'Work/School', 'Relationships', 'Family', 'Health', 'Money', 'Loneliness', 'Other'];

export function toneClasses(tone) {
  if (tone === 'crisis') return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', accent: 'text-rose-700' };
  if (tone === 'support') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', accent: 'text-amber-700' };
  if (tone === 'uplift') return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', accent: 'text-emerald-700' };
  return { bg: 'bg-brand-bg', border: 'border-brand-ink/10', text: 'text-brand-ink', accent: 'text-brand-ink/70' };
}
