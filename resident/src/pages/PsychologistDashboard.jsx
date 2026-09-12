import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

function PsychologistDashboard() {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
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

    fetch(`${API_URL}/psychologists/me`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setProfile(data) : setProfileError(data.error)))
      .catch(() => setProfileError('Could not load your profile.'));
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

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 space-y-4">
          {profileError && <p className="text-sm text-red-600">{profileError}</p>}

          {profile && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                {profile.is_verified ? (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                    Verified
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                    Pending verification
                  </span>
                )}
              </div>
              <p className="text-sm text-brand-ink/70">License no: {profile.license_no}</p>
              <p className="text-sm text-brand-ink/70">Credentials: {profile.credentials}</p>
              <p className="text-sm text-brand-ink/70">Session price: ₱{Number(profile.session_price).toLocaleString()}</p>
              {!profile.is_verified && (
                <p className="text-sm text-brand-ink/50 mt-3">
                  An admin needs to verify your license before you appear to residents and can accept bookings.
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-brand-ink/60">
            Appointment requests will appear here once you're verified.
          </p>
        </div>
      </div>
    </div>
  );
}

export default PsychologistDashboard;
