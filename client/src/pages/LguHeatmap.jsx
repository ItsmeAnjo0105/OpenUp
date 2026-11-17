import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconMap2, IconSearch, IconBulb, IconArrowRight } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

// Same risk_band vocabulary as LguDashboard's mini grid -- a plain flagged-
// resident ratio within the selected window, not a clinical or AI-driven score.
const RISK_STYLE = {
  no_data: { bg: 'bg-brand-ink/10', text: 'text-brand-ink/40', label: 'No data' },
  low: { bg: 'bg-green-200', text: 'text-green-800', label: 'Low' },
  mild: { bg: 'bg-lime-200', text: 'text-lime-800', label: 'Mild' },
  moderate: { bg: 'bg-amber-200', text: 'text-amber-800', label: 'Moderate' },
  high: { bg: 'bg-orange-300', text: 'text-orange-900', label: 'High' },
  critical: { bg: 'bg-red-300', text: 'text-red-900', label: 'Critical' },
};
const DISTRESS_FILTERS = ['all', 'no_data', 'low', 'mild', 'moderate', 'high', 'critical'];
const RANGES = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
];

function LguHeatmap() {
  const [citywide, setCitywide] = useState([]);
  const [error, setError] = useState('');
  const [distressFilter, setDistressFilter] = useState('all');
  const [range, setRange] = useState('week');
  const [search, setSearch] = useState('');
  const user = getStoredUser();

  useEffect(() => {
    fetch(`${API_URL}/lgu/citywide-overview?range=${range}`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setCitywide(body) : setError(body?.error || 'Could not load the heatmap.')))
      .catch(() => setError('Could not reach the server.'));
  }, [range]);

  const visible = citywide
    .filter((b) => distressFilter === 'all' || b.risk_band === distressFilter)
    .filter((b) => !search || b.name.toLowerCase().includes(search.toLowerCase()));

  const mine = citywide.find((b) => b.barangay_id === user?.barangay_id);
  const rangeLabel = RANGES.find((r) => r.key === range)?.label.toLowerCase();

  const insight = useMemo(() => {
    const topFlagged = [...citywide]
      .filter((b) => b.recent_flag_count > 0)
      .sort((a, b) => b.recent_flag_count - a.recent_flag_count)
      .slice(0, 2);

    if (topFlagged.length === 0) {
      return `No barangays have reported safety flags ${rangeLabel}.`;
    }
    let text = `Barangay ${topFlagged.map((b) => b.name).join(' and ')} show${topFlagged.length === 1 ? 's' : ''} the highest concentration of reported distress and crisis flags ${rangeLabel}.`;
    if (mine) {
      const label = (RISK_STYLE[mine.risk_band] || RISK_STYLE.no_data).label;
      text += ` Your barangay is currently at a ${label} level`;
      text += ['high', 'critical'].includes(mine.risk_band)
        ? ' -- consider reviewing residents flagged in your Manage Residents registry.'
        : '.';
    }
    return text;
  }, [citywide, mine, rangeLabel]);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconMap2 size={22} className="text-brand-primary" /> Mental Health Heatmap
          </h1>
          <p className="text-brand-ink/60 text-sm">Barangay-level emotional wellness patterns.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-6 mb-5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => { playClick(); setRange(r.key); }}
            onMouseEnter={playHover}
            className={`interactive text-xs font-medium px-3.5 py-2 rounded-full ${
              range === r.key ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-base font-semibold">
            {citywide[0]?.city || 'City'} — {citywide.length} Barangays
          </h2>
          <div className="relative">
            <IconSearch size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search barangay..."
              className="border border-brand-ink/15 rounded-full pl-9 pr-4 py-1.5 text-xs w-44"
            />
          </div>
        </div>
        <p className="text-xs text-brand-ink/50 mb-4">Color intensity reflects reported distress & crisis-flag density.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {DISTRESS_FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => { playClick(); setDistressFilter(key); }}
              onMouseEnter={playHover}
              className={`interactive text-[11px] font-medium px-3 py-1.5 rounded-full ${
                distressFilter === key ? 'bg-brand-ink text-white' : 'border border-brand-ink/15 text-brand-ink/60'
              }`}
            >
              {key === 'all' ? 'All levels' : RISK_STYLE[key].label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No barangays match this filter.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {visible.map((b) => {
              const style = RISK_STYLE[b.risk_band] || RISK_STYLE.no_data;
              const isMine = user?.barangay_id === b.barangay_id;
              return (
                <div
                  key={b.barangay_id}
                  className={`rounded-xl px-3 py-4 text-center ${style.bg} ${style.text} ${isMine ? 'ring-2 ring-brand-primary ring-offset-1' : ''}`}
                >
                  <p className="text-xs font-medium leading-tight truncate">{b.name}{isMine ? ' (You)' : ''}</p>
                  <p className="text-[10px] opacity-70 mt-1">{b.high_risk_count}/{b.resident_count} flagged</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-5 text-[11px] text-brand-ink/50">
          {Object.entries(RISK_STYLE).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${s.bg}`} /> {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-2">
          <IconBulb size={16} className="text-brand-primary" /> Insight
        </h2>
        <p className="text-sm text-brand-ink/70">{insight}</p>
        {mine && ['high', 'critical'].includes(mine.risk_band) && (
          <Link
            to="/lgu/residents"
            onMouseEnter={playHover}
            onClick={playClick}
            className="interactive-nav inline-flex items-center gap-1 text-xs font-medium text-brand-primary mt-3"
          >
            Go to Manage Residents <IconArrowRight size={13} />
          </Link>
        )}
      </div>
    </LguLayout>
  );
}

export default LguHeatmap;
