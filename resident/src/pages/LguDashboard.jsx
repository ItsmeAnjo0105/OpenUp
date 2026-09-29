import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

const SUBSCRIPTION_LABEL = {
  active: 'Active',
  inactive: 'Inactive',
  past_due: 'Past due',
  cancelled: 'Cancelled',
};

function LguDashboard() {
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  useEffect(() => {
    if (!user || user.role !== 'lgu') {
      navigate('/login');
      return;
    }

    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        setChecking(false);
        if (ok) setData(body);
        else setError(body?.error || 'Could not load your dashboard.');
      })
      .catch(() => {
        setChecking(false);
        setError('Could not reach the server.');
      });
  }, []);

  if (checking) return null;

  return (
    <div className="min-h-screen bg-brand-bg px-8 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              {data ? `Welcome, ${data.barangay.name}!` : 'Welcome!'}
            </h1>
            <p className="text-brand-ink/60 text-sm">
              {data ? `${data.barangay.name}${data.barangay.city ? `, ${data.barangay.city}` : ''}` : `Logged in as ${user.name}.`}
            </p>
          </div>
          <button onClick={handleLogout} className="text-sm font-medium text-brand-ink/60 hover:text-brand-ink">
            Log out
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
                <p className="text-xs text-brand-ink/50">Residents</p>
                <p className="text-2xl font-semibold mt-1">{data.resident_count}</p>
              </div>
              <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
                <p className="text-xs text-brand-ink/50">Sessions requested</p>
                <p className="text-2xl font-semibold mt-1">{data.session_count}</p>
              </div>
              <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
                <p className="text-xs text-brand-ink/50">Sessions confirmed</p>
                <p className="text-2xl font-semibold mt-1">{data.confirmed_session_count}</p>
              </div>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold">Care credits</h2>
                <span className="text-xs text-brand-ink/50">
                  Issued ₱{data.care_credits_issued.toLocaleString()} · Used ₱{data.care_credits_used.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-brand-ink/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary rounded-full"
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
      </div>
    </div>
  );
}

export default LguDashboard;
