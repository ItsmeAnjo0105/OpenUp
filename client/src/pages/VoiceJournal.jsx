import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { API_URL } from '../config';

const EMOTION_REFLECTIONS = {
  sadness: "It sounds like you're carrying something heavy right now. These feelings are real, and they matter.",
  fear: "It sounds like something is weighing on you and making things feel uncertain or unsafe.",
  anger: "It sounds like you're dealing with real frustration right now, and that's valid.",
  joy: "It's good to hear some lightness in what you shared today.",
  surprise: "It sounds like something unexpected has been on your mind.",
  disgust: "It sounds like something's been sitting heavy and uncomfortable with you.",
  neutral: "Thanks for sharing what's on your mind today.",
};

function VoiceJournal() {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [history, setHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [matching, setMatching] = useState(false);
  const [crisisStatus, setCrisisStatus] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
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

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = handleUpload;

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setResult(null);
    setDismissed(false);
    setStatus('');
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
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
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center text-white font-medium transition-colors ${
              recording ? 'bg-red-500' : 'bg-brand-primary hover:bg-brand-primary-dark'
            }`}
          >
            {recording ? 'Stop' : 'Record'}
          </button>
          {status && <p className="mt-6 text-brand-ink/60 text-sm">{status}</p>}
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

        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Past Entries</h2>
          {history.length === 0 ? (
            <p className="text-brand-ink/50 text-sm">No past entries yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => {
                const isOpen = expandedId === h.journal_id;
                return (
                  <div key={h.journal_id} className="bg-brand-surface rounded-lg shadow-sm overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : h.journal_id)}
                      className="w-full text-left p-4 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className={`text-sm text-brand-ink/80 ${isOpen ? '' : 'truncate'}`}>
                          {isOpen ? `"${h.transcript}"` : h.transcript}
                        </p>
                        <p className="text-xs text-brand-ink/40 mt-1">
                          {new Date(h.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-xs font-medium bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full capitalize shrink-0 ml-3">
                        {h.emotion_result}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-3">
                        {h.risk_flag && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <p className="text-sm text-purple-900 mb-3">
                              This entry contained language that may indicate severe emotional
                              distress. Connecting with a licensed psychologist can help.
                            </p>
                            <Link
                              to="/booking"
                              className="block text-center bg-brand-primary text-white py-2 rounded-full text-sm font-medium hover:bg-brand-primary-dark transition-colors"
                            >
                              Connect with a Licensed Psychologist
                            </Link>
                          </div>
                        )}
                        <div className="border-t border-brand-ink/10 pt-3">
                          <p className="font-medium text-brand-primary text-sm mb-1">AI Reflection</p>
                          <p className="text-sm text-brand-ink/80">
                            {EMOTION_REFLECTIONS[h.emotion_result?.toLowerCase()] || EMOTION_REFLECTIONS.neutral}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default VoiceJournal;
