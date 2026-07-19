import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconMicrophone } from '@tabler/icons-react';
import Layout from '../components/Layout';
import JournalHistory from '../components/JournalHistory';
import { API_URL } from '../config';

const BAR_COUNT = 5;
const BAR_MIN_HEIGHT = 6; // px — never fully flatten to zero during quiet moments

function VoiceJournal() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [micDenied, setMicDenied] = useState(false);
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [history, setHistory] = useState([]);
  const [matching, setMatching] = useState(false);
  const [crisisStatus, setCrisisStatus] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const barRefs = useRef([]);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

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
    // Clean up audio resources if the component unmounts mid-recording
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
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

    animationFrameRef.current = requestAnimationFrame(animateBars);
  };

  const startRecording = async () => {
    setMicDenied(false);
    setStatus('');

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
    recorder.onstop = handleUpload;
    recorder.start();
    mediaRecorderRef.current = recorder;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    animateBars();

    setRecording(true);
    setResult(null);
    setDismissed(false);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    cancelAnimationFrame(animationFrameRef.current);
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setStatus('Processing your entry...');
  };

  const handleUpload = async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'journal.webm');
    formData.append('user_id', user.user_id);

    try {
      const res = await fetch(`${API_URL}/voice-journal`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || 'Something went wrong.');
        return;
      }

      setResult(data);
      setStatus('');
      loadHistory();
    } catch {
      setStatus('Could not reach the server.');
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

  if (!user) return null;

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Voice Journal</h1>
        <p className="text-brand-ink/60 text-sm mb-8">Speak freely. We'll listen and reflect it back.</p>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-8 text-center mb-8">
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            {!recording && (
              <>
                <span className="absolute w-24 h-24 rounded-full mic-ring" />
                <span className="absolute w-24 h-24 rounded-full mic-ring" style={{ animationDelay: '0.6s' }} />
              </>
            )}
            <button
              onClick={recording ? stopRecording : startRecording}
              className="relative z-10 w-24 h-24 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              {recording ? (
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
          <p className="mt-4 text-sm text-brand-ink/60 font-medium">
            {recording ? 'Listening…' : 'Tap to open up'}
          </p>

          {micDenied && (
            <p className="mt-4 text-sm text-brand-accent bg-brand-accent/10 rounded-lg px-4 py-3">
              We couldn't access your microphone. Please allow microphone access in your browser
              settings to use Voice Journal.
            </p>
          )}
          {status && <p className="mt-4 text-brand-ink/60 text-sm">{status}</p>}
        </div>

        {result && (
          <div className="space-y-4 mb-10">
            {result.risk_flag && !dismissed && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
                <p className="text-sm text-purple-900 mb-4">
                  We've detected language that may indicate you're experiencing severe emotional
                  distress. We recommend connecting with a licensed psychologist who can provide
                  professional support.
                </p>

                {crisisStatus === 'queued' ? (
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
            )}

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
    </Layout>
  );
}

export default VoiceJournal;
