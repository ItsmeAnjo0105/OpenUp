import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL } from '../config';

function BookCounseling() {
  const [psychologists, setPsychologists] = useState([]);
  const [psychologistId, setPsychologistId] = useState('');
  const [schedule, setSchedule] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    fetch(`${API_URL}/psychologists`)
      .then((res) => res.json())
      .then(setPsychologists)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resident_id: user.user_id,
          psychologist_id: psychologistId,
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
        data.care_credit_applied
          ? 'Booked! Covered by your OpenUp Care Credit.'
          : 'Booked! Payment of ₱1000 is pending.'
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
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Book Counseling</h1>
        <p className="text-brand-ink/60 text-sm mb-8">Pick a psychologist and a time that works for you.</p>

        <form onSubmit={handleSubmit} className="bg-brand-surface rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Psychologist</label>
            <select
              value={psychologistId}
              onChange={(e) => setPsychologistId(e.target.value)}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">Select a psychologist</option>
              {psychologists.map((p) => (
                <option key={p.psychologist_id} value={p.psychologist_id}>
                  {p.User?.name || `Psychologist #${p.psychologist_id}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Date & time</label>
            <input
              type="datetime-local"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          {status && <p className="text-sm text-brand-primary font-medium">{status}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Booking...' : 'Book session'}
          </button>
        </form>
      </div>
    </Layout>
  );
}

export default BookCounseling;
