import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL } from '../config';

const SCALE = [
  { value: 0, label: 'Never / Not at all' },
  { value: 1, label: 'Sometimes' },
  { value: 2, label: 'Often' },
  { value: 3, label: 'Almost always' },
];

const SECTIONS = [
  {
    key: 'mood',
    title: 'Mood',
    items: [
      { key: 'A1', text: 'I felt down, discouraged, or hopeless about things.' },
      { key: 'A2', text: 'I lost interest or joy in things I used to enjoy.' },
      { key: 'A3', text: 'I felt tired or low on energy, even after resting.' },
      { key: 'A4', text: 'I found it hard to feel motivated to start or finish tasks.' },
      { key: 'A5', text: "I felt like I wasn't good enough or was letting people down." },
    ],
  },
  {
    key: 'anxiety',
    title: 'Anxiety',
    items: [
      { key: 'B1', text: 'I felt nervous, on edge, or unable to relax.' },
      { key: 'B2', text: "My mind kept racing with worries I couldn't switch off." },
      { key: 'B3', text: 'I noticed physical tension — tight chest, fast heartbeat, or shallow breathing.' },
      { key: 'B4', text: 'I avoided situations because they made me anxious.' },
      { key: 'B5', text: "I felt a sense of dread about things that hadn't happened yet." },
    ],
  },
  {
    key: 'stress',
    title: 'Stress & Coping',
    items: [
      { key: 'C1', text: 'I felt overwhelmed by my responsibilities.' },
      { key: 'C2', text: 'Small problems felt bigger than they should.' },
      { key: 'C3', text: 'I found it hard to switch off or take a break.' },
      { key: 'C4', text: 'I felt irritable or quick to react to others.' },
      { key: 'C5', text: 'I struggled to sleep well or my sleep pattern felt off.' },
    ],
  },
];

const SAFETY_ITEM = {
  key: 'D1',
  text: "I've had thoughts of hurting myself or that life isn't worth living.",
};

// Flattened into one ordered list so the form can show one card at a time,
// with each question still tagged by its section for the small label above it.
const ALL_ITEMS = [
  ...SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))),
  { ...SAFETY_ITEM, section: 'One last question' },
];

const BAND_COPY = {
  low: {
    label: 'Feeling steady',
    explanation: 'Overall, this area seems steady for you right now.',
    primaryAction: { label: 'View in mood tracker', to: '/mood-tracker' },
  },
  moderate: {
    label: 'Some strain showing',
    explanation: "There's some noticeable strain here — worth keeping an eye on.",
    primaryAction: { label: 'Book a counseling session', to: '/booking' },
  },
  elevated: {
    label: "Carrying a lot right now",
    explanation: "This has been weighing on you a lot lately.",
    primaryAction: { label: 'Talk to AI Crisis Companion', to: '/crisis-companion' },
    secondaryAction: { label: 'Book a counseling session', to: '/booking' },
  },
};

const SECTION_LABELS = { mood: 'Mood', anxiety: 'Anxiety', stress: 'Stress & Coping' };
const SECTION_MAX_SCORE = 15; // 5 items × 0-3 each

