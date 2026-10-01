import { useEffect, useState } from 'react';
import { IconMap2 } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

// Same risk_band vocabulary as LguDashboard's mini grid -- a plain flagged-
// resident ratio, not a clinical or AI-driven score.
const RISK_STYLE = {
  no_data: { bg: 'bg-brand-ink/10', text: 'text-brand-ink/40', label: 'No data' },
  low: { bg: 'bg-green-200', text: 'text-green-800', label: 'Low' },
  mild: { bg: 'bg-lime-200', text: 'text-lime-800', label: 'Mild' },
  moderate: { bg: 'bg-amber-200', text: 'text-amber-800', label: 'Moderate' },
  high: { bg: 'bg-orange-300', text: 'text-orange-900', label: 'High' },
  critical: { bg: 'bg-red-300', text: 'text-red-900', label: 'Critical' },
};
const FILTERS = ['all', 'no_data', 'low', 'mild', 'moderate', 'high', 'critical'];

function LguHeatmap() {
  const [citywide, setCitywide] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const user = getStoredUser();

  useEffect(() => {
    fetch(`${API_URL}/lgu/citywide-overview`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setCitywide(body) : setError(body?.error || 'Could not load the heatmap.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const visible = filter === 'all' ? citywide : citywide.filter((b) => b.risk_band === filter);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconMap2 size={22} className="text-brand-primary" /> Mental Health Heatmap
          </h1>
          <p className="text-brand-ink/60 text-sm">Every barangay's risk band at a glance.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="flex flex-wrap gap-2 mt-6 mb-5">
        {FILTERS.map((key) => (
          <button
            key={key}
            onClick={() => { playClick(); setFilter(key); }}
            onMouseEnter={playHover}
            className={`interactive text-xs font-medium px-3.5 py-2 rounded-full ${
              filter === key ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
            }`}
          >
            {key === 'all' ? 'All' : RISK_STYLE[key].label}
          </button>
        ))}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
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
    </LguLayout>
  );
}

export default LguHeatmap;
