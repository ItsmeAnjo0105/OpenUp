import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader } from './config';
import ConfirmDialog from './components/ConfirmDialog';

function CounselingSession({ bookingId, name, role }) {
  const jitsiContainerRef = useRef(null);
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [actionError, setActionError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleValue, setRescheduleValue] = useState('');

  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesStatus, setNotesStatus] = useState('');

  const [escalateNote, setEscalateNote] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);

  const isPsychologist = role === 'psychologist';

  const loadBooking = () => {
    fetch(`${API_URL}/bookings/${bookingId}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (ok) setBooking(data); })
      .catch(() => {});
  };

  useEffect(() => {
    if (!isPsychologist) return;
    loadBooking();
    fetch(`${API_URL}/bookings/${bookingId}/notes`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => setNotes(data?.body || ''))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    let api;
    let disposed = false;

    fetch(`${API_URL}/jitsi-token/${bookingId}?name=${name}&role=${role}`)
      .then((res) => res.json())
      .then(({ token, room }) => {
        if (disposed) return; // effect was cleaned up before the fetch resolved

        api = new window.JitsiMeetExternalAPI('8x8.vc', {
          roomName: room,
          jwt: token,
          parentNode: jitsiContainerRef.current,
          width: '100%',
          height: 500,
          configOverwrite: {
            disableVideo: true,
            startWithVideoMuted: true,
            startWithAudioMuted: false,
            startAudioOnly: true,
            prejoinPageEnabled: false,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: ['microphone', 'hangup', 'chat'],
          },
        });
      });

    return () => {
      disposed = true;
      if (api) api.dispose();
    };
  }, [bookingId, name, role]);

  const saveNotes = async () => {
    setNotesSaving(true);
    setNotesStatus('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/notes`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: notes }),
      });
      if (!res.ok) { setNotesStatus('Could not save.'); return; }
      setNotesStatus('Saved.');
    } catch {
      setNotesStatus('Could not reach the server.');
    } finally {
      setNotesSaving(false);
    }
  };

  const handleCancel = async () => {
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/psychologist-cancel`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Could not cancel this session.'); return; }
      navigate('/psychologist/dashboard');
    } catch {
      setActionError('Could not reach the server.');
    }
  };

  const confirmCancelSession = () => {
    setConfirmDialog({
      title: 'Are you sure you want to cancel this session?',
      message: 'Your client will be notified and any credit or payment tied to it will be released.',
      confirmLabel: 'Cancel session',
      onConfirm: handleCancel,
    });
  };

  const handleReschedule = async () => {
    if (!rescheduleValue) return;
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/psychologist-reschedule`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: rescheduleValue }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Could not reschedule this session.'); return; }
      setBooking(data.booking);
      setRescheduling(false);
      setRescheduleValue('');
    } catch {
      setActionError('Could not reach the server.');
    }
  };

  const handleEscalate = async () => {
    setEscalating(true);
    setActionError('');
    try {
      const res = await fetch(`${API_URL}/bookings/${bookingId}/escalate`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: escalateNote }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || 'Could not raise this escalation.');
        return;
      }
      setEscalated(true);
    } catch {
      setActionError('Could not reach the server.');
    } finally {
      setEscalating(false);
    }
  };

  const confirmEscalate = () => {
    setConfirmDialog({
      title: 'Are you sure you want to escalate this to emergency services?',
      message: "This raises the session urgently for every admin to review right away. It does not itself contact police, EMS, or a crisis hotline -- if there's immediate danger, please also contact local emergency services directly.",
      confirmLabel: 'Escalate now',
      onConfirm: handleEscalate,
    });
  };

  return (
    <div>
      <h2>Counseling Session — Booking #{bookingId}</h2>
      <div ref={jitsiContainerRef} />

      {isPsychologist && (
        <div className="max-w-xl mt-6 space-y-6">
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}

          <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
            <p className="font-medium mb-3">Session</p>
            {booking && (
              <p className="text-sm text-brand-ink/60 mb-3">
                With {booking.User?.name || 'your client'} ·{' '}
                {new Date(booking.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                <span className="capitalize">{booking.status}</span>
              </p>
            )}

            {rescheduling ? (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={rescheduleValue}
                  onChange={(e) => setRescheduleValue(e.target.value)}
                  className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
                />
                <button
                  onClick={handleReschedule}
                  disabled={!rescheduleValue}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
                >
                  Confirm new time
                </button>
                <button
                  onClick={() => { setRescheduling(false); setRescheduleValue(''); }}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                >
                  Nevermind
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setRescheduling(true)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                >
                  Reschedule
                </button>
                <button
                  onClick={confirmCancelSession}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                >
                  Cancel session
                </button>
              </div>
            )}
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
            <p className="font-medium mb-3">Session notes</p>
            <p className="text-xs text-brand-ink/50 mb-3">Private to you -- your client can never see this.</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Notes for your own reference..."
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={saveNotes}
                disabled={notesSaving}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
              >
                {notesSaving ? 'Saving...' : 'Save notes'}
              </button>
              {notesStatus && <span className="text-xs text-brand-ink/50">{notesStatus}</span>}
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5">
            <p className="font-medium text-purple-900 mb-1">Escalate to emergency services</p>
            <p className="text-xs text-purple-900/70 mb-3">
              Use this if your client is in immediate danger. It flags this session for every admin to
              review right away -- it does not itself contact police, EMS, or a crisis hotline.
            </p>
            {escalated ? (
              <p className="text-sm text-purple-900 font-medium">Escalation raised. Admins have been notified.</p>
            ) : (
              <>
                <textarea
                  value={escalateNote}
                  onChange={(e) => setEscalateNote(e.target.value)}
                  rows={2}
                  placeholder="Optional note for the admin reviewing this..."
                  className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm resize-none mb-2 bg-white"
                />
                <button
                  onClick={confirmEscalate}
                  disabled={escalating}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-purple-700 text-white disabled:opacity-60"
                >
                  {escalating ? 'Escalating...' : 'Escalate to emergency services'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

export default CounselingSession;
