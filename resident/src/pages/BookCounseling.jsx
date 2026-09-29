import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconArrowLeft, IconSearch, IconCalendarEvent, IconChevronRight, IconUsersGroup, IconMoodSad, IconMoodEmpty, IconCloudRain, IconHeartHandshake, IconUsers } from '@tabler/icons-react';
import Layout from '../components/Layout';
import PsychologistCard from '../components/PsychologistCard';
import BookingCalendar from '../components/BookingCalendar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL } from '../config';

const CATEGORIES = [
  { label: 'All', icon: IconUsersGroup },
  { label: 'Anxiety', icon: IconMoodEmpty },
  { label: 'Stress', icon: IconCloudRain },
  { label: 'Depression', icon: IconMoodSad },
  { label: 'Self-Esteem', icon: IconHeartHandshake },
  { label: 'Relationships', icon: IconUsers },
];

function BookCounseling() {
  const [psychologists, setPsychologists] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState(null);
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookingActionError, setBookingActionError] = useState('');
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleValue, setRescheduleValue] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    fetch(`${API_URL}/psychologists`)
      .then((res) => res.json())
      .then(setPsychologists)
      .catch(() => {});
  }, []);

  const filteredPsychologists = psychologists.filter((p) => {
    if (category !== 'All' && !(p.specialties || []).includes(category)) return false;
    if (search && !(p.User?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const loadBookings = () => {
    fetch(`${API_URL}/bookings/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookingActionError('Could not load your sessions.'));
  };

  const openSessionsModal = () => {
    setBookingActionError('');
    loadBookings();
    setShowSessions(true);
  };

  const handleCancelBooking = async (bookingId) => {
    setBookingActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('openup_token')}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingActionError(data.error || 'Could not cancel this booking.');
        return;
      }
      loadBookings();
    } catch {
      setBookingActionError('Could not reach the server.');
    }
  };

  const confirmCancelBooking = (bookingId) => {
    setConfirmDialog({
      title: 'Are you sure you want to cancel this booking?',
      message: "This can't be undone. Any Care Credit or payment tied to it will be released.",
      confirmLabel: 'Cancel booking',
      onConfirm: () => handleCancelBooking(bookingId),
    });
  };

  const handleReschedule = async (bookingId) => {
    if (!rescheduleValue) return;
    setBookingActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/reschedule`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('openup_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schedule: rescheduleValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingActionError(data.error || 'Could not reschedule this booking.');
        return;
      }
      setReschedulingId(null);
      setRescheduleValue('');
      loadBookings();
    } catch {
      setBookingActionError('Could not reach the server.');
    }
  };

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
      <div className="max-w-5xl mx-auto">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink/50 hover:text-brand-ink/70 mb-3">
          <IconArrowLeft size={13} /> Book Counseling
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-1">Find the right support for your journey</h1>
            <p className="text-brand-ink/60 text-sm">
              Connect with licensed psychologists and take the next step towards better mental health.
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <div className="relative">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-ink/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search psychologist"
                className="border border-brand-ink/15 rounded-full pl-9 pr-4 py-2 text-sm w-full sm:w-56 bg-brand-surface"
              />
            </div>
            <button
              onClick={openSessionsModal}
              className="flex items-center justify-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/20 whitespace-nowrap bg-brand-surface"
            >
              <IconCalendarEvent size={14} /> View Scheduled Sessions <IconChevronRight size={13} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const isActive = category === c.label;
            return (
              <button
                key={c.label}
                onClick={() => setCategory(c.label)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border transition-colors ${
                  isActive
                    ? 'bg-brand-primary text-white border-brand-primary'
                    : 'border-brand-ink/15 text-brand-ink/70 hover:bg-brand-ink/5'
                }`}
              >
                <Icon size={14} /> {c.label}
              </button>
            );
          })}
        </div>

        {psychologists.length === 0 ? (
          <p className="text-brand-ink/50 text-sm">No verified psychologists available yet.</p>
        ) : filteredPsychologists.length === 0 ? (
          <p className="text-brand-ink/50 text-sm">No psychologists match this search or category.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPsychologists.map((p) => (
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

        {showSessions && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
            onClick={() => setShowSessions(false)}
          >
            <div
              className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-xl w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display text-lg font-semibold">Scheduled Sessions</p>
                <button onClick={() => setShowSessions(false)} className="text-brand-ink/50 text-xl">✕</button>
              </div>

              {bookingActionError && <p className="text-sm text-red-600 mb-3">{bookingActionError}</p>}

              {bookings.length === 0 ? (
                <p className="text-sm text-brand-ink/50">No sessions yet.</p>
              ) : (
                <div className="space-y-3">
                  {bookings.map((b) => {
                    const canManage = b.status === 'pending' || b.status === 'confirmed';
                    return (
                      <div key={b.booking_id} className="border border-brand-ink/10 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              {b.Psychologist?.User?.name || `Psychologist #${b.psychologist_id}`}
                            </p>
                            <p className="text-xs text-brand-ink/60 mt-1">
                              {new Date(b.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                              {' · '}
                              <span className="capitalize">{b.status}</span>
                            </p>
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  setReschedulingId(reschedulingId === b.booking_id ? null : b.booking_id);
                                  setRescheduleValue('');
                                }}
                                className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                              >
                                Reschedule
                              </button>
                              <button
                                onClick={() => confirmCancelBooking(b.booking_id)}
                                className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        {reschedulingId === b.booking_id && (
                          <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <input
                              type="datetime-local"
                              value={rescheduleValue}
                              onChange={(e) => setRescheduleValue(e.target.value)}
                              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
                            />
                            <button
                              onClick={() => handleReschedule(b.booking_id)}
                              disabled={!rescheduleValue}
                              className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                            >
                              Confirm new time
                            </button>
                            {b.status === 'confirmed' && (
                              <p className="text-xs text-brand-ink/50 w-full">
                                Rescheduling a confirmed session sends it back to your psychologist for re-acceptance.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </Layout>
  );
}

export default BookCounseling;
