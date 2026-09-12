import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

function PsychologistDashboard() {
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [requests, setRequests] = useState([]);
  const [requestsError, setRequestsError] = useState('');
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  const loadRequests = () => {
    fetch(`${API_URL}/psychologists/me/booking-requests`, { headers: authHeader() })
      .then((res) => res.json())
      .then(setRequests)
      .catch(() => setRequestsError('Could not load appointment requests.'));
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
        loadRequests();
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

  const act = async (bookingId, action) => {
    setRequestsError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/${action}`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestsError(data.error || 'Something went wrong.');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.booking_id !== bookingId));
    } catch {
      setRequestsError('Could not reach the server.');
    }
  };

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

        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="font-display text-lg font-semibold mb-4">Appointment requests</h2>

          {requestsError && <p className="text-sm text-red-600 mb-3">{requestsError}</p>}

          {requests.length === 0 ? (
            <p className="text-sm text-brand-ink/50">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.booking_id}
                  className="border border-brand-ink/10 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">{r.User?.name || `Resident #${r.resident_id}`}</p>
                    <p className="text-xs text-brand-ink/60 mt-1">
                      {new Date(r.schedule).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(r.booking_id, 'accept')}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => act(r.booking_id, 'decline')}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                    >
                      Decline
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

export default PsychologistDashboard;
