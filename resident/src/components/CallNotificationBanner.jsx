import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../config';

// Mounted once in Layout (same spot as ReminderBanner) so a resident sees this
// no matter which page they're on when their psychologist starts an audio call --
// real-time via socket.io, unlike ReminderBanner's 30s poll, since someone
// already waiting on a call shouldn't sit for up to 30s before finding out.
function CallNotificationBanner() {
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('openup_token');
    if (!token) return;

    const socket = io(API_URL);
    socket.emit('join-user-channel', { token });
    socket.on('call-started', ({ booking_id, psychologist_name }) => {
      setIncomingCall({ booking_id, psychologist_name });
    });

    return () => socket.disconnect();
  }, []);

  if (!incomingCall) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] bg-brand-primary text-white rounded-2xl shadow-lg p-4 max-w-xs">
      <p className="font-medium text-sm">📞 {incomingCall.psychologist_name} started your session call</p>
      <p className="text-xs text-white/80 mt-1">Join whenever you're ready.</p>
      <div className="flex gap-2 mt-3">
        <a
          href={`/session/${incomingCall.booking_id}`}
          className="text-xs font-medium bg-white text-brand-primary px-3 py-1.5 rounded-full"
        >
          Join call
        </a>
        <button onClick={() => setIncomingCall(null)} className="text-xs text-white/70">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default CallNotificationBanner;
