import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PsychologistCard from '../components/PsychologistCard';
import BookingCalendar from '../components/BookingCalendar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL } from '../config';

function BookCounseling() {
  const [psychologists, setPsychologists] = useState([]);
  const [selected, setSelected] = useState(null);
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    fetch(`${API_URL}/psychologists`)
      .then((res) => res.json())
      .then(setPsychologists)
      .catch(() => {});
  }, []);

  const openBookingModal = (psychologist) => {
    setSelected(psychologist);
    setSchedule('');
    setStatus('');
  };

  const closeModal = () => {
    setSelected(null);
    setStatus('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const dateLabel = new Date(schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    setConfirmDialog({
      title: 'Are you sure you want to continue?',
      message: `You're requesting a session with ${selected.User?.name || 'this psychologist'} on ${dateLabel}. They'll need to accept it first.`,
      confirmLabel: 'Confirm booking',
      destructive: false,
      onConfirm: submitBooking,
    });
  };

  const submitBooking = async () => {
    setStatus('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resident_id: user.user_id,
          psychologist_id: selected.psychologist_id,
          schedule,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Something went wrong.');
        setLoading(false);
        return;
      }

      setStatus(
        data.care_credit_reserved
          ? "Request sent! Your Care Credit is reserved and will be used once the psychologist accepts."
          : "Request sent! You'll be notified once the psychologist responds."
      );
      setLoading(false);
      setTimeout(() => navigate('/dashboard'), 1800);
    } catch {
      setStatus('Could not reach the server.');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Book Counseling</h1>
        <p className="text-brand-ink/60 text-sm mb-8">Pick a psychologist and a time that works for you.</p>

        {psychologists.length === 0 ? (
          <p className="text-brand-ink/50 text-sm">No verified psychologists available yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {psychologists.map((p) => (
              <PsychologistCard key={p.psychologist_id} psychologist={p} onBook={openBookingModal} />
            ))}
          </div>
        )}

        {selected && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
            onClick={closeModal}
          >
            <div
              className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-display text-lg font-semibold">
                  {selected.User?.name || `Psychologist #${selected.psychologist_id}`}
                </p>
                <button onClick={closeModal} className="text-brand-ink/50 text-xl">✕</button>
              </div>
              <p className="text-sm text-brand-ink/60 mb-6">
                ₱{Number(selected.session_price).toLocaleString()}/session
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Pick a date & time</label>
                  <BookingCalendar psychologistId={selected.psychologist_id} onSelect={setSchedule} />
                </div>

                {status && <p className="text-sm text-brand-primary font-medium">{status}</p>}

                <button
                  type="submit"
                  disabled={loading || !schedule}
                  className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
                >
                  {loading ? 'Booking...' : schedule ? 'Confirm booking' : 'Select a time above'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </Layout>
  );
}

export default BookCounseling;
