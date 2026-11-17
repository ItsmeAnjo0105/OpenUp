import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCreditCard, IconPlus, IconShieldCheck, IconEdit, IconTrash, IconHourglass, IconCalendarEvent,
  IconClockOff, IconBan, IconAlertTriangle, IconSearch, IconCircleCheck, IconX,
} from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import SubscriptionPlanModal from '../components/SubscriptionPlanModal';
import BarangaySubscriptionModal from '../components/BarangaySubscriptionModal';
import AdminRequestReviewModal, { APPROVE_MESSAGE } from '../components/subscription/AdminRequestReviewModal';
import {
  SUBSCRIPTION_STATUS_META, REQUEST_STATUS_META, REQUEST_FILTERS, peso, credits, fmtShortDate,
} from '../utils/subscriptionStatus';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const BARANGAY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'nearing', label: 'Nearing expiration' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'none', label: 'No subscription' },
];

const REQUEST_SORTS = {
  newest: (a, b) => new Date(b.requested_at) - new Date(a.requested_at),
  oldest: (a, b) => new Date(a.requested_at) - new Date(b.requested_at),
  price_high: (a, b) => Number(b.price) - Number(a.price),
  price_low: (a, b) => Number(a.price) - Number(b.price),
  expiring: (a, b) => new Date(a.current_expires_at || '9999-12-31') - new Date(b.current_expires_at || '9999-12-31'),
};

