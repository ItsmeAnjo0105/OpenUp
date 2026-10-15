import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconMicrophone, IconPlayerPlay, IconPlayerPause,
  IconFlame, IconNotebook, IconHeart, IconSun,
  IconWind, IconPencil, IconWalk, IconUsers, IconLeaf, IconChevronRight,
} from '@tabler/icons-react';
import Layout from '../components/Layout';
import JournalHistory from '../components/JournalHistory';
import { API_URL } from '../config';
import { LEVEL_FALLBACK_LABEL } from '../utils/emotions';
import { emotionMeta } from '../utils/voiceEmotions';

const RECOMMENDATIONS = [
  { icon: IconWind, title: 'Take a 2-minute breathing break', desc: 'Slow down. Breathe. You got this.' },
  { icon: IconPencil, title: 'Write down how you’re feeling', desc: 'It helps to get your thoughts out.', action: 'journal' },
  { icon: IconWalk, title: 'Take a short walk or stretch', desc: 'Move a little. Feel a little better.' },
  { icon: IconUsers, title: 'Reach out to someone you trust', desc: "You don’t have to go through this alone.", action: 'chat' },
];

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// Consecutive days (ending today) with at least one journal entry -- same
// "streak ending today" logic the server uses for the mood check-in streak,
// applied here to Voice_Journal's own dates instead.
function computeJournalStreak(entries) {
  if (!entries.length) return 0;
  const dates = new Set(entries.map((e) => new Date(e.created_at).toDateString()));
  let streak = 0;
  const cursor = new Date();
  while (dates.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeAvgMoodLabel(entries) {
  if (!entries.length) return '—';
  const avg = entries.reduce((sum, e) => sum + emotionMeta(e.emotion_result).level, 0) / entries.length;
  const rounded = Math.min(5, Math.max(1, Math.round(avg)));
  return LEVEL_FALLBACK_LABEL[rounded];
}

function StatTile({ icon, label, value, tint }) {
  return (
    <div className="border border-brand-ink/10 rounded-xl p-3 flex items-center gap-2.5 min-w-0">
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${tint}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-brand-ink/50 truncate">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

const BAR_COUNT = 5;
const BAR_MIN_HEIGHT = 6; // px — never fully flatten to zero during quiet moments
const SPEAKING_THRESHOLD = 20; // avg byte amplitude (0-255) above which we consider it "speech", not ambient noise
const REVIEW_BAR_COUNT = 40;

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function VoiceJournal() {
  // step: 'idle' | 'listening' | 'reviewing'
  const [step, setStep] = useState('idle');
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [history, setHistory] = useState([]);
  const [matching, setMatching] = useState(false);
  const [crisisStatus, setCrisisStatus] = useState(null);

  // Review-step state
  const [reviewUrl, setReviewUrl] = useState(null);
  const [reviewDuration, setReviewDuration] = useState(0);
  const [reviewBars, setReviewBars] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const barRefs = useRef([]);
  const speakingRef = useRef(false);
  const recordingStartRef = useRef(null);
  const reviewBlobRef = useRef(null);
  const reviewAudioRef = useRef(null);
  const micCardRef = useRef(null);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const handleRecommendation = (action) => {
    if (action === 'journal') micCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (action === 'chat') navigate('/anonymous-chat');
  };

  const loadHistory = () => {
    fetch(`${API_URL}/voice-journal/user/${user.user_id}`)
      .then((res) => res.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    if (user) loadHistory();
  }, [user]);

  useEffect(() => {
    // Clean up audio resources if the component unmounts mid-recording or mid-review
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateBars = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    const groupSize = Math.floor(data.length / BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < groupSize; j++) sum += data[i * groupSize + j];
      const avg = sum / groupSize; // 0-255
      const heightPx = Math.max(BAR_MIN_HEIGHT, Math.round((avg / 255) * 32));
      const bar = barRefs.current[i];
      if (bar) bar.style.height = `${heightPx}px`;
    }

    // Overall amplitude decides whether the user is actively speaking right now
    // (drives the pulsing rings) vs. just quiet ambient noise.
    const overallAvg = data.reduce((sum, v) => sum + v, 0) / data.length;
    const isSpeakingNow = overallAvg > SPEAKING_THRESHOLD;
    if (isSpeakingNow !== speakingRef.current) {
      speakingRef.current = isSpeakingNow;
      setSpeaking(isSpeakingNow);
    }

    animationFrameRef.current = requestAnimationFrame(animateBars);
  };

  const startRecording = async () => {
    setMicDenied(false);
    setStatus('');
    setResult(null);
    setDismissed(false);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicDenied(true);
      return;
    }

    streamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = handleRecordingStopped;
    recorder.start();
    mediaRecorderRef.current = recorder;
    recordingStartRef.current = Date.now();

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    animateBars();

    setStep('listening');
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop(); // triggers handleRecordingStopped once flushed
    cancelAnimationFrame(animationFrameRef.current);
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    speakingRef.current = false;
    setSpeaking(false);
  };

  // Recording has stopped — move to the review step. Nothing is uploaded yet.
  const handleRecordingStopped = () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    reviewBlobRef.current = blob;

    const url = URL.createObjectURL(blob);
    const duration = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));

    // Decorative static waveform — not a precise rendering of the actual audio
    const bars = Array.from({ length: REVIEW_BAR_COUNT }, () => 6 + Math.round(Math.random() * 26));

    setReviewUrl(url);
    setReviewDuration(duration);
    setReviewBars(bars);
    setCurrentTime(0);
    setIsPlaying(false);
    setStep('reviewing');
  };

  const cleanupReview = () => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    reviewBlobRef.current = null;
    setReviewUrl(null);
    setReviewDuration(0);
    setReviewBars([]);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleRetry = () => {
    cleanupReview();
    setStatus('');
    setStep('idle');
  };

  const handleDiscardAndLeave = () => {
    cleanupReview();
    setStatus('');
    setStep('idle');
  };

  const togglePlayback = () => {
    const audio = reviewAudioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleSaveReflection = async () => {
    const blob = reviewBlobRef.current;
    if (!blob) return;

    setSaving(true);
    setStatus('Saving and reflecting...');

    const formData = new FormData();
    formData.append('audio', blob, 'journal.webm');
    formData.append('user_id', user.user_id);
    formData.append('duration_seconds', String(reviewDuration));

    try {
      const res = await fetch(`${API_URL}/voice-journal`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Something went wrong. Your recording is still here — you can try saving again.');
        setSaving(false);
        return;
      }

      cleanupReview();
      setResult(data);
      setStatus('');
      setSaving(false);
      setStep('idle');
      loadHistory();
    } catch {
      setStatus('Could not reach the server. Your recording is still here — you can try saving again.');
      setSaving(false);
    }
  };

  const handleCrisisMatch = async () => {
    setMatching(true);
    try {
      const res = await fetch(`${API_URL}/crisis-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.user_id }),
      });
      const data = await res.json();

      if (data.matched) {
        navigate(`/session/${data.booking.booking_id}`);
      } else {
        setCrisisStatus('queued');
      }
    } catch {
      setCrisisStatus('error');
    } finally {
      setMatching(false);
    }
  };

  const journalStreak = useMemo(() => computeJournalStreak(history), [history]);
  const avgMoodLabel = useMemo(() => computeAvgMoodLabel(history), [history]);
  const lastEntryLabel = history[0]
    ? new Date(history[0].created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  if (!user) return null;

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">{greetingForNow()}, {user.name?.split(' ')[0]}</h1>
          <p className="text-brand-ink/60 text-sm mt-0.5">Take a moment. Your thoughts matter.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="min-w-0 space-y-6">
        {step !== 'reviewing' && (
          <div ref={micCardRef} className="bg-emerald-50/70 rounded-2xl p-6 sm:p-8 flex items-center gap-6 flex-wrap sm:flex-nowrap">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center mx-auto sm:mx-0">
              {step === 'listening' && speaking && (
                <>
                  <span className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full mic-ring" />
                  <span className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full mic-ring" style={{ animationDelay: '0.6s' }} />
                </>
              )}
              <button
                onClick={step === 'listening' ? stopRecording : startRecording}
                className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                {step === 'listening' ? (
                  <div className="flex items-end gap-1 h-8">
                    {[...Array(BAR_COUNT)].map((_, i) => (
                      <div
                        key={i}
                        ref={(el) => (barRefs.current[i] = el)}
                        className="w-1.5 bg-white rounded-full"
                        style={{ height: `${BAR_MIN_HEIGHT}px` }}
                      />
                    ))}
                  </div>
                ) : (
                  <IconMicrophone size={32} color="white" stroke={1.75} />
                )}
              </button>
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h2 className="font-display text-xl font-semibold">Voice Journal</h2>
              <p className="text-sm text-brand-ink/60 mt-0.5">Speak freely. We'll listen and reflect it back.</p>
              <button
                onClick={step === 'listening' ? stopRecording : startRecording}
                className="interactive mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white px-5 py-2.5 rounded-full"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                {step === 'listening' ? 'Listening…' : 'Tap to open up'} <IconChevronRight size={14} />
              </button>

              {micDenied && (
                <p className="mt-4 text-sm text-brand-accent bg-brand-accent/10 rounded-lg px-4 py-3">
                  We couldn't access your microphone. Please allow microphone access in your browser
                  settings to use Voice Journal.
                </p>
              )}
              {status && <p className="mt-4 text-brand-ink/60 text-sm">{status}</p>}
            </div>
          </div>
        )}

        {step === 'reviewing' && (
          <div
            className="bg-brand-surface shadow-sm p-6 mb-8"
            style={{ borderRadius: '16px', border: '0.5px solid rgba(28,36,32,0.1)' }}
          >
            <h2 className="font-display text-xl font-semibold mb-1">Review your recording</h2>
            <p className="text-sm text-brand-ink/60 mb-6">Listen back before saving. You can retry if you'd like.</p>

            <audio
              ref={reviewAudioRef}
              src={reviewUrl}
              onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
              onEnded={() => {
                setIsPlaying(false);
                setCurrentTime(0);
              }}
            />

            <div className="flex items-end gap-0.5 h-10 mb-4 justify-center">
              {reviewBars.map((h, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full"
                  style={{ height: `${h}px`, backgroundColor: '#2b4d3f', opacity: 0.35 }}
                />
              ))}
            </div>

            <div className="flex items-center gap-4 justify-center mb-6">
              <button
                onClick={togglePlayback}
                aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                {isPlaying ? (
                  <IconPlayerPause size={20} color="white" />
                ) : (
                  <IconPlayerPlay size={20} color="white" />
                )}
              </button>
              <p className="text-sm text-brand-ink/60 font-medium tabular-nums">
                {formatTime(currentTime)} / {formatTime(reviewDuration)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRetry}
                disabled={saving}
                className="flex-1 border border-brand-ink/15 text-brand-ink py-2.5 rounded-full font-medium hover:bg-brand-ink/5 transition-colors disabled:opacity-50"
              >
                Retry
              </button>
              <button
                onClick={handleSaveReflection}
                disabled={saving}
                className="flex-1 text-white py-2.5 rounded-full font-medium transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                {saving ? 'Saving...' : 'Save reflection'}
              </button>
            </div>

            {status && <p className="mt-3 text-center text-sm text-brand-accent">{status}</p>}

            <button
              onClick={handleDiscardAndLeave}
              disabled={saving}
              className="w-full text-center text-sm text-brand-ink/50 mt-4 hover:text-brand-ink/70 disabled:opacity-50"
            >
              Discard and leave
            </button>
          </div>
        )}

        {result?.show_crisis_modal && !dismissed && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-6 max-w-sm w-full">
              <p className="text-sm text-purple-900 mb-4">
                We've noticed language suggesting severe emotional distress in several of your recent
                entries. We recommend connecting with a licensed psychologist who can provide
                professional support.
              </p>

              {result.crisis_escalation?.matched ? (
                <button
                  onClick={() => navigate(`/session/${result.crisis_escalation.booking.booking_id}`)}
                  className="block w-full text-center bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors mb-2"
                >
                  Join now — a psychologist is ready
                </button>
              ) : result.crisis_escalation && !result.crisis_escalation.error ? (
                <p className="text-sm text-purple-900 mb-2">
                  No one is free to talk this exact moment, but you've been placed at the top of the
                  queue and a psychologist will reach out shortly. If you need to talk to someone right
                  now, please call [YOUR VERIFIED CRISIS HOTLINE NUMBER HERE].
                </p>
              ) : crisisStatus === 'queued' ? (
                <p className="text-sm text-purple-900 mb-2">
                  No one is free to talk this exact moment, but you've been placed at the top of the
                  queue and a psychologist will reach out shortly. If you need to talk to someone right
                  now, please call [YOUR VERIFIED CRISIS HOTLINE NUMBER HERE].
                </p>
              ) : (
                <button
                  onClick={handleCrisisMatch}
                  disabled={matching}
                  className="block w-full text-center bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors mb-2 disabled:opacity-60"
                >
                  {matching ? 'Connecting...' : 'Connect with a Licensed Psychologist'}
                </button>
              )}

              <button
                onClick={() => setDismissed(true)}
                className="w-full text-center border border-brand-primary text-brand-primary py-2.5 rounded-full font-medium hover:bg-brand-primary/5"
              >
                Not Now
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 mb-10">
            <p className="text-xs uppercase tracking-wide text-brand-ink/40 font-medium">
              Your recording · {new Date(result.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <p className="text-xs font-medium text-brand-ink/50 mb-2">Transcript</p>
              <p className="text-sm text-brand-ink/80">"{result.transcript}"</p>
            </div>

            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <p className="font-medium text-brand-primary text-sm mb-1">AI Reflection</p>
              <p className="text-xs font-medium text-brand-ink/50 mt-3 mb-1">Emotional Summary</p>
              <p className="text-sm text-brand-ink/80 mb-4">{result.emotional_summary}</p>
              <p className="text-sm text-brand-ink/80 mb-4">{result.wellness_suggestion}</p>
              <p className="text-xs font-medium text-brand-ink/50 mb-2">From what you said</p>
              <div className="flex gap-2 flex-wrap">
                {result.content_indicators?.map((label) => (
                  <span key={label} className="text-xs font-medium bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full capitalize">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <JournalHistory entries={history} />
        </div>

        <div className="space-y-6">
          <div className="bg-brand-surface rounded-2xl shadow-sm p-5" style={{ border: '0.5px solid rgba(28,36,32,0.1)' }}>
            <p className="font-display text-base font-semibold mb-3">Your Wellness at a Glance</p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                icon={<IconFlame size={17} />}
                label="Mood Streak"
                value={`${journalStreak} day${journalStreak === 1 ? '' : 's'}`}
                tint="bg-emerald-100 text-emerald-700"
              />
              <StatTile
                icon={<IconNotebook size={17} />}
                label="Total Journals"
                value={history.length}
                tint="bg-sky-100 text-sky-700"
              />
              <StatTile
                icon={<IconHeart size={17} />}
                label="Last Entry"
                value={lastEntryLabel}
                tint="bg-violet-100 text-violet-700"
              />
              <StatTile
                icon={<IconSun size={17} />}
                label="Avg Mood"
                value={avgMoodLabel}
                tint="bg-amber-100 text-amber-700"
              />
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-5" style={{ border: '0.5px solid rgba(28,36,32,0.1)' }}>
            <p className="font-display text-base font-semibold flex items-center gap-1.5">
              <IconLeaf size={16} className="text-brand-primary" /> Recommendations to Do
            </p>
            <p className="text-xs text-brand-ink/50 mb-3">Small steps can make a big difference.</p>
            <div>
              {RECOMMENDATIONS.map((r) => {
                const Icon = r.icon;
                const content = (
                  <>
                    <span className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{r.title}</p>
                      <p className="text-xs text-brand-ink/50 mt-0.5">{r.desc}</p>
                    </div>
                  </>
                );
                return r.action ? (
                  <button
                    key={r.title}
                    onClick={() => handleRecommendation(r.action)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-brand-ink/5 rounded-xl px-1.5 -mx-1.5"
                  >
                    {content}
                    <IconChevronRight size={15} className="text-brand-ink/30 shrink-0" />
                  </button>
                ) : (
                  <div key={r.title} className="w-full flex items-center gap-3 py-2.5">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default VoiceJournal;
