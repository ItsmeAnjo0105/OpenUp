import { useState } from 'react';
import { IconHistory, IconChevronDown } from '@tabler/icons-react';

// Voice Journal's emotion classifier returns Ekman-style labels, not the 1-5
// mood scale used by Mood Tracker — mapped here so both features read
// consistently across the app.
const EMOTION_TO_MOOD = {
  sadness: { emoji: '😞', tint: '#5DCAA5' },
  fear: { emoji: '😟', tint: '#F0997B' },
  anger: { emoji: '😟', tint: '#F0997B' },
  disgust: { emoji: '😟', tint: '#F0997B' },
  neutral: { emoji: '😐', tint: '#FAC775' },
  surprise: { emoji: '😐', tint: '#FAC775' },
  joy: { emoji: '🙂', tint: '#5DCAA5' },
};
const DEFAULT_MOOD = { emoji: '😐', tint: '#FAC775' };

const MONTHS_PER_PAGE = 2;

function groupByMonth(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const d = new Date(entry.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label: d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  });
  return [...groups.values()];
}

function truncate(text, max = 56) {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function JournalHistory({ entries }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleMonths, setVisibleMonths] = useState(MONTHS_PER_PAGE);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const months = groupByMonth(entries);
  const visibleGroups = months.slice(0, visibleMonths);
  const hasMore = months.length > visibleMonths;

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden" style={{ border: '0.5px solid rgba(28,36,32,0.1)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5"
      >
        <div className="flex items-center gap-2.5">
          <IconHistory size={20} className="text-brand-ink/50" />
          <span className="font-medium text-sm">Journal history</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-ink/50">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
          <IconChevronDown
            size={18}
            className={`text-brand-ink/50 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5">
          {entries.length === 0 ? (
            <p className="text-brand-ink/50 text-sm">No entries yet.</p>
          ) : (
            <>
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium mb-2">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.entries.map((entry) => {
                      const mood = EMOTION_TO_MOOD[entry.emotion_result?.toLowerCase()] || DEFAULT_MOOD;
                      const date = new Date(entry.created_at);
                      return (
                        <button
                          key={entry.journal_id}
                          onClick={() => setSelectedEntry(entry)}
                          className="w-full flex items-center gap-3 py-2 rounded-xl hover:bg-brand-ink/5 text-left"
                        >
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                            style={{ backgroundColor: `${mood.tint}33` }}
                          >
                            {mood.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-brand-ink/80 truncate">{truncate(entry.transcript)}</p>
                            <p className="text-xs text-brand-ink/40">
                              {date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                              {entry.duration_seconds != null && ` · ${Math.floor(entry.duration_seconds / 60)}:${String(entry.duration_seconds % 60).padStart(2, '0')}`}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <button
                  onClick={() => setVisibleMonths((v) => v + MONTHS_PER_PAGE)}
                  className="w-full text-center text-sm font-medium text-brand-primary py-2"
                >
                  Show earlier entries
                </button>
              )}
            </>
          )}
        </div>
      )}

      {selectedEntry && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">
                {new Date(selectedEntry.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <button onClick={() => setSelectedEntry(null)} className="text-brand-ink/50 text-xl">✕</button>
            </div>

            <div className="flex items-center gap-3 bg-brand-ink/5 rounded-xl p-4 mb-4">
              <span className="text-3xl">
                {(EMOTION_TO_MOOD[selectedEntry.emotion_result?.toLowerCase()] || DEFAULT_MOOD).emoji}
              </span>
              <p className="font-medium capitalize">{selectedEntry.emotion_result || 'Unknown'}</p>
            </div>

            <p className="text-xs font-medium text-brand-ink/50 mb-1">Transcript</p>
            <p className="text-sm text-brand-ink/80 mb-4">"{selectedEntry.transcript?.trim()}"</p>

            <p className="text-xs font-medium text-brand-ink/50 mb-1">Audio playback</p>
            <p className="text-sm text-brand-ink/40">Not available for this entry.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default JournalHistory;