function AdminSubscriptions() {
  const [plans, setPlans] = useState([]);
  const [finance, setFinance] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [planModal, setPlanModal] = useState(null); // { plan } | { plan: null } for create | null
  const [detailBarangayId, setDetailBarangayId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestsError, setRequestsError] = useState('');
  const [issuances, setIssuances] = useState([]);
  const [requestFilter, setRequestFilter] = useState('pending');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestSort, setRequestSort] = useState('newest');
  const [barangayFilter, setBarangayFilter] = useState('all');
  const [review, setReview] = useState(null); // { id, action }
  const [toast, setToast] = useState(null);
  const requestsRef = useRef(null);
  const barangaysRef = useRef(null);

  const load = () => {
    const json = (url) => fetch(`${API_URL}${url}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data }), () => ({ ok: false, data: { error: 'Unexpected server response. Restart the backend.' } })));
    json('/admin/subscription-requests').then(({ ok, data }) => {
      if (ok && Array.isArray(data)) { setRequests(data); setRequestsError(''); } else setRequestsError(data?.error || 'Could not load renewal requests.');
    }).catch(() => setRequestsError('Could not reach the server.'));
    json('/admin/subscription-credit-issuances').then(({ ok, data }) => { if (ok && Array.isArray(data)) setIssuances(data); }).catch(() => {});
    Promise.all([
      json('/admin/subscription-plans'),
      json('/admin/subscriptions'),
      json('/admin/budgets'),
    ]).then(([planRes, subRes, budRes]) => {
      if (!planRes.ok || !Array.isArray(planRes.data)) { setError(planRes.data?.error || 'Could not load plans.'); return; }
      if (!subRes.ok || !Array.isArray(subRes.data) || !budRes.ok || !Array.isArray(budRes.data)) {
        setError(subRes.data?.error || budRes.data?.error || 'Could not load barangay finance data.');
        return;
      }
      setPlans(planRes.data);
      const budgetByBarangay = Object.fromEntries(budRes.data.map((b) => [b.barangay_id, b]));
      setFinance(subRes.data.map((s) => ({ ...s, ...budgetByBarangay[s.barangay_id] })));
    }).catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const issuedByBarangay = useMemo(() => {
    const m = new Map();
    issuances.forEach((i) => m.set(i.barangay_id, (m.get(i.barangay_id) || 0) + Number(i.amount || 0)));
    return m;
  }, [issuances]);

  const stats = useMemo(() => ({
    active: finance.filter((f) => f.status === 'active').length,
    pending: requests.filter((r) => r.status === 'pending').length,
    upcoming: requests.filter((r) => r.status === 'approved' || r.status === 'scheduled').length,
    expired: finance.filter((f) => f.status === 'expired').length,
    cancelled: finance.filter((f) => f.status === 'cancelled').length,
    nearing: finance.filter((f) => f.renewal_due).length,
  }), [finance, requests]);

  const requestCounts = useMemo(() => {
    const c = { all: requests.length };
    requests.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    c.upcoming = (c.approved || 0) + (c.scheduled || 0);
    return c;
  }, [requests]);

  const visibleRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return requests
      .filter((r) => {
        if (requestFilter === 'all') return true;
        if (requestFilter === 'upcoming') return r.status === 'approved' || r.status === 'scheduled';
        return r.status === requestFilter;
      })
      .filter((r) => !q || [r.barangay_name, r.plan_name, r.current_plan].some((v) => v && v.toLowerCase().includes(q)))
      .sort(REQUEST_SORTS[requestSort]);
  }, [requests, requestFilter, requestSearch, requestSort]);

  const jump = (ref, apply) => {
    playClick();
    apply();
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const quickApprove = (r) => {
    playClick();
    setConfirmDialog({
      title: 'Approve Subscription Renewal?',
      message: APPROVE_MESSAGE,
      cancelLabel: 'Go Back',
      confirmLabel: 'Confirm Approval',
      destructive: false,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_URL}/admin/subscription-requests/${r.request_id}/approve`, {
            method: 'POST',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setToast({ tone: 'error', text: data.error || 'Could not approve the request.' }); return; }
          setToast({ tone: 'success', text: `${r.barangay_name}'s request was approved.` });
          load();
        } catch {
          setToast({ tone: 'error', text: 'Could not reach the server.' });
        }
      },
    });
  };

  // Derived (not stored) so the open detail modal's data stays in sync after an
  // action inside it mutates the barangay it's showing, without a setState-in-effect.
  const detailBarangay = detailBarangayId ? finance.find((f) => f.barangay_id === detailBarangayId) : null;

  const deletePlan = (plan) => {
    setConfirmDialog({
      title: 'Remove this plan?',
      message: `"${plan.name}" will be taken off the catalog. Barangays already on it keep their current terms.`,
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`${API_URL}/admin/subscription-plans/${plan.plan_id}`, { method: 'DELETE', headers: authHeader() });
        if (res.ok) load();
      },
    });
  };

  const togglePlanActive = async (plan) => {
    playClick();
    await fetch(`${API_URL}/admin/subscription-plans/${plan.plan_id}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !plan.is_active }),
    });
    load();
  };

  const visible = finance
    .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .filter((f) => {
      if (barangayFilter === 'all') return true;
      if (barangayFilter === 'nearing') return f.renewal_due;
      if (barangayFilter === 'none') return f.status === 'inactive';
      return f.status === barangayFilter;
    });

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCreditCard size={22} className="text-brand-primary" /> Subscriptions
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Manage subscription plans for every barangay. A subscription must be active before its budget can be
            funded, and funding must cover the amount before Care Credits can be issued.
          </p>
        </div>
        <AdminTopBar search={search} onSearchChange={setSearch} searchPlaceholder="Search barangay..." />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {toast && (
        <div role="status" className={`fixed top-5 left-1/2 -translate-x-1/2 z-70 flex items-center gap-2 text-white text-sm font-medium pl-4 pr-2 py-2.5 rounded-full shadow-lg max-w-[calc(100vw-2rem)] ${toast.tone === 'error' ? 'bg-red-600' : 'bg-brand-primary'}`}>
          {toast.tone === 'error' ? <IconAlertTriangle size={16} /> : <IconCircleCheck size={16} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="p-1 rounded-full hover:bg-white/15" aria-label="Dismiss"><IconX size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-6 mb-8">
        <OverviewStat icon={IconShieldCheck} tone="bg-emerald-100 text-emerald-700" value={stats.active} label="Active subscriptions"
          onClick={() => jump(barangaysRef, () => setBarangayFilter('active'))} />
        <OverviewStat icon={IconHourglass} tone="bg-yellow-100 text-yellow-800" value={stats.pending} label="Pending renewal requests"
          onClick={() => jump(requestsRef, () => setRequestFilter('pending'))} />
        <OverviewStat icon={IconCalendarEvent} tone="bg-teal-100 text-teal-700" value={stats.upcoming} label="Upcoming subscriptions"
          onClick={() => jump(requestsRef, () => setRequestFilter('upcoming'))} />
        <OverviewStat icon={IconClockOff} tone="bg-gray-200 text-gray-700" value={stats.expired} label="Expired subscriptions"
          onClick={() => jump(barangaysRef, () => setBarangayFilter('expired'))} />
        <OverviewStat icon={IconBan} tone="bg-red-100 text-red-600" value={stats.cancelled} label="Cancelled subscriptions"
          onClick={() => jump(barangaysRef, () => setBarangayFilter('cancelled'))} />
        <OverviewStat icon={IconAlertTriangle} tone="bg-orange-100 text-orange-700" value={stats.nearing} label="Nearing expiration (30 days)"
          onClick={() => jump(barangaysRef, () => setBarangayFilter('nearing'))} />
      </div>

      <section ref={requestsRef} className="scroll-mt-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
          <h2 className="font-display text-base font-semibold">Subscription Renewal Requests</h2>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <label className="relative">
              <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-ink/40" />
              <input value={requestSearch} onChange={(e) => setRequestSearch(e.target.value)} placeholder="Search barangay or plan"
                aria-label="Search requests"
                className="text-xs bg-brand-surface border border-brand-ink/15 rounded-full pl-8 pr-3 py-2 w-56 focus:outline-none focus:ring-2 focus:ring-brand-primary" />
            </label>
            <select value={requestSort} onChange={(e) => setRequestSort(e.target.value)} aria-label="Sort requests"
              className="text-xs bg-brand-surface border border-brand-ink/15 rounded-full px-3 py-2">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="expiring">Current plan expiring soonest</option>
              <option value="price_high">Price: high to low</option>
              <option value="price_low">Price: low to high</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Filter requests">
          {[...REQUEST_FILTERS.slice(0, 1), { key: 'upcoming', label: 'Upcoming (approved + scheduled)' }, ...REQUEST_FILTERS.slice(1)].map((fl) => (
            <button key={fl.key} role="tab" aria-selected={requestFilter === fl.key}
              onClick={() => { playClick(); setRequestFilter(fl.key); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border ${requestFilter === fl.key ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-surface border-brand-ink/15 text-brand-ink/70'}`}>
              {fl.label} <span className="opacity-60 ml-0.5">{requestCounts[fl.key] || 0}</span>
            </button>
          ))}
        </div>
        {requestsError ? (
          <p className="text-sm text-red-600">{requestsError}</p>
        ) : visibleRequests.length === 0 ? (
          <p className="text-sm text-brand-ink/50 bg-brand-surface rounded-2xl shadow-sm p-5">No requests in this view.</p>
        ) : (
          <div className="bg-brand-surface rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-left text-xs text-brand-ink/50 border-b border-brand-ink/10">
                  <th className="px-4 py-3 font-medium">Barangay</th>
                  <th className="px-4 py-3 font-medium">Current subscription</th>
                  <th className="px-4 py-3 font-medium">Requested subscription</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Current expiration</th>
                  <th className="px-4 py-3 font-medium">Request date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((r) => {
                  const m = REQUEST_STATUS_META[r.status];
                  return (
                    <tr key={r.request_id} className="border-b border-brand-ink/5 last:border-0">
                      <td className="px-4 py-3 font-medium">{r.barangay_name}</td>
                      <td className="px-4 py-3 text-brand-ink/70">{r.current_plan || '—'}</td>
                      <td className="px-4 py-3">{r.plan_name}<span className="block text-[11px] text-brand-ink/45">{credits(r.care_credits)} credits · {r.validity_months} mo</span></td>
                      <td className="px-4 py-3 text-brand-ink/70">{peso(r.price)}</td>
                      <td className="px-4 py-3 text-brand-ink/70 whitespace-nowrap">{fmtShortDate(r.current_expires_at)}</td>
                      <td className="px-4 py-3 text-brand-ink/70 whitespace-nowrap">{fmtShortDate(r.requested_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${m.badge}`}>{m.label}</span>
                        {r.status === 'approved' && r.payment_status === 'submitted' && <span className="block text-[10px] text-sky-700 mt-1">Payment to verify</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          <button onClick={() => { playClick(); setReview({ id: r.request_id }); }} onMouseEnter={playHover}
                            className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20">View Details</button>
                          {r.status === 'pending' && (
                            <>
                              <button onClick={() => quickApprove(r)} onMouseEnter={playHover}
                                className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white">Approve</button>
                              <button onClick={() => { playClick(); setReview({ id: r.request_id, action: 'reject' }); }} onMouseEnter={playHover}
                                className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600">Reject</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-semibold">Subscription plans</h2>
        <button
          onClick={() => { playClick(); setPlanModal({ plan: null }); }}
          onMouseEnter={playHover}
          className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white flex items-center gap-1"
        >
          <IconPlus size={14} /> New plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {plans.map((p) => (
          <div
            key={p.plan_id}
            className={`relative bg-brand-surface rounded-2xl shadow-sm p-5 ${!p.is_active ? 'opacity-50' : ''} ${p.is_featured ? 'ring-2 ring-brand-primary' : ''}`}
          >
            {p.is_featured && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-brand-primary text-white">
                Most Popular
              </span>
            )}
            <p className="text-sm font-semibold mt-1">{p.name}</p>
            <p className="text-xs text-brand-ink/50 mt-1 min-h-8">{p.description}</p>
            <p className="text-lg font-semibold mt-2">₱{Number(p.price).toLocaleString()}<span className="text-xs font-normal text-brand-ink/40"> /plan</span></p>
            <p className="text-xs text-brand-ink/60 mt-1">{Number(p.care_credits).toLocaleString()} Care Credits</p>
            <p className="text-xs text-brand-ink/50">Valid for {p.validity_months} months</p>
            {!p.is_active && <p className="text-[10px] text-amber-600 font-medium mt-1">Hidden from barangays</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { playClick(); setPlanModal({ plan: p }); }}
                onMouseEnter={playHover}
                className="interactive flex-1 text-xs font-medium px-2 py-1.5 rounded-full border border-brand-ink/20 flex items-center justify-center gap-1"
              >
                <IconEdit size={13} /> Edit
              </button>
              <button
                onClick={() => togglePlanActive(p)}
                onMouseEnter={playHover}
                className="interactive flex-1 text-xs font-medium px-2 py-1.5 rounded-full border border-brand-ink/20"
              >
                {p.is_active ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => { playClick(); deletePlan(p); }}
                onMouseEnter={playHover}
                className="interactive text-xs font-medium px-2 py-1.5 rounded-full border border-red-300 text-red-600"
              >
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div ref={barangaysRef} className="scroll-mt-6 flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-display text-base font-semibold mr-2">Barangay subscriptions</h2>
        {BARANGAY_FILTERS.map((fl) => (
          <button key={fl.key} onClick={() => { playClick(); setBarangayFilter(fl.key); }}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${barangayFilter === fl.key ? 'bg-brand-primary text-white border-brand-primary' : 'bg-brand-surface border-brand-ink/15 text-brand-ink/70'}`}>
            {fl.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-brand-ink/50">No barangays found.</p>
      ) : (
        <div className="bg-brand-surface rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[1080px]">
            <thead>
              <tr className="text-left text-xs text-brand-ink/50 border-b border-brand-ink/10">
                <th className="px-5 py-3 font-medium">Barangay</th>
                <th className="px-5 py-3 font-medium">Current plan</th>
                <th className="px-5 py-3 font-medium">Plan credits</th>
                <th className="px-5 py-3 font-medium">Credits issued (all terms)</th>
                <th className="px-5 py-3 font-medium">Remaining budget</th>
                <th className="px-5 py-3 font-medium">Expires</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Upcoming</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.barangay_id} className="border-b border-brand-ink/5 last:border-0">
                  <td className="px-5 py-3 font-medium">{f.name}</td>
                  <td className="px-5 py-3 text-brand-ink/70">{f.plan_name || '—'}</td>
                  <td className="px-5 py-3 text-brand-ink/70">{f.care_credits ? credits(f.care_credits) : '—'}</td>
                  <td className="px-5 py-3 text-brand-ink/70">{credits(issuedByBarangay.get(f.barangay_id) || 0)}</td>
                  <td className="px-5 py-3 text-brand-ink/70">{credits(f.remaining || 0)}</td>
                  <td className="px-5 py-3 text-brand-ink/70 whitespace-nowrap">
                    {f.expires_at ? fmtShortDate(f.expires_at) : '—'}
                    {f.days_remaining != null && <span className="block text-[10px] text-brand-ink/45">{f.days_remaining} days left</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${(SUBSCRIPTION_STATUS_META[f.display_status] || SUBSCRIPTION_STATUS_META.none).badge}`}>
                      {(SUBSCRIPTION_STATUS_META[f.display_status] || SUBSCRIPTION_STATUS_META.none).label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {f.upcoming_status
                      ? <span className={`font-medium px-2 py-0.5 rounded-full ${REQUEST_STATUS_META[f.upcoming_status].badge}`}>{f.upcoming_plan} · {REQUEST_STATUS_META[f.upcoming_status].label}</span>
                      : <span className="text-brand-ink/40">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => { playClick(); setDetailBarangayId(f.barangay_id); }}
                      onMouseEnter={playHover}
                      className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                    >
                      {f.plan_id ? 'View' : 'Assign plan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {planModal && (
        <SubscriptionPlanModal
          plan={planModal.plan}
          onClose={() => setPlanModal(null)}
          onSaved={() => { setPlanModal(null); load(); }}
        />
      )}

      {review && (
        <AdminRequestReviewModal
          key={`${review.id}-${review.action || ''}`}
          requestId={review.id}
          initialAction={review.action}
          onClose={() => setReview(null)}
          onChanged={(text) => { setToast({ tone: 'success', text }); load(); }}
        />
      )}

      {detailBarangay && (
        <BarangaySubscriptionModal
          barangay={detailBarangay}
          plans={plans}
          onClose={() => setDetailBarangayId(null)}
          onChanged={load}
        />
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

function OverviewStat({ icon: Icon, tone, value, label, onClick }) {
  return (
    <button type="button" onClick={onClick} onMouseEnter={playHover}
      className="interactive-card text-left bg-brand-surface rounded-2xl shadow-sm p-4 flex flex-col gap-2">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${tone}`}><Icon size={17} /></span>
      <span className="text-2xl font-semibold leading-none">{value}</span>
      <span className="text-xs text-brand-ink/55 leading-snug">{label}</span>
    </button>
  );
}

export default AdminSubscriptions;
