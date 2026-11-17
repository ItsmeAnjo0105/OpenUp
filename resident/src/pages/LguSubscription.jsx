import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconCreditCard, IconStar, IconHistory, IconCircleCheckFilled, IconCalendarEvent, IconCircleCheck, IconX, IconAlertTriangle,
} from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import PlanRequestModal from '../components/subscription/PlanRequestModal';
import RequestDetailModal from '../components/subscription/RequestDetailModal';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';
import {
  SUBSCRIPTION_STATUS_META, REQUEST_STATUS_META, PAYMENT_STATUS_LABEL, HISTORY_LABEL,
  peso, credits, fmtDate, fmtShortDate, activationText,
} from '../utils/subscriptionStatus';

const SUBMITTED_MESSAGE = 'Your subscription renewal request has been successfully submitted. Your current subscription will remain active while the Admin reviews your request.';
const CANCEL_MESSAGE = 'Are you sure you want to cancel your upcoming subscription request? Your current active subscription will remain unchanged.';

async function getJson(url) {
  const res = await fetch(`${API_URL}${url}`, { headers: authHeader() });
  const data = await res.json().catch(() => ({ error: res.status === 404 ? 'The server is running an older version. Restart the backend.' : 'Unexpected server response.' }));
  return { ok: res.ok, data };
}

