import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

function PsychologistDashboard() {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  useEffect(() => {
    if (!user || user.role !== 'psychologist') {
      navigate('/login');
      return;
    }

    fetch(`${API_URL}/auth/me`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('invalid session');
        setChecking(false);
      })
      .catch(() => {
        localStorage.removeItem('openup_token');
        localStorage.removeItem('openup_user');
        navigate('/login');
      });
  }, []);

  if (checking) return null;

  return (
    <div className="min-h-screen bg-brand-bg px-8 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold">Psychologist Dashboard</h1>
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
          <p className="text-sm text-brand-ink/60">
            Appointment requests and profile verification status will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PsychologistDashboard;
