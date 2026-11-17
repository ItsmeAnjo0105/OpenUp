import { useMemo, useRef, useState } from 'react';
import { IconChevronRight, IconChevronDown, IconBook2, IconTrash, IconPencil, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';
import { emotionMeta } from '../utils/voiceEmotions';
import JournalAnalysis from './JournalAnalysis';
import ConfirmDialog from './ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

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

function JournalHistory({ entries, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [regenerate, setRegenerate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);

  const selectedEntry = selectedId ? entries.find((e) => e.journal_id === selectedId) : null;

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => emotionMeta(e.emotion_result).group === filter);
  }, [entries, filter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const openEntry = (entry) => {
    playClick();
    setSelectedId(entry.journal_id);
    setEditing(false);
    setError('');
    setAudioUrl(null);
    setAudioPlaying(false);
    fetch(`${API_URL}/voice-journal/${entry.journal_id}/audio-url`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (ok) setAudioUrl(data.url); })
      .catch(() => {});
  };

  const closeModal = () => {
    setSelectedId(null);
    setEditing(false);
  };

  const startEdit = () => {
    playClick();
    setEditTitle(selectedEntry.title || '');
    setEditTranscript(selectedEntry.transcript || '');
    setRegenerate(false);
    setEditing(true);
    setError('');
  };

  const saveEdit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/voice-journal/${selectedEntry.journal_id}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, transcript: editTranscript, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not save changes.'); return; }
      setEditing(false);
      onRefresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const toggleRecommendation = async (index, completed) => {
    try {
      const res = await fetch(`${API_URL}/voice-journal/${selectedEntry.journal_id}/recommendations/${index}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (res.ok) onRefresh();
    } catch {
      // leave it as-is, the user can try again
    }
  };

  const deleteEntry = (entry) => {
    setConfirmDialog({
      title: 'Delete this journal entry?',
      message: "This will permanently delete the recording, transcript, and AI analysis. This action cannot be undone.",
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`${API_URL}/voice-journal/${entry.journal_id}`, {
          method: 'DELETE',
          headers: authHeader(),
        });
        if (res.ok) {
          if (selectedId === entry.journal_id) closeModal();
          onRefresh();
        }
      },
    });
  };

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
    } else {
      audio.play();
      setAudioPlaying(true);
    }
  };

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
              <div key={entry.journal_id} className="flex items-center gap-1">
                <button
                  onClick={() => openEntry(entry)}
                  onMouseEnter={playHover}
                  className="interactive flex-1 min-w-0 flex items-center gap-3 py-3.5 text-left hover:bg-brand-ink/5 rounded-xl px-1.5 -mx-1.5"
                >
                  <span
                    className="w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${meta.hex}33` }}
                  >
                    {meta.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brand-ink/90 truncate">{entry.title || truncate(entry.transcript, 40)}</p>
                    <p className="text-sm text-brand-ink/70 truncate">{truncate(entry.transcript)}</p>
                    <p className="text-xs text-brand-ink/40 mt-0.5">
                      {date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-brand-ink/35">Possibly:</span>
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
                <button
                  onClick={() => deleteEntry(entry)}
                  onMouseEnter={playHover}
                  className="interactive shrink-0 text-brand-ink/30 hover:text-red-600 p-2"
                  aria-label="Delete journal entry"
                >
                  <IconTrash size={16} />
                </button>
              </div>
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
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4 py-8"
          onClick={closeModal}
        >
          <div
            className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto chat-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-display text-lg font-semibold">
                {editing ? 'Edit entry' : (selectedEntry.title || new Date(selectedEntry.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }))}
              </p>
              <button onClick={closeModal} className="text-brand-ink/50 text-xl leading-none">✕</button>
            </div>
            <p className="text-xs text-brand-ink/40 mb-4">
              {new Date(selectedEntry.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-brand-ink/60 block mb-1">Title</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Untitled entry"
                    className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-ink/60 block mb-1">Transcript</label>
                  <textarea
                    rows={5}
                    value={editTranscript}
                    onChange={(e) => setEditTranscript(e.target.value)}
                    className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-brand-ink/70">
                  <input type="checkbox" checked={regenerate} onChange={(e) => setRegenerate(e.target.checked)} />
                  Regenerate AI analysis and recommendations for the updated text
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditing(false)}
                    className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                  >
                    {saving ? (regenerate ? 'Re-analyzing...' : 'Saving...') : 'Save changes'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs font-medium text-brand-ink/50 mb-1">Transcript</p>
                <p className="text-sm text-brand-ink/80 mb-4">"{selectedEntry.transcript?.trim()}"</p>

                {audioUrl && (
                  <div className="flex items-center gap-3 bg-brand-ink/5 rounded-xl p-3 mb-4">
                    <audio ref={audioRef} src={audioUrl} onEnded={() => setAudioPlaying(false)} />
                    <button
                      onClick={toggleAudio}
                      className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0"
                      aria-label={audioPlaying ? 'Pause recording' : 'Play recording'}
                    >
                      {audioPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                    </button>
                    <p className="text-xs text-brand-ink/60">Listen to the original recording</p>
                  </div>
                )}

                <JournalAnalysis entry={selectedEntry} onToggleRecommendation={toggleRecommendation} />

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={startEdit}
                    onMouseEnter={playHover}
                    className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20 flex items-center justify-center gap-1.5"
                  >
                    <IconPencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => deleteEntry(selectedEntry)}
                    onMouseEnter={playHover}
                    className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-red-300 text-red-600 flex items-center justify-center gap-1.5"
                  >
                    <IconTrash size={14} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

export default JournalHistory;
