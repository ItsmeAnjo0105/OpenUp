import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import {
  IconUsers, IconAlertTriangle, IconCreditCard, IconChartBar,
  IconUserCog, IconFileDownload, IconHeartHandshake, IconWorld, IconChevronRight,
} from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import IssueCreditsModal from '../components/IssueCreditsModal';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

// Mirrors the risk_band values from GET /lgu/citywide-overview -- a plain
// flagged-resident ratio, not a clinical or AI-driven score.
const RISK_STYLE = {
  no_data: { bg: 'bg-brand-ink/10', text: 'text-brand-ink/40', label: 'No data' },
  low: { bg: 'bg-green-200', text: 'text-green-800', label: 'Low' },
  mild: { bg: 'bg-lime-200', text: 'text-lime-800', label: 'Mild' },
  moderate: { bg: 'bg-amber-200', text: 'text-amber-800', label: 'Moderate' },
  high: { bg: 'bg-orange-300', text: 'text-orange-900', label: 'High' },
  critical: { bg: 'bg-red-300', text: 'text-red-900', label: 'Critical' },
};

function LguDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [citywide, setCitywide] = useState([]);
  const [citywideError, setCitywideError] = useState('');
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const loadDashboard = () => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load your dashboard.')))
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(() => {
    loadDashboard();
    fetch(`${API_URL}/lgu/citywide-overview`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setCitywide(body) : setCitywideError(body?.error || 'Could not load citywide data.')))
      .catch(() => setCitywideError('Could not reach the server.'));
  }, []);

  const alerts = useMemo(
    () => citywide
      .filter((b) => b.risk_band === 'high' || b.risk_band === 'critical')
      .sort((a, b) => b.recent_flag_count - a.recent_flag_count),
    [citywide]
  );

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {data ? `Welcome, Barangay ${data.barangay.name}! 🎉` : 'Welcome!'}
          </h1>
          <p className="text-brand-ink/60 text-sm">Your barangay's mental wellness overview.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-ink/40 mt-6 mb-2">Your barangay</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<IconUsers size={18} />} iconBg="bg-sky-100 text-sky-700" value={data.resident_count} label="Registered residents" />
            <StatCard icon={<IconAlertTriangle size={18} />} iconBg="bg-red-100 text-red-700" value={data.high_risk_count} label="High-risk residents flagged" />
            <StatCard icon={<IconCreditCard size={18} />} iconBg="bg-amber-100 text-amber-700" value={`₱${data.care_credits_used_this_month.toLocaleString()}`} label="Care credits used this month" />
            <StatCard icon={<IconChartBar size={18} />} iconBg="bg-violet-100 text-violet-700" value={data.wellness_index != null ? `${data.wellness_index}%` : '—'} label="Barangay wellness index" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold">Barangay {data.barangay.name} engagement</h2>
              <p className="text-xs text-brand-ink/50 mb-4">Weekly active residents (logged a mood check-in)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.weekly_engagement}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} width={24} allowDecimals={false} />
                  <Bar dataKey="active_residents" fill="#2F5D50" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold mb-3">Quick actions</h2>
              <div className="space-y-2">
                <Link
                  to="/lgu/residents"
                  onMouseEnter={playHover}
                  onClick={playClick}
                  className="interactive-card flex items-center gap-3 p-3 rounded-xl border border-brand-ink/10"
                >
                  <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center shrink-0"><IconUserCog size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Manage Residents</p>
                    <p className="text-[11px] text-brand-ink/50">View risk registry</p>
                  </div>
                </Link>
                <Link
                  to="/lgu/report"
                  onMouseEnter={playHover}
                  onClick={playClick}
                  className="interactive-card flex items-center gap-3 p-3 rounded-xl border border-brand-ink/10"
                >
                  <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><IconFileDownload size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Generate Report</p>
                    <p className="text-[11px] text-brand-ink/50">Auto accomplishment report</p>
                  </div>
                </Link>
                <button
                  onClick={() => { playClick(); setIssueModalOpen(true); }}
                  onMouseEnter={playHover}
                  className="interactive-card w-full flex items-center gap-3 p-3 rounded-xl border border-brand-ink/10 text-left"
                >
                  <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><IconHeartHandshake size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Issue Care Credits</p>
                    <p className="text-[11px] text-brand-ink/50">Fund resident sessions</p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-8 mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-ink/40">Citywide overview</p>
            <Link
              to="/lgu/heatmap"
              onMouseEnter={playHover}
              onClick={playClick}
              className="interactive-nav text-xs font-medium text-brand-primary flex items-center gap-0.5"
            >
              View Full Heatmap <IconChevronRight size={13} />
            </Link>
          </div>

          {citywideError && <p className="text-sm text-red-600 mb-3">{citywideError}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold mb-1">{data.barangay.city || 'City'} — barangay comparison</h2>
              <p className="text-xs text-brand-ink/50 mb-4">Your barangay is highlighted. Risk band reflects each barangay's share of flagged residents.</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {citywide.map((b) => {
                  const style = RISK_STYLE[b.risk_band] || RISK_STYLE.no_data;
                  const isMine = b.barangay_id === data.barangay.barangay_id;
                  return (
                    <div
                      key={b.barangay_id}
                      className={`rounded-xl px-2 py-3 text-center ${style.bg} ${style.text} ${isMine ? 'ring-2 ring-brand-primary ring-offset-1' : ''}`}
                      title={`${b.name}: ${style.label}`}
                    >
                      <p className="text-[11px] font-medium leading-tight truncate">{b.name}{isMine ? ' (You)' : ''}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-brand-ink/50">
                {Object.entries(RISK_STYLE).map(([key, s]) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-sm ${s.bg}`} /> {s.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
                <IconWorld size={16} className="text-brand-primary" /> Citywide alerts
              </h2>
              <p className="text-xs text-brand-ink/50 mb-4">Visible to all barangay accounts.</p>
              {alerts.length === 0 ? (
                <p className="text-sm text-brand-ink/40">No elevated barangays right now.</p>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 6).map((b) => {
                    const style = RISK_STYLE[b.risk_band];
                    return (
                      <div key={b.barangay_id} className="flex items-start gap-2 text-sm">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${style.bg} ${style.text}`}>{style.label}</span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">Barangay {b.name}</p>
                          <p className="text-[11px] text-brand-ink/50">
                            {b.recent_flag_count > 0
                              ? `${b.recent_flag_count} safety flag${b.recent_flag_count === 1 ? '' : 's'} in the last 7 days`
                              : `${b.high_risk_count} of ${b.resident_count} residents flagged`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {issueModalOpen && data && (
        <IssueCreditsModal
          barangay={data.barangay}
          onClose={() => setIssueModalOpen(false)}
          onIssued={() => { setIssueModalOpen(false); loadDashboard(); }}
        />
      )}
    </LguLayout>
  );
}

function StatCard({ icon, iconBg, value, label }) {
  return (
    <div className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg}`}>{icon}</span>
      <p className="text-xs text-brand-ink/50 mt-3">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
    </div>
  );
}

export default LguDashboard;
