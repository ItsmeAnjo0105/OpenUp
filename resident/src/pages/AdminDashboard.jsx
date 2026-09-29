import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader, getStoredUser } from '../config';

// Real client-side CSV download built from the fetched report rows, same
// pattern as the Psychologist Reports export -- no server round trip needed.
function downloadAccomplishmentCsv(rows) {
  const header = ['Barangay', 'City', 'Residents', 'Sessions Requested', 'Sessions Confirmed', 'Care Credits Issued (PHP)', 'Care Credits Used (PHP)', 'Budget Funded (PHP)', 'Budget Spent (PHP)', 'Budget Remaining (PHP)'];
  const csvRows = rows.map((r) => [
    r.name, r.city, r.resident_count, r.session_count, r.confirmed_session_count,
    r.care_credits_issued, r.care_credits_used, r.budget_funded, r.budget_spent, r.budget_remaining,
  ]);
  const csv = [header, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-accomplishment-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
  const [announcement, setAnnouncement] = useState({ title: '', body: '' });
  const [announcementStatus, setAnnouncementStatus] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [users, setUsers] = useState([]);
  const [userError, setUserError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [escalations, setEscalations] = useState([]);
  const [escalationError, setEscalationError] = useState('');
  const [accReport, setAccReport] = useState([]);
  const [accReportError, setAccReportError] = useState('');
  const [accBarangayId, setAccBarangayId] = useState('');
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  const loadPending = () => {
    fetch(`${API_URL}/admin/psychologists?status=pending`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setPending(data);
        else setActionError(data?.error || 'Could not load pending applications.');
      })
      .catch(() => setActionError('Could not load pending applications.'));
  };

  const loadBookings = () => {
    fetch(`${API_URL}/admin/bookings`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setBookings(data);
        else setBookingError(data?.error || 'Could not load bookings.');
      })
      .catch(() => setBookingError('Could not load bookings.'));
  };

  const loadEscalations = () => {
    fetch(`${API_URL}/admin/escalations`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setEscalations(data);
        else setEscalationError(data?.error || 'Could not load escalations.');
      })
      .catch(() => setEscalationError('Could not reach the server.'));
  };

  const loadVerifiedPsychologists = () => {
    fetch(`${API_URL}/admin/psychologists?status=verified`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setVerifiedPsychologists(data);
      })
      .catch(() => {});
  };

  const loadAccomplishmentReport = () => {
    fetch(`${API_URL}/admin/accomplishment-report`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setAccReport(data);
        else setAccReportError(data?.error || 'Could not load the accomplishment report.');
      })
      .catch(() => setAccReportError('Could not reach the server.'));
  };

  const loadFinance = () => {
    Promise.all([
      fetch(`${API_URL}/admin/subscriptions`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
      fetch(`${API_URL}/admin/budgets`, { headers: authHeader() }).then((res) => res.json().then((data) => ({ ok: res.ok, data }))),
    ])
      .then(([subsResult, budgetsResult]) => {
        if (!subsResult.ok || !Array.isArray(subsResult.data) || !budgetsResult.ok || !Array.isArray(budgetsResult.data)) {
          setFinanceError(subsResult.data?.error || budgetsResult.data?.error || 'Could not load barangay finance data.');
          return;
        }
        const budgetByBarangay = Object.fromEntries(budgetsResult.data.map((b) => [b.barangay_id, b]));
        setFinance(subsResult.data.map((s) => ({ ...s, ...budgetByBarangay[s.barangay_id] })));
      })
      .catch(() => setFinanceError('Could not load barangay finance data.'));
  };

  const loadUsers = () => {
    fetch(`${API_URL}/admin/users`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setUsers(data);
        else setUserError(data?.error || 'Could not load users.');
      })
      .catch(() => setUserError('Could not reach the server.'));
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
        loadUsers();
        loadEscalations();
        loadAccomplishmentReport();
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

  const confirmCancelBooking = (booking) => {
    setConfirmDialog({
      title: 'Are you sure you want to cancel this booking?',
      message: `${booking.User?.name || 'This resident'}'s booking will be cancelled and any credit or payment released.`,
      confirmLabel: 'Cancel booking',
      onConfirm: () => cancelBooking(booking.booking_id),
    });
  };

  const confirmReject = (psychologist) => {
    setConfirmDialog({
      title: 'Are you sure you want to reject this application?',
      message: `${psychologist.User?.name || 'This applicant'}'s account will be marked rejected.`,
      confirmLabel: 'Reject',
      onConfirm: () => act(psychologist.psychologist_id, 'reject'),
    });
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

  const toggleUserStatus = async (targetUser) => {
    setUserError('');
    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    try {
      const res = await fetch(`${API_URL}/admin/users/${targetUser.user_id}/status`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserError(data.error || 'Something went wrong.');
        return;
      }
      setUsers((prev) => prev.map((u) => (u.user_id === targetUser.user_id ? { ...u, status: nextStatus } : u)));
    } catch {
      setUserError('Could not reach the server.');
    }
  };

  const deleteUser = async (targetUser) => {
    setUserError('');
    try {
      const res = await fetch(`${API_URL}/admin/users/${targetUser.user_id}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setUserError(data.error || 'Something went wrong.');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.user_id !== targetUser.user_id));
    } catch {
      setUserError('Could not reach the server.');
    }
  };

  const confirmToggleStatus = (targetUser) => {
    const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
    setConfirmDialog({
      title: `Are you sure you want to ${nextStatus === 'suspended' ? 'suspend' : 'reactivate'} this account?`,
      message: nextStatus === 'suspended'
        ? `${targetUser.name} will no longer be able to log in.`
        : `${targetUser.name} will be able to log in again.`,
      confirmLabel: nextStatus === 'suspended' ? 'Suspend' : 'Reactivate',
      destructive: nextStatus === 'suspended',
      onConfirm: () => toggleUserStatus(targetUser),
    });
  };

  const confirmDeleteUser = (targetUser) => {
    setConfirmDialog({
      title: 'Are you sure you want to delete this account?',
      message: `This permanently deletes ${targetUser.name}'s account and every record tied to it -- bookings, mood history, journal entries, wellness check-ins, messages, everything. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      onConfirm: () => deleteUser(targetUser),
    });
  };

  const filteredUsers = users.filter((u) => {
    if (userRoleFilter && u.role !== userRoleFilter) return false;
    if (userStatusFilter && u.status !== userStatusFilter) return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const postAnnouncement = async (e) => {
    e.preventDefault();
    setAnnouncementStatus('');
    try {
      const res = await fetch(`${API_URL}/admin/announcements`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnnouncementStatus(data.error || 'Could not post announcement.');
        return;
      }
      setAnnouncement({ title: '', body: '' });
      setAnnouncementStatus('Sent to every user.');
    } catch {
      setAnnouncementStatus('Could not reach the server.');
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
                      onClick={() => confirmReject(p)}
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

        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 mt-6">
          <h2 className="font-display text-lg font-semibold text-purple-900 mb-1">Emergency escalations</h2>
          <p className="text-xs text-purple-900/70 mb-4">
            Raised by a psychologist during a live session. Review these as soon as possible.
          </p>

          {escalationError && <p className="text-sm text-red-600 mb-3">{escalationError}</p>}

          {escalations.length === 0 ? (
            <p className="text-sm text-purple-900/60">No escalations raised.</p>
          ) : (
            <div className="space-y-3">
              {escalations.map((e) => (
                <div key={e.escalation_id} className="bg-white border border-purple-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold">
                      {e.Booking?.User?.name || 'A resident'} · with {e.Psychologist?.User?.name || 'a psychologist'}
                    </p>
                    <span className="text-xs text-brand-ink/50">
                      {new Date(e.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  {e.note && <p className="text-sm text-brand-ink/70 mt-1">"{e.note}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="font-display text-lg font-semibold mb-4">Manage users</h2>

          {userError && <p className="text-sm text-red-600 mb-3">{userError}</p>}

          <div className="flex flex-wrap gap-2 mb-4">
            <input
              placeholder="Search name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="flex-1 min-w-40 border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
            />
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All roles</option>
              <option value="resident">Resident</option>
              <option value="psychologist">Psychologist</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-sm text-brand-ink/50">No users match this filter.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredUsers.map((u) => (
                <div key={u.user_id} className="border border-brand-ink/10 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    <p className="text-xs text-brand-ink/50 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-ink/5 text-brand-ink/60 capitalize">{u.role}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${
                        u.status === 'suspended' ? 'bg-red-100 text-red-700' : u.status === 'rejected' ? 'bg-brand-ink/5 text-brand-ink/50' : 'bg-green-100 text-green-700'
                      }`}>
                        {u.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => confirmToggleStatus(u)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                    >
                      {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                    </button>
                    <button
                      onClick={() => confirmDeleteUser(u)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                    >
                      Delete
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
                        onClick={() => confirmCancelBooking(b)}
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

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-display text-lg font-semibold">Accomplishment report</h2>
            <button
              onClick={() => downloadAccomplishmentCsv(accBarangayId ? accReport.filter((r) => String(r.barangay_id) === accBarangayId) : accReport)}
              disabled={accReport.length === 0}
              className="text-xs font-medium px-3.5 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-40"
            >
              Export report
            </button>
          </div>
          <p className="text-xs text-brand-ink/50 mb-4">
            Residents, sessions, care credits, and budget per barangay. Pick a barangay for its own
            report, or leave it on "All barangays" for the full picture.
          </p>

          {accReportError && <p className="text-sm text-red-600 mb-3">{accReportError}</p>}

          <select
            value={accBarangayId}
            onChange={(e) => setAccBarangayId(e.target.value)}
            className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm mb-4"
          >
            <option value="">All barangays</option>
            {accReport.map((r) => (
              <option key={r.barangay_id} value={r.barangay_id}>{r.name}</option>
            ))}
          </select>

          {accReport.length === 0 ? (
            <p className="text-sm text-brand-ink/50">No barangays found.</p>
          ) : accBarangayId ? (
            (() => {
              const r = accReport.find((row) => String(row.barangay_id) === accBarangayId);
              if (!r) return null;
              return (
                <div className="border border-brand-ink/10 rounded-xl p-4">
                  <p className="text-sm font-semibold mb-3">{r.name}{r.city ? `, ${r.city}` : ''}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div><p className="text-xs text-brand-ink/50">Residents</p><p className="text-base font-semibold">{r.resident_count}</p></div>
                    <div><p className="text-xs text-brand-ink/50">Sessions requested</p><p className="text-base font-semibold">{r.session_count}</p></div>
                    <div><p className="text-xs text-brand-ink/50">Sessions confirmed</p><p className="text-base font-semibold">{r.confirmed_session_count}</p></div>
                    <div><p className="text-xs text-brand-ink/50">Care credits issued</p><p className="text-base font-semibold">₱{r.care_credits_issued.toLocaleString()}</p></div>
                    <div><p className="text-xs text-brand-ink/50">Care credits used</p><p className="text-base font-semibold">₱{r.care_credits_used.toLocaleString()}</p></div>
                    <div><p className="text-xs text-brand-ink/50">Budget remaining</p><p className="text-base font-semibold">₱{r.budget_remaining.toLocaleString()}</p></div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-brand-ink/50 uppercase">
                    <th className="pb-2 font-medium">Barangay</th>
                    <th className="pb-2 font-medium">Residents</th>
                    <th className="pb-2 font-medium">Sessions</th>
                    <th className="pb-2 font-medium">Credits used</th>
                    <th className="pb-2 font-medium">Budget remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {accReport.map((r) => (
                    <tr key={r.barangay_id} className="border-t border-brand-ink/10">
                      <td className="py-2.5">{r.name}</td>
                      <td className="py-2.5 text-brand-ink/60">{r.resident_count}</td>
                      <td className="py-2.5 text-brand-ink/60">{r.confirmed_session_count}/{r.session_count}</td>
                      <td className="py-2.5 text-brand-ink/60">₱{r.care_credits_used.toLocaleString()}</td>
                      <td className="py-2.5 text-brand-ink/60">₱{r.budget_remaining.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="font-display text-lg font-semibold mb-1">System announcement</h2>
          <p className="text-xs text-brand-ink/50 mb-4">Sends a notification to every user on the platform.</p>

          {announcementStatus && <p className="text-sm text-brand-primary mb-3">{announcementStatus}</p>}

          <form onSubmit={postAnnouncement} className="space-y-3">
            <input
              placeholder="Title" value={announcement.title}
              onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Message" value={announcement.body}
              onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}
              required
              rows={2}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <button type="submit" className="text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
              Send to everyone
            </button>
          </form>
        </div>
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

export default AdminDashboard;
