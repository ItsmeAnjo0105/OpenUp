import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

const ALL_KEYS = [...SECTIONS.flatMap((s) => s.items.map((i) => i.key)), SAFETY_ITEM.key];

const BAND_COPY = {
  low: {
    label: 'Feeling steady',
    primaryAction: { label: 'View in mood tracker', to: '/mood-tracker' },
  },
  moderate: {
    label: 'Some strain showing',
    primaryAction: { label: 'Book a counseling session', to: '/booking' },
  },
  elevated: {
    label: "Carrying a lot right now",
    primaryAction: { label: 'Talk to AI Crisis Companion', to: '/crisis-companion' },
    secondaryAction: { label: 'Book a counseling session', to: '/booking' },
  },
};

function Assessment() {
  const [step, setStep] = useState('intro'); // intro | form | results
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  if (!user) return null;

  const allAnswered = ALL_KEYS.every((k) => answers[k] !== undefined);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id, answers }),
      });
      const data = await res.json();

      if (data.safety_flag) {
        // D1 > 0 — skip the results screen entirely and route straight to crisis support.
        navigate('/crisis-companion');
        return;
      }

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
            onClick={() => setStep('form')}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors"
          >
            Start check-in
          </button>
        </div>
      </Layout>
    );
  }

  if (step === 'form') {
    return (
      <Layout>
        <div className="max-w-xl mx-auto space-y-6 pb-10">
          <h1 className="font-display text-2xl font-semibold">OpenUp Quick Wellness Check</h1>

          {SECTIONS.map((section) => (
            <div key={section.key} className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-lg font-semibold mb-4">{section.title}</h2>
              <div className="space-y-5">
                {section.items.map((item) => (
                  <div key={item.key}>
                    <p className="text-sm text-brand-ink/80 mb-2">{item.text}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {SCALE.map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setAnswers({ ...answers, [item.key]: s.value })}
                          className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
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
                ))}
              </div>
            </div>
          ))}

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 border-2 border-brand-primary/20">
            <h2 className="font-display text-lg font-semibold mb-4">One last question</h2>
            <p className="text-sm text-brand-ink/80 mb-2">{SAFETY_ITEM.text}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SCALE.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setAnswers({ ...answers, [SAFETY_ITEM.key]: s.value })}
                  className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                    answers[SAFETY_ITEM.key] === s.value
                      ? 'bg-brand-primary text-white border-brand-primary'
                      : 'border-brand-ink/15 text-brand-ink/70 hover:bg-brand-ink/5'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-40"
          >
            {submitting ? 'Saving...' : 'See my results'}
          </button>
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
          Your responses have been saved privately. It's not a diagnosis, and no one else can see
          your answers.
        </p>

        <div className="bg-brand-primary/10 rounded-2xl p-5 text-left flex items-center justify-between">
          <div>
            <p className="text-brand-primary text-sm font-medium">Today's check-in</p>
            <p className="font-display text-xl font-semibold">{bandCopy.label}</p>
          </div>
          <span className="text-2xl">📈</span>
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
