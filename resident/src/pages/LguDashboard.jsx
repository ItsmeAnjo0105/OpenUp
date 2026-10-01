import { useEffect, useState } from 'react';
import {
  IconUsers, IconCalendarEvent, IconCircleCheck, IconWallet, IconHeartHandshake,
} from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

const SUBSCRIPTION_LABEL = {
  active: 'Active',
  inactive: 'Inactive',
  past_due: 'Past due',
  cancelled: 'Cancelled',
};

function LguDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load your dashboard.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {data ? `Welcome, ${data.barangay.name}! 🌿` : 'Welcome!'}
          </h1>
          <p className="text-brand-ink/60 text-sm">
            {data ? `${data.barangay.name}${data.barangay.city ? `, ${data.barangay.city}` : ''}` : 'Your barangay at a glance.'}
          </p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-6">
            <StatCard
              icon={<IconUsers size={18} />}
              iconBg="bg-sky-100 text-sky-700"
              value={data.resident_count}
              label="Residents"
            />
            <StatCard
              icon={<IconCalendarEvent size={18} />}
              iconBg="bg-violet-100 text-violet-700"
              value={data.session_count}
              label="Sessions requested"
            />
            <StatCard
              icon={<IconCircleCheck size={18} />}
              iconBg="bg-green-100 text-green-700"
              value={data.confirmed_session_count}
              label="Sessions confirmed"
            />
            <StatCard
              icon={<IconWallet size={18} />}
              iconBg="bg-amber-100 text-amber-700"
              value={`₱${data.budget_remaining.toLocaleString()}`}
              label="Budget remaining"
            />
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <IconHeartHandshake size={18} className="text-brand-primary" /> Care credits
              </h2>
              <span className="text-xs text-brand-ink/50">
                Issued ₱{data.care_credits_issued.toLocaleString()} · Used ₱{data.care_credits_used.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-brand-ink/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-primary rounded-full transition-all duration-500"
                style={{ width: `${data.care_credits_issued > 0 ? Math.min(100, (data.care_credits_used / data.care_credits_issued) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-lg font-semibold">Budget & subscription</h2>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                data.subscription_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-brand-ink/5 text-brand-ink/50'
              }`}>
                {SUBSCRIPTION_LABEL[data.subscription_status] || data.subscription_status}
              </span>
            </div>
            <p className="text-xs text-brand-ink/50 mb-4">
              Funding and subscription changes are managed by the OpenUp admin team.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-brand-ink/50">Funded</p>
                <p className="text-base font-semibold">₱{data.budget_funded.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Spent</p>
                <p className="text-base font-semibold">₱{data.budget_spent.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-brand-ink/50">Remaining</p>
                <p className="text-base font-semibold">₱{data.budget_remaining.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </>
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
