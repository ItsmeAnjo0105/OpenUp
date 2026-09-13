import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader } from '../config';

function PsychologistRequests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    fetch(`${API_URL}/psychologists/me/booking-requests`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setRequests(data);
        else setError(data?.error || 'Could not load appointment requests.');
      })
      .catch(() => setError('Could not load appointment requests.'));
  };

  useEffect(load, []);

  const act = async (bookingId, action) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/${action}`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.booking_id !== bookingId));
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Appointment Requests</h1>
      <p className="text-brand-ink/60 text-sm mb-8">Accept or decline residents asking to book you.</p>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

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
                  <p className="text-xs text-brand-ink/60 mt-1">{new Date(r.schedule).toLocaleString()}</p>
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
    </PsychologistLayout>
  );
}

export default PsychologistRequests;
