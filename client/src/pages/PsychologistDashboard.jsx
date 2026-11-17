import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { IconCalendarEvent, IconFileText, IconCircleCheck, IconWallet, IconChevronRight, IconLeaf } from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

const MOOD_COLORS = { improving: '#2F5D50', stable: '#E8A33D', needs_attention: '#D9534F' };
const MOOD_LABELS = { improving: 'Improving', stable: 'Stable', needs_attention: 'Declining' };

// Never shows a resident's real name here -- same masking principle as Anonymous
// Chat, applied to this at-a-glance session list too.
function anonymizeResidentId(residentId) {
  return `Anonymous #${1000 + Number(residentId)}`;
}

function PsychologistDashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const user = getStoredUser();

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/dashboard-summary`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setSummary(data) : setError(data?.error || 'Could not load dashboard.')))
      .catch(() => setError('Could not load dashboard.'));
  }, []);

  const moodData = summary?.mood_distribution
    ? ['improving', 'stable', 'needs_attention'].map((key) => ({
        key,
        label: MOOD_LABELS[key],
        percent: summary.mood_distribution[key],
        count: summary.mood_distribution[`${key}_count`],
      }))
    : [];
  const dominantMood = moodData.length > 0
    ? moodData.reduce((best, d) => (d.percent > best.percent ? d : best), moodData[0])
    : null;
  const chartMoodData = moodData.filter((d) => d.percent > 0);

  return (
    <PsychologistLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">Welcome, {user.name} 🌿</h1>
          <p className="text-brand-ink/60 text-sm">Here's what's happening with your practice today.</p>
        </div>

        <PsychologistTopBar showClock />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-6">
            <StatCard
              icon={<IconCalendarEvent size={18} />}
              iconBg="bg-sky-100 text-sky-700"
              value={summary.today_sessions}
              label="Today's sessions"
              caption={summary.today_sessions === 0 ? 'No sessions today' : `${summary.today_sessions} scheduled today`}
              to="/psychologist/schedule"
            />
            <StatCard
              icon={<IconFileText size={18} />}
              iconBg="bg-violet-100 text-violet-700"
              value={summary.pending_requests}
              label="Pending requests"
              caption={summary.pending_requests > 0 ? 'Needs your attention' : 'All caught up'}
              to="/psychologist/requests"
            />
            <StatCard
              icon={<IconCircleCheck size={18} />}
              iconBg="bg-green-100 text-green-700"
              value={summary.completed_sessions}
              label="Completed sessions"
              caption="All-time total"
              to="/psychologist/reports"
            />
            <StatCard
              icon={<IconWallet size={18} />}
              iconBg="bg-amber-100 text-amber-700"
              value={`₱${summary.monthly_earnings_paid.toLocaleString()}`}
              label="Paid this month"
              caption={summary.monthly_earnings_pending > 0 ? `+₱${summary.monthly_earnings_pending.toLocaleString()} pending` : 'No pending payments'}
              to="/psychologist/reports"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold">Appointments per month</h2>
                <span className="text-xs text-brand-ink/40">Last 7 months</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.appointments_per_month}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} width={24} allowDecimals={false} />
                  <Bar dataKey="count" fill="#2F5D50" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold mb-4">Mood distribution (clients)</h2>
              {chartMoodData.length === 0 ? (
                <p className="text-sm text-brand-ink/50">
                  Not enough mood check-in history from your clients yet.
                </p>
              ) : (
                <div className="flex items-center gap-6">
                  <div className="relative shrink-0">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie data={chartMoodData} dataKey="percent" innerRadius={40} outerRadius={65} paddingAngle={2}>
                          {chartMoodData.map((d) => (
                            <Cell key={d.key} fill={MOOD_COLORS[d.key]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    {dominantMood && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-lg font-semibold leading-none">{dominantMood.percent}%</p>
                        <p className="text-[10px] text-brand-ink/50 mt-0.5">{dominantMood.label}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {moodData.map((d) => (
                      <div key={d.key} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: MOOD_COLORS[d.key] }} />
                        <span className="text-brand-ink/70">{d.label}</span>
                        <span className="text-brand-ink/40 text-xs">{d.percent}% · {d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div id="todays-sessions" className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold flex items-center gap-2">
                <IconLeaf size={16} className="text-brand-primary" /> Today's sessions
              </h2>
              <Link
                to="/psychologist/schedule"
                onMouseEnter={playHover}
                onClick={playClick}
                className="interactive flex items-center gap-1 text-xs font-medium px-3.5 py-2 rounded-full text-white"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                <IconCalendarEvent size={14} /> View calendar <IconChevronRight size={13} />
              </Link>
            </div>
            {summary.todays_sessions_detail.length === 0 ? (
              <p className="text-sm text-brand-ink/50">No sessions scheduled for today.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-brand-ink/50 uppercase">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.todays_sessions_detail.map((s) => {
                    const isUpcoming = new Date(s.schedule) > new Date();
                    return (
                      <tr key={s.booking_id} className="border-t border-brand-ink/10">
                        <td className="py-2.5">{anonymizeResidentId(s.resident_id)}</td>
                        <td className="py-2.5 text-brand-ink/60">
                          {new Date(s.schedule).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              isUpcoming ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {isUpcoming ? 'Upcoming' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </PsychologistLayout>
  );
}

function StatCard({ icon, iconBg, value, label, caption, to }) {
  return (
    <Link
      to={to}
      onMouseEnter={playHover}
      onClick={playClick}
      className="interactive-card bg-brand-surface rounded-2xl shadow-sm p-5 block"
    >
      <div className="flex items-start justify-between">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg}`}>{icon}</span>
        <IconChevronRight size={15} className="text-brand-ink/30 mt-1" />
      </div>
      <p className="text-xs text-brand-ink/50 mt-3">{label}</p>
      <p className="text-2xl font-semibold mt-0.5">{value}</p>
      {caption && <p className="text-[11px] text-brand-ink/40 mt-0.5">{caption}</p>}
    </Link>
  );
}

export default PsychologistDashboard;
