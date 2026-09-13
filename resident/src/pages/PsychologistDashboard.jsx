import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader, getStoredUser } from '../config';

const MOOD_COLORS = { improving: '#2F5D50', stable: '#E8A33D', needs_attention: '#D9534F' };

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
    ? [
        { key: 'improving', label: 'Improving', value: summary.mood_distribution.improving },
        { key: 'stable', label: 'Stable', value: summary.mood_distribution.stable },
        { key: 'needs_attention', label: 'Needs attention', value: summary.mood_distribution.needs_attention },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <PsychologistLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Welcome, {user.name} 🌿</h1>
          <p className="text-brand-ink/60 text-sm">Your practice at a glance.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon="📅" value={summary.today_sessions} label="Today's sessions" />
            <StatCard icon="📥" value={summary.pending_requests} label="Pending requests" />
            <StatCard icon="✅" value={summary.completed_sessions} label="Completed sessions" />
            <StatCard
              icon="💰"
              value={`₱${summary.monthly_earnings_paid.toLocaleString()}`}
              label={
                summary.monthly_earnings_pending > 0
                  ? `Paid this month (+₱${summary.monthly_earnings_pending.toLocaleString()} pending)`
                  : 'Paid this month'
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold mb-4">Appointments per month</h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={summary.appointments_per_month}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
                  <Bar dataKey="count" fill="#2F5D50" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-base font-semibold mb-4">Mood distribution (clients)</h2>
              {moodData.length === 0 ? (
                <p className="text-sm text-brand-ink/50">
                  Not enough mood check-in history from your clients yet.
                </p>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={moodData} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={2}>
                        {moodData.map((d) => (
                          <Cell key={d.key} fill={MOOD_COLORS[d.key]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {moodData.map((d) => (
                      <div key={d.key} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MOOD_COLORS[d.key] }} />
                        <span className="text-brand-ink/70">{d.label} {d.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <h2 className="font-display text-base font-semibold mb-4">Today's sessions</h2>
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

function StatCard({ icon, value, label }) {
  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
      <span className="text-xl">{icon}</span>
      <p className="text-2xl font-semibold mt-2">{value}</p>
      <p className="text-xs text-brand-ink/50 mt-0.5">{label}</p>
    </div>
  );
}

export default PsychologistDashboard;
