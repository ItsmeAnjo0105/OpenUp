import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

function CrisisCompanion() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi, I'm here with you. What's on your mind today?" },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [matching, setMatching] = useState(false);
  const [crisisStatus, setCrisisStatus] = useState(null);
  const bottomRef = useRef(null);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('http://localhost:5000/crisis-companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, history: newMessages }),
      });
      const data = await res.json();

      setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      if (data.crisis_detected) setCrisisDetected(true);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setSending(false);
    }
  };

  const handleCrisisMatch = async () => {
    setMatching(true);
    try {
      const res = await fetch('http://localhost:5000/crisis-match', {
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
      <div className="max-w-xl mx-auto flex flex-col h-[80vh]">
        <h1 className="font-display text-2xl font-semibold mb-1">AI Crisis Companion</h1>
        <p className="text-brand-ink/60 text-sm mb-4">
          A private, judgment-free space to talk. Not a replacement for professional care.
        </p>

        {crisisDetected && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-4">
            <p className="text-sm text-purple-900 mb-4">
              It sounds like you might be going through something serious. Connecting with a
              licensed psychologist can help.
            </p>
            {crisisStatus === 'queued' ? (
              <p className="text-sm text-purple-900">
                No one is free this exact moment, but you're first in line. If you need help right
                now, please call [YOUR VERIFIED CRISIS HOTLINE NUMBER HERE].
              </p>
            ) : (
              <button
                onClick={handleCrisisMatch}
                disabled={matching}
                className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
              >
                {matching ? 'Connecting...' : 'Connect with a Licensed Psychologist'}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                m.role === 'user'
                  ? 'bg-brand-primary text-white'
                  : 'bg-brand-surface shadow-sm text-brand-ink/80'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type how you're feeling..."
            className="flex-1 border border-brand-ink/15 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-brand-primary text-white px-5 py-2.5 rounded-full font-medium hover:bg-brand-primary-dark disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </div>
    </Layout>
  );
}

export default CrisisCompanion;
