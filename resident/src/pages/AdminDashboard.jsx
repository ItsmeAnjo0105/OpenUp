import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';

function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [pending, setPending] = useState([]);
  const [actionError, setActionError] = useState('');
  const [bookings, setBookings] = useState([]);
  const [verifiedPsychologists, setVerifiedPsychologists] = useState([]);
  const [bookingError, setBookingError] = useState('');
  const [reassigning, setReassigning] = useState(null);
  const [finance, setFinance] = useState([]);
  const [financeError, setFinanceError] = useState('');
  const [financeInputs, setFinanceInputs] = useState({});
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

  const loadBookings = () => {
    fetch(`${API_URL}/admin/bookings`, { headers: authHeader() })
      .then((res) => res.json())
      .then(setBookings)
      .catch(() => setBookingError('Could not load bookings.'));
  };

  const loadVerifiedPsychologists = () => {
    fetch(`${API_URL}/admin/psychologists?status=verified`, { headers: authHeader() })
      .then((res) => res.json())
      .then(setVerifiedPsychologists)
      .catch(() => {});
  };

  const loadFinance = () => {
    Promise.all([
      fetch(`${API_URL}/admin/subscriptions`, { headers: authHeader() }).then((r) => r.json()),
      fetch(`${API_URL}/admin/budgets`, { headers: authHeader() }).then((r) => r.json()),
    ])
      .then(([subs, budgets]) => {
        const budgetByBarangay = Object.fromEntries(budgets.map((b) => [b.barangay_id, b]));
        setFinance(subs.map((s) => ({ ...s, ...budgetByBarangay[s.barangay_id] })));
      })
      .catch(() => setFinanceError('Could not load barangay finance data.'));
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
        loadBookings();
        loadVerifiedPsychologists();
        loadFinance();
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

  const cancelBooking = async (bookingId) => {
    setBookingError('');
    try {
      const res = await fetch(`${API_URL}/admin/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.error || 'Something went wrong.');
        return;
      }
      loadBookings();
    } catch {
      setBookingError('Could not reach the server.');
    }
  };

  const reassignBooking = async (bookingId, newPsychologistId) => {
    setBookingError('');
    try {
      const res = await fetch(`${API_URL}/admin/bookings/${bookingId}/reassign`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ psychologist_id: newPsychologistId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.error || 'Something went wrong.');
        return;
      }
      setReassigning(null);
      loadBookings();
    } catch {
      setBookingError('Could not reach the server.');
    }
  };

  const setFinanceInput = (barangayId, field, value) => {
    setFinanceInputs((prev) => ({ ...prev, [barangayId]: { ...prev[barangayId], [field]: value } }));
  };

  const setSubscriptionStatus = async (barangayId, status) => {
    setFinanceError('');
    try {
      const res = await fetch(`${API_URL}/admin/subscriptions/${barangayId}`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinanceError(data.error || 'Something went wrong.');
        return;
      }
      loadFinance();
    } catch {
      setFinanceError('Could not reach the server.');
    }
  };

  const fundBudget = async (barangayId) => {
    setFinanceError('');
    const amount = financeInputs[barangayId]?.fundAmount;
    if (!amount) return;
    try {
      const res = await fetch(`${API_URL}/admin/budgets/${barangayId}/fund`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinanceError(data.error || 'Something went wrong.');
        return;
      }
      setFinanceInput(barangayId, 'fundAmount', '');
      loadFinance();
    } catch {
      setFinanceError('Could not reach the server.');
    }
  };

  const issueCredits = async (barangayId) => {
    setFinanceError('');
    const amount = financeInputs[barangayId]?.creditAmount;
    if (!amount) return;
    try {
      const res = await fetch(`${API_URL}/care-credits/allocate`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ barangay_id: barangayId, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinanceError(data.error || 'Something went wrong.');
        return;
      }
      setFinanceInput(barangayId, 'creditAmount', '');
      loadFinance();
    } catch {
      setFinanceError('Could not reach the server.');
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

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="font-display text-lg font-semibold mb-4">Appointments</h2>

          {bookingError && <p className="text-sm text-red-600 mb-3">{bookingError}</p>}

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
                      <p className="text-xs text-brand-ink/60 mt-1">
                        {new Date(b.schedule).toLocaleString()} · {b.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setReassigning(reassigning === b.booking_id ? null : b.booking_id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                      >
                        Reassign
                      </button>
                      <button
                        onClick={() => cancelBooking(b.booking_id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
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
                            <option key={p.psychologist_id} value={p.psychologist_id}>
                              {p.User?.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="font-display text-lg font-semibold mb-1">Barangay finance</h2>
          <p className="text-xs text-brand-ink/50 mb-4">
            A subscription must be active before its budget can be funded, and funding must cover the amount before Care Credits can be issued.
          </p>

          {financeError && <p className="text-sm text-red-600 mb-3">{financeError}</p>}

          {finance.length === 0 ? (
            <p className="text-sm text-brand-ink/50">No barangays found.</p>
          ) : (
            <div className="space-y-3">
              {finance.map((f) => (
                <div key={f.barangay_id} className="border border-brand-ink/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">{f.name}</p>
                    <select
                      value={f.status}
                      onChange={(e) => setSubscriptionStatus(f.barangay_id, e.target.value)}
                      className="text-xs border border-brand-ink/15 rounded-full px-3 py-1"
                    >
                      <option value="inactive">Inactive</option>
                      <option value="active">Active</option>
                      <option value="past_due">Past due</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <p className="text-xs text-brand-ink/60 mb-3">
                    Funded ₱{Number(f.total_funded || 0).toLocaleString()} · Spent ₱{Number(f.total_spent || 0).toLocaleString()} ·
                    Remaining ₱{Number(f.remaining || 0).toLocaleString()}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <input
                      type="number" min="1" placeholder="Fund amount"
                      value={financeInputs[f.barangay_id]?.fundAmount || ''}
                      onChange={(e) => setFinanceInput(f.barangay_id, 'fundAmount', e.target.value)}
                      className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-32"
                    />
                    <button
                      onClick={() => fundBudget(f.barangay_id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                    >
                      Fund
                    </button>

                    <input
                      type="number" min="1" placeholder="Credit per resident"
                      value={financeInputs[f.barangay_id]?.creditAmount || ''}
                      onChange={(e) => setFinanceInput(f.barangay_id, 'creditAmount', e.target.value)}
                      className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-36"
                    />
                    <button
                      onClick={() => issueCredits(f.barangay_id)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      Issue to all residents
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