// Barangay > Subscription. Manual renewal with admin approval: choosing a
// plan only ever submits a request; activation, Care Credits and expiry are
// handled server-side (see the subscription lifecycle in server/index.js).
function LguSubscription() {
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [issuances, setIssuances] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [planModal, setPlanModal] = useState(null);
  const [detailRequestId, setDetailRequestId] = useState(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      getJson('/lgu/me/subscription'),
      getJson('/lgu/me/subscription-plans'),
      getJson('/lgu/me/subscription/requests'),
      getJson('/lgu/me/subscription/history'),
      getJson('/lgu/me/subscription/credit-issuances'),
    ]).then(([subRes, planRes, reqRes, histRes, issRes]) => {
      if (!subRes.ok) { setError(subRes.data?.error || 'Could not load your subscription.'); return; }
      setError('');
      setSubscription(subRes.data);
      if (Array.isArray(planRes.data)) setPlans(planRes.data);
      if (Array.isArray(reqRes.data)) setRequests(reqRes.data);
      if (Array.isArray(histRes.data)) setHistory(histRes.data);
      if (Array.isArray(issRes.data)) setIssuances(issRes.data);
    }).catch(() => setError('Could not reach the server.'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const upcoming = subscription?.upcoming || null;
  const detailRequest = useMemo(() => requests.find((r) => r.request_id === detailRequestId) || null, [requests, detailRequestId]);
  const issuanceByRequest = useMemo(() => new Map(issuances.map((i) => [i.request_id, i])), [issuances]);

  const submitRequest = async (plan) => {
    try {
      const res = await fetch(`${API_URL}/lgu/me/subscription/requests`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: plan.plan_id, confirm: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return data.error || 'Could not submit your request.';
      setPlanModal(null);
      setToast({ tone: 'success', text: SUBMITTED_MESSAGE });
      load();
      return null;
    } catch {
      return 'Could not reach the server.';
    }
  };

  const cancelRequest = (request) => {
    playClick();
    setConfirmDialog({
      title: 'Cancel Renewal Request?',
      message: CANCEL_MESSAGE,
      cancelLabel: 'Keep Request',
      confirmLabel: 'Yes, Cancel Request',
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_URL}/lgu/me/subscription/requests/${request.request_id}/cancel`, {
            method: 'POST',
            headers: { ...authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirm: true }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { setToast({ tone: 'error', text: data.error || 'Could not cancel the request.' }); return; }
          setToast({ tone: 'success', text: 'Your upcoming subscription request was cancelled. Your current subscription is unchanged.' });
          load();
        } catch {
          setToast({ tone: 'error', text: 'Could not reach the server.' });
        }
      },
    });
  };

  const sub = subscription;
  const statusMeta = SUBSCRIPTION_STATUS_META[sub?.display_status] || SUBSCRIPTION_STATUS_META.none;
  const pctLeft = sub?.days_remaining != null && sub?.term_days ? Math.min(100, Math.round((sub.days_remaining / sub.term_days) * 100)) : 0;
  const running = sub?.status === 'active';

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconCreditCard size={22} className="text-brand-primary" /> Subscription
          </h1>
          <p className="text-brand-ink/60 text-sm">
            Your barangay's OpenUp subscription. Renewals are requested here, approved by the OpenUp admin, and activate
            automatically when your current plan ends -- nothing renews or charges automatically.
          </p>
        </div>
        <LguTopBar />
      </div>

      {toast && (
        <div role="status" className={`fixed top-5 left-1/2 -translate-x-1/2 z-70 flex items-start gap-2 text-white text-sm font-medium pl-4 pr-2 py-2.5 rounded-2xl shadow-lg max-w-[min(36rem,calc(100vw-2rem))] ${
          toast.tone === 'error' ? 'bg-red-600' : 'bg-brand-primary'
        }`}>
          {toast.tone === 'error' ? <IconAlertTriangle size={17} className="shrink-0 mt-0.5" /> : <IconCircleCheck size={17} className="shrink-0 mt-0.5" />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="p-1 rounded-full hover:bg-white/15 shrink-0" aria-label="Dismiss"><IconX size={14} /></button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}
      {subscription?.setup_error && <p className="text-sm text-red-600 mb-4 mt-4">{subscription.setup_error}</p>}

      {/* ---------------- Current subscription ---------------- */}
      {sub && (
        <section className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-base font-semibold">Current Subscription</h2>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusMeta.badge}`}>{statusMeta.label}</span>
          </div>

          {sub.plan_name ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Current plan" value={sub.plan_name} strong />
                <Stat label="Price" value={peso(sub.price)} />
                <Stat label="Care Credits included" value={credits(sub.care_credits)} />
                <Stat label="Remaining Care Credits" value={credits(sub.remaining_credits)} hint="Unallocated balance in your barangay budget" />
                <Stat label="Started" value={fmtDate(sub.started_at)} />
                <Stat label="Expires" value={fmtDate(sub.expires_at)} />
                <Stat label="Status" value={statusMeta.label} />
                <Stat label="Days remaining" value={running ? `${sub.days_remaining} day${sub.days_remaining === 1 ? '' : 's'}` : '—'} />
              </div>

              {running && (
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-brand-ink/55 mb-1">
                    <span>{sub.days_remaining} of {sub.term_days} days left</span>
                    <span>Expires {fmtShortDate(sub.expires_at)}</span>
                  </div>
                  <div className="h-2 bg-brand-ink/10 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pctLeft} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${statusMeta.bar}`} style={{ width: `${pctLeft}%` }} />
                  </div>
                </div>
              )}

              {sub.display_status === 'expiring_soon' && (
                <Notice tone="orange">
                  Your subscription expires in {sub.days_remaining} day{sub.days_remaining === 1 ? '' : 's'}. Choose a plan below to submit your renewal request.
                </Notice>
              )}
              {sub.status === 'expired' && (
                <Notice tone="gray">
                  This subscription expired on {fmtDate(sub.expires_at)}. New budget funding and Care Credit issuance are paused until a new
                  subscription is approved, paid and activated. Your records, residents and previously issued Care Credits are kept.
                </Notice>
              )}
              {sub.status === 'cancelled' && (
                <Notice tone="red">This subscription was cancelled. Choose a plan below to request a new one.</Notice>
              )}
            </>
          ) : (
            <p className="text-sm text-brand-ink/50">No subscription yet -- choose a plan below to submit your first request.</p>
          )}
        </section>
      )}

      {/* ---------------- Upcoming subscription ---------------- */}
      {sub && (
        <section className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2 mb-3">
            <IconCalendarEvent size={18} className="text-brand-primary" /> Upcoming Subscription
          </h2>
          {upcoming ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{upcoming.plan_name}</p>
                  <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${REQUEST_STATUS_META[upcoming.status].badge}`}>
                    {REQUEST_STATUS_META[upcoming.status].label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { playClick(); setDetailRequestId(upcoming.request_id); }} onMouseEnter={playHover}
                    className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20">
                    View Details
                  </button>
                  {['pending', 'approved'].includes(upcoming.status) && (
                    <button onClick={() => cancelRequest(upcoming)} onMouseEnter={playHover}
                      className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600">
                      Cancel Request
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <Stat label="Price" value={peso(upcoming.price)} />
                <Stat label="Care Credits included" value={credits(upcoming.care_credits)} />
                <Stat label="Duration" value={`${upcoming.validity_months} months`} />
                <Stat label="Requested" value={fmtDate(upcoming.requested_at)} />
                <Stat label="Expected activation" value={activationText(upcoming)} />
                <Stat label="Payment" value={PAYMENT_STATUS_LABEL[upcoming.payment_status]} />
              </div>
              {upcoming.status === 'approved' && upcoming.payment_status === 'unpaid' && (
                <Notice tone="sky">
                  Approved. Pay {peso(upcoming.price)} and send the payment reference from <button className="underline font-medium" onClick={() => setDetailRequestId(upcoming.request_id)}>View Details</button> so the admin can verify it and schedule your plan.
                </Notice>
              )}
              {upcoming.status === 'scheduled' && (
                <Notice tone="teal">
                  Approved and paid. It will activate automatically {upcoming.expected_activation_at ? `on ${fmtDate(upcoming.expected_activation_at)}` : 'shortly'}.
                  To cancel a paid request, contact the OpenUp admin.
                </Notice>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-brand-ink/50">
                {running ? 'No renewal requested yet. Choose your next plan below -- your current plan stays active until it ends.' : 'No upcoming subscription.'}
              </p>
              {subscription?.last_closed_request?.status === 'rejected' && (
                <Notice tone="red">
                  Your request for the {subscription.last_closed_request.plan_name} was rejected on {fmtDate(subscription.last_closed_request.rejected_at)}.
                  Reason: {subscription.last_closed_request.rejection_reason}
                  {subscription.last_closed_request.rejection_remarks ? ` (${subscription.last_closed_request.rejection_remarks})` : ''}
                </Notice>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------------- Plans ---------------- */}
      <h2 className="font-display text-base font-semibold mt-8 mb-3">Available Plans</h2>
      <div role="radiogroup" aria-label="Subscription plans" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-3 mb-8 items-stretch">
        {plans.map((p) => {
          const isCurrent = sub?.plan_id === p.plan_id && running;
          const isUpcoming = upcoming?.plan_id === p.plan_id;
          const isSelected = selectedPlanId === p.plan_id;
          const open = () => { playClick(); setSelectedPlanId(p.plan_id); setPlanModal(p); };
          return (
            <div
              key={p.plan_id}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${p.name}, ${peso(p.price)}`}
              tabIndex={0}
              onClick={open}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
              className={`plan-card relative h-full flex flex-col bg-brand-surface rounded-2xl p-5 ${p.is_featured ? 'is-featured' : ''} ${isSelected ? 'is-selected' : ''}`}
            >
              {p.is_featured && (
                <span className="plan-badge absolute -top-3 left-1/2 whitespace-nowrap text-[10px] font-semibold px-3 py-1 rounded-full bg-brand-primary text-white flex items-center gap-1">
                  <IconStar size={11} /> Most Popular
                </span>
              )}
              {isSelected && <span className="absolute top-3 right-3 text-brand-primary" aria-hidden="true"><IconCircleCheckFilled size={20} /></span>}
              <p className="text-sm font-semibold mt-1 pr-6">{p.name}</p>
              <p className="text-xs text-brand-ink/50 mt-1 min-h-8">{p.description}</p>
              <p className="text-lg font-semibold mt-2">{peso(p.price)}<span className="text-xs font-normal text-brand-ink/40"> /plan</span></p>
              <p className="text-xs text-brand-ink/60 mt-1">{credits(p.care_credits)} Care Credits</p>
              <p className="text-xs text-brand-ink/50">Valid for {p.validity_months} months</p>
              {(p.features || []).length > 0 && (
                <ul className="mt-3 space-y-1">
                  {p.features.slice(0, 4).map((f) => (
                    <li key={f} className="text-[11px] text-brand-ink/65 flex items-start gap-1.5"><IconCircleCheck size={13} className="text-brand-primary mt-px shrink-0" />{f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-4">
                {isCurrent && !isUpcoming && (
                  <p className="text-center text-[11px] font-medium text-emerald-700 mb-1.5">Your current plan</p>
                )}
                {isUpcoming ? (
                  <span className="block text-center text-xs font-medium px-3 py-2 rounded-full bg-teal-50 text-teal-700">
                    {REQUEST_STATUS_META[upcoming.status].label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); open(); }}
                    onMouseEnter={playHover}
                    disabled={Boolean(upcoming)}
                    title={upcoming ? 'You already have an upcoming request' : undefined}
                    className="plan-subscribe w-full text-xs font-medium px-3 py-2 rounded-full text-white disabled:opacity-50"
                  >
                    {running ? 'Schedule Renewal' : 'Subscribe Now'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------------- History ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-display text-base font-semibold flex items-center gap-1.5"><IconHistory size={16} /> Subscription History</h2>
        {history.length > 0 && (
          <button onClick={() => setShowLog((v) => !v)} className="text-xs text-brand-primary font-medium">
            {showLog ? 'Hide activity log' : 'Show activity log'}
          </button>
        )}
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-brand-ink/50">No subscription requests yet.</p>
      ) : (
        <div className="bg-brand-surface rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-left text-xs text-brand-ink/50 border-b border-brand-ink/10">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Care Credits issued</th>
                <th className="px-4 py-3 font-medium">Term</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Approved</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const issued = issuanceByRequest.get(r.request_id);
                const m = REQUEST_STATUS_META[r.status];
                return (
                  <tr key={r.request_id} className="border-b border-brand-ink/5 last:border-0">
                    <td className="px-4 py-3 font-medium">{r.plan_name}</td>
                    <td className="px-4 py-3 text-brand-ink/70">{peso(r.price)}</td>
                    <td className="px-4 py-3 text-brand-ink/70">{issued ? credits(issued.amount) : '—'}</td>
                    <td className="px-4 py-3 text-brand-ink/70 whitespace-nowrap">
                      {r.period_start ? `${fmtShortDate(r.period_start)} – ${fmtShortDate(r.period_end)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-brand-ink/70 whitespace-nowrap">{fmtShortDate(r.requested_at)}</td>
                    <td className="px-4 py-3 text-brand-ink/70 whitespace-nowrap">{fmtShortDate(r.approved_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${m.badge}`}>{m.label}</span>
                      {r.status === 'cancelled' && <span className="block text-[10px] text-brand-ink/45 mt-0.5">{fmtShortDate(r.cancelled_at)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { playClick(); setDetailRequestId(r.request_id); }} className="text-xs font-medium text-brand-primary">Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showLog && history.length > 0 && (
        <div className="bg-brand-surface rounded-2xl shadow-sm divide-y divide-brand-ink/5 mt-4">
          {history.map((h) => (
            <div key={h.history_id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="text-brand-ink/70">
                {HISTORY_LABEL[h.action] || h.action}{h.plan_name ? ` — ${h.plan_name}` : ''}
                {h.care_credits && h.action === 'credits_issued' ? ` (${credits(h.care_credits)})` : ''}
                {h.note ? <span className="block text-xs text-brand-ink/45">{h.note}</span> : null}
              </span>
              <span className="text-xs text-brand-ink/40">{fmtShortDate(h.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {planModal && (
        <PlanRequestModal
          key={planModal.plan_id}
          plan={planModal}
          current={sub}
          hasOpenRequest={Boolean(upcoming)}
          onClose={() => setPlanModal(null)}
          onSubmit={submitRequest}
        />
      )}
      {detailRequest && (
        <RequestDetailModal
          key={`${detailRequest.request_id}-${detailRequest.status}-${detailRequest.payment_status}`}
          request={detailRequest}
          onClose={() => setDetailRequestId(null)}
          onChanged={load}
        />
      )}
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </LguLayout>
  );
}

function Stat({ label, value, strong, hint }) {
  return (
    <div title={hint}>
      <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">{label}</p>
      <p className={`text-sm mt-0.5 ${strong ? 'font-semibold' : 'font-medium'}`}>{value ?? '—'}</p>
    </div>
  );
}

const NOTICE_TONES = {
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
  red: 'bg-red-50 border-red-200 text-red-800',
  sky: 'bg-sky-50 border-sky-200 text-sky-800',
  teal: 'bg-teal-50 border-teal-200 text-teal-800',
};

function Notice({ tone, children }) {
  return <div className={`mt-4 text-sm border rounded-xl px-4 py-3 ${NOTICE_TONES[tone]}`}>{children}</div>;
}

export default LguSubscription;
