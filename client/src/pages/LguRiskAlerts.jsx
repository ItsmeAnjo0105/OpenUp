import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlertTriangle, IconArrowRight } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

const RISK_STYLE = {
  high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'High' },
  critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critical' },
};

function LguRiskAlerts() {
  const [citywide, setCitywide] = useState([]);
  const [error, setError] = useState('');
  const user = getStoredUser();

  useEffect(() => {
    fetch(`${API_URL}/lgu/citywide-overview`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setCitywide(body) : setError(body?.error || 'Could not load risk alerts.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const alerts = useMemo(
    () => citywide
      .filter((b) => b.risk_band === 'high' || b.risk_band === 'critical')
      .sort((a, b) => b.recent_flag_count - a.recent_flag_count),
    [citywide]
  );
  const mine = citywide.find((b) => b.barangay_id === user?.barangay_id);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconAlertTriangle size={22} className="text-brand-primary" /> Barangay Risk Alerts
          </h1>
          <p className="text-brand-ink/60 text-sm">City-wide, aggregated only -- never another barangay's individual residents.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {mine && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-5 mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Your barangay: {mine.high_risk_count} of {mine.resident_count} residents flagged</p>
            <p className="text-xs text-brand-ink/50 mt-0.5">Flags come from each resident's own most recent check-in.</p>
          </div>
          <Link
            to="/lgu/residents"
            onMouseEnter={playHover}
            onClick={playClick}
            className="interactive flex items-center gap-1 text-xs font-medium px-3.5 py-2 rounded-full bg-brand-primary text-white whitespace-nowrap"
          >
            View residents <IconArrowRight size={13} />
          </Link>
        </div>
      )}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <h2 className="font-display text-base font-semibold mb-1">Elevated barangays</h2>
        <p className="text-xs text-brand-ink/50 mb-4">Barangays currently at High or Critical risk band.</p>

        {alerts.length === 0 ? (
          <p className="text-sm text-brand-ink/40">No elevated barangays right now.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((b) => {
              const style = RISK_STYLE[b.risk_band];
              const isMine = b.barangay_id === user?.barangay_id;
              return (
                <div key={b.barangay_id} className="flex items-center justify-between gap-3 border border-brand-ink/10 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>{style.label}</span>
                    <p className="text-sm font-medium">Barangay {b.name}{isMine ? ' (You)' : ''}</p>
                  </div>
                  <p className="text-xs text-brand-ink/50">
                    {b.recent_flag_count > 0
                      ? `${b.recent_flag_count} safety flag${b.recent_flag_count === 1 ? '' : 's'} in the last 7 days`
                      : `${b.high_risk_count} of ${b.resident_count} residents flagged`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </LguLayout>
  );
}

export default LguRiskAlerts;
