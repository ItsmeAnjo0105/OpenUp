import { useMemo, useState } from 'react';
import { IconChevronRight, IconChevronDown, IconBook2 } from '@tabler/icons-react';
import { emotionMeta } from '../utils/voiceEmotions';

const PAGE_SIZE = 4;
const FILTERS = [
  { value: 'all', label: 'All Entries' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'difficult', label: 'Difficult' },
];

function truncate(text, max = 64) {
  const clean = (text || '').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function tagsFor(entry) {
  if (Array.isArray(entry.content_indicators) && entry.content_indicators.length > 0) {
    return entry.content_indicators.slice(0, 2);
  }
  return entry.emotion_result ? [entry.emotion_result] : [];
}

function JournalHistory({ entries }) {
  const [filter, setFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => emotionMeta(e.emotion_result).group === filter);
  }, [entries, filter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5" style={{ border: '0.5px solid rgba(28,36,32,0.1)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconBook2 size={22} className="text-brand-ink/70" />
          <div>
            <p className="font-display text-lg font-semibold leading-tight">Journal History</p>
            <p className="text-xs text-brand-ink/50">Your past thoughts, your growth.</p>
          </div>
        </div>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}
          className="text-sm border border-brand-ink/15 rounded-full px-3.5 py-1.5 bg-brand-surface shrink-0"
        >
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      <div className="mt-4 divide-y divide-brand-ink/5">
        {filtered.length === 0 ? (
          <p className="text-brand-ink/50 text-sm py-8 text-center">
            {entries.length === 0 ? "No entries yet — your first one is just a tap away." : 'No entries match this filter.'}
          </p>
        ) : (
          visible.map((entry) => {
            const meta = emotionMeta(entry.emotion_result);
            const tags = tagsFor(entry);
            const date = new Date(entry.created_at);
            return (
              <button
                key={entry.journal_id}
                onClick={() => setSelectedEntry(entry)}
                className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-brand-ink/5 rounded-xl px-1.5 -mx-1.5"
              >
                <span
                  className="w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ backgroundColor: `${meta.hex}33` }}
                >
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-brand-ink/80 truncate">{truncate(entry.transcript)}</p>
                  <p className="text-xs text-brand-ink/40 mt-0.5">
                    {date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}
                    {date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {tags.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {tags.map((t) => (
                        <span key={t} className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full capitalize ${emotionMeta(t).pill}`}>
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <IconChevronRight size={16} className="text-brand-ink/30 shrink-0" />
              </button>
            );
          })
        )}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
          className="w-full flex items-center justify-center gap-1 text-sm font-medium text-brand-primary py-2.5 mt-2 border-t border-brand-ink/5"
        >
          View More <IconChevronDown size={14} />
        </button>
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
              <span className="text-3xl">{emotionMeta(selectedEntry.emotion_result).emoji}</span>
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
