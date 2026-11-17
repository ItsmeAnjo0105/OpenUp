// Shared between VoiceJournal.jsx (right after recording, where the AI
// Reflection and Personalized Recommendations live in separate layout slots)
// and JournalHistory.jsx (revisiting a past entry, where they're stacked
// together) -- same underlying data from the entry either way, split into two
// independently-placeable pieces plus a combined wrapper for convenience.
function cleanText(s) {
  return (s || '').replace(/\*\*/g, '');
}

export function JournalReflection({ entry }) {
  if (!entry) return null;

  const hasAnalysis = entry.emotional_summary || entry.understanding_text
    || (entry.key_concerns?.length > 0) || (entry.emotional_insights?.length > 0);
  const emotionPills = [entry.emotion_result, ...(entry.secondary_emotions || [])].filter(Boolean);

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
      <p className="font-medium text-brand-primary text-sm mb-3">AI Reflection</p>

      {!hasAnalysis ? (
        <p className="text-sm text-brand-ink/50">No AI analysis available for this entry.</p>
      ) : (
        <div className="space-y-4">
          {entry.emotional_summary && (
            <div>
              <p className="text-xs font-medium text-brand-ink/50 mb-1">Emotional Summary</p>
              <p className="text-sm text-brand-ink/80">{cleanText(entry.emotional_summary)}</p>
            </div>
          )}
          {entry.understanding_text && (
            <div>
              <p className="text-xs font-medium text-brand-ink/50 mb-1">Understanding Your Feelings</p>
              <p className="text-sm text-brand-ink/80">{cleanText(entry.understanding_text)}</p>
            </div>
          )}
          {entry.key_concerns?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-brand-ink/50 mb-1.5">Key Concerns Identified</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.key_concerns.map((c) => (
                  <span key={c} className="text-xs font-medium bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}
          {entry.emotional_insights?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-brand-ink/50 mb-1">Emotional Insights</p>
              <ul className="space-y-1">
                {entry.emotional_insights.map((ins, i) => (
                  <li key={i} className="text-sm text-brand-ink/80">• {cleanText(ins)}</li>
                ))}
              </ul>
            </div>
          )}
          {entry.positive_signs && (
            <div>
              <p className="text-xs font-medium text-brand-ink/50 mb-1">A Sign of Strength</p>
              <p className="text-sm text-brand-ink/80">{cleanText(entry.positive_signs)}</p>
            </div>
          )}
          {entry.reflection_question && (
            <div className="bg-brand-primary/5 rounded-xl p-3.5">
              <p className="text-xs font-medium text-brand-primary mb-1">A gentle reflection</p>
              <p className="text-sm text-brand-ink/80 italic">"{cleanText(entry.reflection_question)}"</p>
            </div>
          )}
        </div>
      )}

      {emotionPills.length > 0 && (
        <div className="mt-4 pt-4 border-t border-brand-ink/10">
          <p className="text-xs font-medium text-brand-ink/50 mb-2">Possible emotions picked up</p>
          <div className="flex gap-2 flex-wrap">
            {emotionPills.map((label, i) => (
              <span key={label} className="text-xs font-medium bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full capitalize">
                {label}{i === 0 && entry.emotional_intensity ? ` · ${entry.emotional_intensity}` : ''}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-brand-ink/40 mt-2">
            An AI estimate from your words, not a diagnosis -- only a licensed psychologist can assess this.
          </p>
        </div>
      )}
    </div>
  );
}

export function JournalRecommendations({ entry, onToggleRecommendation, emptyHint }) {
  if (!entry || !entry.recommendations?.length) {
    return emptyHint ? <p className="text-xs text-brand-ink/50">{emptyHint}</p> : null;
  }

  return (
    <div className="space-y-3">
      {entry.recommendations.map((r, i) => (
        <div
          key={r.id ?? i}
          className={`border rounded-xl p-4 ${r.completed ? 'border-emerald-200 bg-emerald-50/50' : 'border-brand-ink/10'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold ${r.completed ? 'line-through text-brand-ink/40' : ''}`}>
              {cleanText(r.title)}
            </p>
            {onToggleRecommendation && (
              <button
                onClick={() => onToggleRecommendation(i, !r.completed)}
                className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                  r.completed ? 'bg-emerald-100 text-emerald-700' : 'border border-brand-ink/20 text-brand-ink/60'
                }`}
              >
                {r.completed ? '✓ Done' : 'Mark done'}
              </button>
            )}
          </div>
          {r.explanation && <p className="text-sm text-brand-ink/70 mt-1">{cleanText(r.explanation)}</p>}
          {r.why_it_helps && (
            <p className="text-xs text-brand-ink/50 mt-2"><span className="font-medium">Why it may help:</span> {cleanText(r.why_it_helps)}</p>
          )}
          {r.how_to && (
            <p className="text-xs text-brand-ink/50 mt-1"><span className="font-medium">How:</span> {cleanText(r.how_to)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function JournalAnalysis({ entry, onToggleRecommendation }) {
  if (!entry) return null;
  return (
    <div className="space-y-4">
      <JournalReflection entry={entry} />
      {entry.recommendations?.length > 0 && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
          <p className="font-display text-base font-semibold mb-1">Personalized Recommendations to Do</p>
          <p className="text-xs text-brand-ink/50 mb-3">Based on this entry specifically.</p>
          <JournalRecommendations entry={entry} onToggleRecommendation={onToggleRecommendation} />
        </div>
      )}
    </div>
  );
}

export default JournalAnalysis;
