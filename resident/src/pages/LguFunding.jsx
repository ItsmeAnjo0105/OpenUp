import { useEffect, useState } from 'react';
import { IconCoin } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

const SUBSCRIPTION_LABEL = { active: 'Active', inactive: 'Inactive', past_due: 'Past due', cancelled: 'Cancelled' };

function LguFunding() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load funding data.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const spentPercent = data && data.budget_funded > 0 ? Math.min(100, (data.budget_spent / data.budget_funded) * 100) : 0;

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCoin size={22} className="text-brand-primary" /> Funding & Budget Analytics
          </h1>
          <p className="text-brand-ink/60 text-sm">Funding and subscription changes are managed by the OpenUp admin team.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4 mt-6 mb-5">
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <p className="text-xs text-brand-ink/50">Funded</p>
              <p className="text-xl font-semibold mt-1">₱{data.budget_funded.toLocaleString()}</p>
            </div>
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <p className="text-xs text-brand-ink/50">Spent</p>
              <p className="text-xl font-semibold mt-1">₱{data.budget_spent.toLocaleString()}</p>
            </div>
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <p className="text-xs text-brand-ink/50">Remaining</p>
              <p className="text-xl font-semibold mt-1">₱{data.budget_remaining.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-base font-semibold">Budget utilization</h2>
              <span className="text-xs text-brand-ink/50">{Math.round(spentPercent)}% spent</span>
            </div>
            <div className="h-2.5 bg-brand-ink/10 rounded-full overflow-hidden">
              <div className="h-full bg-brand-primary rounded-full transition-all duration-500" style={{ width: `${spentPercent}%` }} />
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Subscription</h2>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                data.subscription_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-brand-ink/5 text-brand-ink/50'
              }`}>
                {SUBSCRIPTION_LABEL[data.subscription_status] || data.subscription_status}
              </span>
            </div>
            <p className="text-xs text-brand-ink/50 mt-2">
              A subscription must be active before your budget can be funded, and funding must cover an amount
              before Care Credits can be issued against it.
            </p>
          </div>
        </>
      )}
    </LguLayout>
  );
}

export default LguFunding;