function Assessment() {
  const [step, setStep] = useState('intro'); // intro | consent | form | results
  const [consentChecked, setConsentChecked] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [safetyBannerDismissed, setSafetyBannerDismissed] = useState(false);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  if (!user) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, answers }),
      });
      const data = await res.json();
      setResult(data);
      setStep('results');
    } catch {
      setSubmitting(false);
    }
  };

  if (step === 'intro') {
    return (
      <Layout>
        <div className="max-w-md mx-auto bg-brand-surface rounded-2xl shadow-sm p-8">
          <h1 className="font-display text-2xl font-semibold mb-1">OpenUp Quick Wellness Check</h1>
          <p className="text-brand-ink/60 text-sm mb-6">A short self-reflection tool — not a diagnostic instrument.</p>

          <p className="text-sm text-brand-ink/80 mb-6">
            This quick check-in helps us understand how you've been feeling lately. It takes about
            2 minutes and isn't a diagnosis — just a way to reflect and, if helpful, connect you
            with the right support.
          </p>

          <p className="text-sm text-brand-ink/60 mb-6">
            Answer based on how you've felt over the past 2 weeks. For each statement, choose how
            much it applied to you.
          </p>

          <button
            onClick={() => setStep('consent')}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors"
          >
            Start check-in
          </button>
        </div>
      </Layout>
    );
  }

  if (step === 'consent') {
    return (
      <Layout>
        <div className="max-w-md mx-auto bg-brand-surface rounded-2xl shadow-sm p-8">
          <h1 className="font-display text-xl font-semibold mb-1">Before you begin</h1>
          <p className="text-brand-ink/60 text-sm mb-5">Please read this before starting your check-in.</p>

          <div className="space-y-4 text-sm text-brand-ink/80 mb-6">
            <div>
              <p className="font-medium text-brand-ink">How your answers are used</p>
              <p className="text-brand-ink/60">
                Your answers are used only to score this check-in and, if a score suggests it, to
                gently point you toward the AI Crisis Companion or booking a counseling session.
                They are not used for research, insurance, or anything outside OpenUp.
              </p>
            </div>
            <div>
              <p className="font-medium text-brand-ink">Who can see your answers</p>
              <p className="text-brand-ink/60">
                You, and any psychologist you've had (or currently have) a booking with — they can
                see your check-in history to prepare for your session. No admin, LGU account, or
                other psychologist can view it.
              </p>
            </div>
            <div>
              <p className="font-medium text-brand-ink">Voluntary, always</p>
              <p className="text-brand-ink/60">
                You can stop or leave this check-in at any point without submitting anything, and
                retaking it never affects your access to any other part of OpenUp.
              </p>
            </div>
            <div>
              <p className="font-medium text-brand-ink">What this isn't</p>
              <p className="text-brand-ink/60">
                OpenUp is a student capstone project, not a licensed medical record system, and this
                check-in isn't reviewed by a clinician in real time. If you're in crisis or need
                immediate help, please contact a local emergency line or crisis hotline directly.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-primary shrink-0"
            />
            <span className="text-sm text-brand-ink/80">
              I've read this and agree to continue.
            </span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('intro')}
              className="flex-1 border border-brand-ink/15 text-brand-ink py-2.5 rounded-full font-medium hover:bg-brand-ink/5 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep('form')}
              disabled={!consentChecked}
              className="flex-1 bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-40"
            >
              Continue
            </button>
          </div>
          <Link to="/dashboard" className="block text-center text-xs text-brand-ink/40 mt-4 hover:text-brand-ink/60">
            Maybe later
          </Link>
        </div>
      </Layout>
    );
  }

  if (step === 'form') {
    const item = ALL_ITEMS[qIndex];
    const isLast = qIndex === ALL_ITEMS.length - 1;
    const canAdvance = answers[item.key] !== undefined;

    const goBack = () => {
      if (qIndex === 0) { setStep('consent'); return; }
      setQIndex(qIndex - 1);
    };

    const goNext = () => {
      if (isLast) { handleSubmit(); return; }
      setQIndex(qIndex + 1);
    };

    return (
      <Layout>
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2 text-xs text-brand-ink/50 font-medium">
            <span>{item.section}</span>
            <span>Question {qIndex + 1} of {ALL_ITEMS.length}</span>
          </div>
          <div className="h-1.5 bg-brand-ink/10 rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-brand-primary rounded-full transition-all duration-300"
              style={{ width: `${((qIndex + 1) / ALL_ITEMS.length) * 100}%` }}
            />
          </div>

          <div className={`bg-brand-surface rounded-2xl shadow-sm p-6 ${isLast ? 'border-2 border-brand-primary/20' : ''}`}>
            <p className="text-base text-brand-ink/90 mb-5 min-h-18">{item.text}</p>
            <div className="grid grid-cols-2 gap-2">
              {SCALE.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setAnswers({ ...answers, [item.key]: s.value })}
                  className={`text-xs font-medium px-3 py-3 rounded-lg border transition-colors ${
                    answers[item.key] === s.value
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'border-brand-ink/15 text-brand-ink/70 hover:bg-brand-ink/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={goBack}
              className="flex-1 border border-brand-ink/15 text-brand-ink py-2.5 rounded-full font-medium hover:bg-brand-ink/5 transition-colors"
            >
              Back
            </button>
            <button
              onClick={goNext}
              disabled={!canAdvance || submitting}
              className="flex-1 bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-40"
            >
              {isLast ? (submitting ? 'Saving...' : 'See my results') : 'Next'}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // step === 'results'
  const bandCopy = BAND_COPY[result.overall_band] || BAND_COPY.low;

  return (
    <Layout>
      <div className="max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-brand-primary/10 flex items-center justify-center text-3xl">
          💚
        </div>
        <h1 className="font-display text-2xl font-semibold">Thank you for checking in</h1>
        <p className="text-brand-ink/60 text-sm">
          Your responses have been saved. It's not a diagnosis -- your psychologist (if you have a
          booking with one) can see this history to prepare for your session; no one else can.
        </p>

        {result.safety_flag && !safetyBannerDismissed && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 text-left">
            <p className="text-sm text-purple-900 mb-4">
              You indicated having thoughts of hurting yourself, or that life isn't worth living.
              You don't have to go through this alone -- a licensed psychologist can help, right now.
            </p>
            <Link
              to="/crisis-companion"
              className="block w-full text-center bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors mb-2"
            >
              Talk to AI Crisis Companion
            </Link>
            <Link
              to="/booking"
              className="block w-full text-center border border-purple-300 text-purple-900 py-2.5 rounded-full font-medium hover:bg-purple-100/50 transition-colors mb-2"
            >
              Book a counseling session
            </Link>
            <button
              onClick={() => setSafetyBannerDismissed(true)}
              className="w-full text-center text-purple-900/60 text-sm py-1 hover:text-purple-900"
            >
              Not Now
            </button>
          </div>
        )}

        <div className="bg-brand-primary/10 rounded-2xl p-5 text-left flex items-center justify-between">
          <div>
            <p className="text-brand-primary text-sm font-medium">Today's check-in</p>
            <p className="font-display text-xl font-semibold">{bandCopy.label}</p>
            <p className="text-brand-ink/60 text-xs mt-1">{bandCopy.explanation}</p>
          </div>
          <span className="text-2xl">📈</span>
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-5 text-left space-y-4">
          {Object.entries(result.sections || {}).map(([key, section]) => {
            const percent = Math.round((section.score / SECTION_MAX_SCORE) * 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium">{SECTION_LABELS[key] || key}</p>
                  <p className="text-xs text-brand-ink/50 tabular-nums">{percent}%</p>
                </div>
                <div className="h-2 bg-brand-ink/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-primary rounded-full transition-all duration-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-xs text-brand-ink/50 mt-1.5">{BAND_COPY[section.band]?.explanation}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <Link
            to={bandCopy.primaryAction.to}
            className="block w-full bg-brand-ink text-white py-2.5 rounded-full font-medium hover:opacity-90 transition-opacity"
          >
            {bandCopy.primaryAction.label}
          </Link>
          {bandCopy.secondaryAction && (
            <Link
              to={bandCopy.secondaryAction.to}
              className="block w-full border border-brand-ink/15 text-brand-ink py-2.5 rounded-full font-medium hover:bg-brand-ink/5 transition-colors"
            >
              {bandCopy.secondaryAction.label}
            </Link>
          )}
          <Link
            to="/dashboard"
            className="block w-full border border-brand-ink/15 text-brand-ink py-2.5 rounded-full font-medium hover:bg-brand-ink/5 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="text-left">
          <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium mb-2">What happens next</p>
          <div className="bg-brand-surface rounded-2xl shadow-sm divide-y divide-brand-ink/10">
            <div className="p-4 flex gap-3">
              <span>✏️</span>
              <div>
                <p className="text-sm font-medium">Saved to your history</p>
                <p className="text-xs text-brand-ink/50">Tracked alongside daily mood logs</p>
              </div>
            </div>
            <div className="p-4 flex gap-3">
              <span>📅</span>
              <div>
                <p className="text-sm font-medium">Check in anytime</p>
                <p className="text-xs text-brand-ink/50">Retake weekly or whenever you'd like</p>
              </div>
            </div>
            <div className="p-4 flex gap-3">
              <span>🔲</span>
              <div>
                <p className="text-sm font-medium">Gentle suggestions available</p>
                <p className="text-xs text-brand-ink/50">Explore resources if you'd like support</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-brand-primary/10 rounded-2xl p-4 text-left">
          <p className="text-sm text-brand-primary">
            If your answers ever suggest you may be struggling, OpenUp will gently — never
            alarmingly — suggest the AI Crisis Companion or a licensed counselor.
          </p>
        </div>
      </div>
    </Layout>
  );
}

export default Assessment;
