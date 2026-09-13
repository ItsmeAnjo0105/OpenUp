import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

function PsychologistProfile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setProfile(data) : setError(data?.error || 'Could not load your profile.')))
      .catch(() => setError('Could not load your profile.'));
  }, []);

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Profile</h1>
      <p className="text-brand-ink/60 text-sm mb-8">Your verification status and practice details.</p>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-lg">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {profile && (
          <div>
            <div className="flex items-center gap-2 mb-3">
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
    </PsychologistLayout>
  );
}

export default PsychologistProfile;
