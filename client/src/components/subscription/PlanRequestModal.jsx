import { useState } from 'react';
import { IconX, IconCircleCheck, IconArrowRight, IconAlertTriangle, IconStar } from '@tabler/icons-react';
import { peso, credits, fmtDate, addMonths } from '../../utils/subscriptionStatus';
import { playClick, playHover } from '../../utils/sound';

// Barangay > Subscription: clicking a plan card opens this. Step 1 shows the
// full plan and how the process works; step 2 is the confirmation (current
// vs. next plan, expected activation) that actually submits the request.
// Nothing activates here -- the request goes to the admin.
function PlanRequestModal({ plan, current, hasOpenRequest, onClose, onSubmit }) {
  const [step, setStep] = useState('details');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const running = current?.status === 'active' && current?.expires_at && new Date(current.expires_at) > new Date();
  const expectedStart = running ? new Date(current.expires_at) : null;
  const expectedEnd = expectedStart ? addMonths(expectedStart, plan.validity_months) : null;
  const isRenewal = Boolean(current?.plan_name);
  const close = () => !submitting && onClose();

  const confirm = async () => {
    playClick();
    setSubmitting(true);
    setError('');
    const err = await onSubmit(plan);
    if (err) { setError(err); setSubmitting(false); }
  };

  const features = [
    `${credits(plan.care_credits)} Care Credits added to your barangay's budget when the plan activates`,
    `Valid for ${plan.validity_months} months from activation`,
    ...(plan.features || []),
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-brand-surface rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-modal-title"
      >
        <div className="flex items-start justify-between gap-3 p-6 pb-0">
          <div>
            {plan.is_featured && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-brand-primary text-white mb-2">
                <IconStar size={11} /> Most Popular
              </span>
            )}
            <h2 id="plan-modal-title" className="font-display text-xl font-semibold">
              {step === 'details' ? plan.name : (isRenewal ? 'Confirm Renewal Request' : 'Confirm Subscription Request')}
            </h2>
          </div>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-brand-ink/5 text-brand-ink/50" aria-label="Close"><IconX size={18} /></button>
        </div>

        {step === 'details' ? (
          <div className="p-6 pt-3">
            {plan.description && <p className="text-sm text-brand-ink/60">{plan.description}</p>}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Fact label="Price" value={peso(plan.price)} />
              <Fact label="Care Credits" value={credits(plan.care_credits)} />
              <Fact label="Duration" value={`${plan.validity_months} months`} />
            </div>

            <h3 className="text-sm font-semibold mt-5 mb-2">Included</h3>
            <ul className="space-y-1.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-brand-ink/75">
                  <IconCircleCheck size={16} className="text-brand-primary mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>

            <h3 className="text-sm font-semibold mt-5 mb-2">How it works</h3>
            <ol className="text-xs text-brand-ink/65 space-y-1 list-decimal pl-4">
              <li>You submit a request for this plan. Nothing is charged or activated yet.</li>
              <li>The OpenUp admin reviews and approves or rejects it.</li>
              <li>Once approved, you pay {peso(plan.price)} and send the payment reference for verification.</li>
              <li>
                {running
                  ? `The plan is scheduled and starts automatically when your current plan ends on ${fmtDate(current.expires_at)}.`
                  : 'The plan activates as soon as payment is verified.'}
              </li>
              <li>Care Credits are added once, when the plan activates. Nothing renews automatically.</li>
            </ol>

            {hasOpenRequest && (
              <p className="mt-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                You already have an upcoming subscription request. Cancel it first if you want to choose this plan instead.
              </p>
            )}

            <div className="flex gap-2 mt-6">
              <button onClick={close} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Close</button>
              <button
                onClick={() => { playClick(); setStep('confirm'); }}
                onMouseEnter={playHover}
                disabled={hasOpenRequest}
                className="plan-subscribe flex-1 text-sm font-medium py-2.5 rounded-full text-white disabled:opacity-50"
              >
                {running ? 'Schedule Renewal' : 'Request Subscription'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 pt-3">
            <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <div className="bg-brand-bg rounded-xl p-4">
                <p className="text-[11px] uppercase tracking-wide text-brand-ink/45">Current subscription</p>
                {current?.plan_name ? (
                  <>
                    <p className="text-sm font-semibold mt-1">{current.plan_name}</p>
                    <p className="text-xs text-brand-ink/60">{peso(current.price)} · {credits(current.care_credits)} Care Credits</p>
                    <p className="text-xs text-brand-ink/50 mt-1">
                      {current.status === 'active' ? `Active until ${fmtDate(current.expires_at)}` : `Status: ${current.status}`}
                    </p>
                  </>
                ) : <p className="text-sm text-brand-ink/50 mt-1">None</p>}
              </div>
              <div className="hidden sm:flex items-center text-brand-primary"><IconArrowRight size={20} /></div>
              <div className="bg-brand-primary/10 rounded-xl p-4 border border-brand-primary/30">
                <p className="text-[11px] uppercase tracking-wide text-brand-primary/80">{isRenewal ? 'Next subscription' : 'Requested subscription'}</p>
                <p className="text-sm font-semibold mt-1">{plan.name}</p>
                <p className="text-xs text-brand-ink/60">{peso(plan.price)} · {credits(plan.care_credits)} Care Credits</p>
                <p className="text-xs text-brand-ink/50 mt-1">{plan.validity_months} months</p>
              </div>
            </div>

            <dl className="mt-4 text-sm space-y-2 bg-brand-bg rounded-xl p-4">
              <Line label="New subscription price" value={peso(plan.price)} />
              <Line label="Care Credits included" value={credits(plan.care_credits)} />
              <Line label="Subscription duration" value={`${plan.validity_months} months`} />
              <Line label="Expected activation" value={expectedStart ? fmtDate(expectedStart) : 'As soon as approved and payment is verified'} />
              {expectedEnd && <Line label="Expected expiration" value={fmtDate(expectedEnd)} />}
            </dl>
            {running && (
              <p className="text-xs text-brand-ink/55 mt-3">
                Your current {current.plan_name} stays active until {fmtDate(current.expires_at)} while the admin reviews this request.
              </p>
            )}

            {error && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 flex items-start gap-2">
                <IconAlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex gap-2 mt-6">
              <button onClick={() => { playClick(); setStep('details'); }} disabled={submitting} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20 disabled:opacity-60">
                Cancel
              </button>
              <button onClick={confirm} onMouseEnter={playHover} disabled={submitting} className="plan-subscribe flex-1 text-sm font-medium py-2.5 rounded-full text-white disabled:opacity-60">
                {submitting ? 'Submitting...' : 'Confirm Renewal Request'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="bg-brand-bg rounded-xl px-3 py-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-brand-ink/45">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brand-ink/55">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}

export default PlanRequestModal;
