import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState([]);
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  const loadPending = () => {
    fetch(`${API_URL}/admin/psychologists?status=pending`, { headers: authHeader() })
      .then((res) => res.json())
      .then(setPending)
      .catch(() => setActionError('Could not load pending applications.'));
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }

    fetch(`${API_URL}/auth/me`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('invalid session');
        setChecking(false);
        loadPending();
      })
      .catch(() => {
        localStorage.removeItem('openup_token');
        localStorage.removeItem('openup_user');
        navigate('/login');
      });
  }, []);

  const act = async (psychologistId, action) => {
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/admin/psychologists/${psychologistId}/${action}`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Something went wrong.');
        return;
      }
      setPending((prev) => prev.filter((p) => p.psychologist_id !== psychologistId));
    } catch {
      setActionError('Could not reach the server.');
    }
  };

  if (checking) return null;

  return (
    <div className="min-h-screen bg-brand-bg px-8 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-brand-ink/60 text-sm">Welcome, {user.name}.</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm font-medium text-brand-ink/60 hover:text-brand-ink"
          >
            Log out
          </button>
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Pending psychologist applications</h2>

          {actionError && <p className="text-sm text-red-600 mb-3">{actionError}</p>}

          {pending.length === 0 ? (
            <p className="text-sm text-brand-ink/50">No pending applications.</p>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => (
                <div
                  key={p.psychologist_id}
                  className="border border-brand-ink/10 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">{p.User?.name}</p>
                    <p className="text-xs text-brand-ink/50">{p.User?.email}</p>
                    <p className="text-xs text-brand-ink/60 mt-1">License: {p.license_no}</p>
                    <p className="text-xs text-brand-ink/60">Credentials: {p.credentials}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(p.psychologist_id, 'verify')}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(p.psychologist_id, 'reject')}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
