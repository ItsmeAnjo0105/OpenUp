import { useEffect, useState } from 'react';
import { IconCalendarEvent } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminAppointments() {
  const [bookings, setBookings] = useState([]);
  const [verifiedPsychologists, setVerifiedPsychologists] = useState([]);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const loadBookings = () => {
    fetch(`${API_URL}/admin/bookings`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setBookings(data);
        else setError(data?.error || 'Could not load bookings.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(() => {
    loadBookings();
    fetch(`${API_URL}/admin/psychologists?status=verified`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setVerifiedPsychologists(data); })
      .catch(() => {});
  }, []);

  const cancelBooking = async (bookingId) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/bookings/${bookingId}/cancel`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      loadBookings();
    } catch {
      setError('Could not reach the server.');
    }
  };

  const confirmCancelBooking = (booking) => {
    setConfirmDialog({
      title: 'Are you sure you want to cancel this booking?',
      message: `${booking.User?.name || 'This resident'}'s booking will be cancelled and any credit or payment released.`,
      confirmLabel: 'Cancel booking',
      destructive: true,
      onConfirm: () => cancelBooking(booking.booking_id),
    });
  };

  const reassignBooking = async (bookingId, newPsychologistId) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/bookings/${bookingId}/reassign`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ psychologist_id: newPsychologistId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setReassigning(null);
      loadBookings();
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCalendarEvent size={22} className="text-brand-primary" /> Appointments
          </h1>
          <p className="text-brand-ink/60 text-sm">Every active booking on the platform.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
        {bookings.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No active appointments.</p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.booking_id} className="border border-brand-ink/10 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {b.User?.name || `Resident #${b.resident_id}`} → {b.Psychologist?.User?.name || `Psychologist #${b.psychologist_id}`}
                    </p>
                    <p className="text-xs text-brand-ink/60 mt-1">{new Date(b.schedule).toLocaleString()} · {b.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { playClick(); setReassigning(reassigning === b.booking_id ? null : b.booking_id); }}
                      onMouseEnter={playHover}
                      className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                    >
                      Reassign
                    </button>
                    <button
                      onClick={() => { playClick(); confirmCancelBooking(b); }}
                      onMouseEnter={playHover}
                      className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {reassigning === b.booking_id && (
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      onChange={(e) => e.target.value && reassignBooking(b.booking_id, e.target.value)}
                      defaultValue=""
                      className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
                    >
                      <option value="" disabled>Reassign to...</option>
                      {verifiedPsychologists
                        .filter((p) => p.psychologist_id !== b.psychologist_id)
                        .map((p) => (
                          <option key={p.psychologist_id} value={p.psychologist_id}>{p.User?.name}</option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

export default AdminAppointments;
