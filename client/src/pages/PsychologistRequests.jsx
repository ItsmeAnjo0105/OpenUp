import { useEffect, useState } from 'react';
import { IconCheck, IconX, IconCalendarEvent, IconChevronRight, IconLeaf } from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const AVATAR_COLORS = [
  { badge: 'bg-emerald-100 text-emerald-700', border: '#10b981' },
  { badge: 'bg-sky-100 text-sky-700', border: '#0ea5e9' },
  { badge: 'bg-violet-100 text-violet-700', border: '#8b5cf6' },
  { badge: 'bg-amber-100 text-amber-700', border: '#f59e0b' },
  { badge: 'bg-teal-100 text-teal-700', border: '#14b8a6' },
  { badge: 'bg-rose-100 text-rose-700', border: '#f43f5e' },
];

// Deterministic so the same resident always gets the same color, instead of
// a color that shuffles on every reload.
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function PsychologistRequests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    fetch(`${API_URL}/psychologists/me/booking-requests`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setRequests(data);
        else setError(data?.error || 'Could not load appointment requests.');
      })
      .catch(() => setError('Could not load appointment requests.'));
  };

  useEffect(load, []);

  const act = async (bookingId, action) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/${action}`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setRequests((prev) => prev.filter((r) => r.booking_id !== bookingId));
    } catch {
      setError('Could not reach the server.');
    }
  };

  const confirmDecline = (booking) => {
    setConfirmDialog({
      title: 'Are you sure you want to decline this request?',
      message: `${booking.User?.name || 'This resident'}'s request will be declined and any reserved Care Credit released back to them.`,
      confirmLabel: 'Decline',
      onConfirm: () => act(booking.booking_id, 'decline'),
    });
  };

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            Appointment Requests <IconLeaf size={20} className="text-brand-primary" />
          </h1>
          <p className="text-brand-ink/60 text-sm">Accept or decline residents asking to book you.</p>
        </div>
        <PsychologistTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-3 mt-4">{error}</p>}

      {requests.length === 0 ? (
        <p className="text-sm text-brand-ink/50 mt-6">No pending requests.</p>
      ) : (
        <div className="space-y-2.5 mt-6">
          {requests.map((r) => {
            const name = r.User?.name || `Resident #${r.resident_id}`;
            const isExpanded = expandedId === r.booking_id;
            const color = colorForName(name);
            return (
              <div
                key={r.booking_id}
                className="bg-brand-surface rounded-2xl shadow-sm border-l-4 overflow-hidden"
                style={{ borderColor: color.border }}
              >
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${color.badge}`}>
                      {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="flex items-center gap-1 text-xs text-brand-ink/50 mt-0.5">
                        <IconCalendarEvent size={12} />
                        {new Date(r.schedule).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { playClick(); act(r.booking_id, 'accept'); }}
                      onMouseEnter={playHover}
                      className="interactive interactive-accept flex items-center gap-1 text-xs font-medium px-3.5 py-2 rounded-full text-white"
                      style={{ backgroundColor: '#2b4d3f' }}
                    >
                      <IconCheck size={14} /> Accept
                    </button>
                    <button
                      onClick={() => { playClick(); confirmDecline(r); }}
                      onMouseEnter={playHover}
                      className="interactive interactive-decline flex items-center gap-1 text-xs font-medium px-3.5 py-2 rounded-full border border-red-300 text-red-600"
                    >
                      <IconX size={14} /> Decline
                    </button>
                    <button
                      onClick={() => { playClick(); setExpandedId(isExpanded ? null : r.booking_id); }}
                      onMouseEnter={playHover}
                      className="interactive text-brand-ink/40 hover:text-brand-ink/70 p-1"
                    >
                      <IconChevronRight size={16} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 -mt-1 flex flex-wrap gap-2">
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-brand-ink/5 text-brand-ink/60">
                      Requested {new Date(r.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {r.care_credit_id != null && (
                      <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                        Using a Care Credit
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </PsychologistLayout>
  );
}

export default PsychologistRequests;
