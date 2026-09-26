import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

function PsychologistSchedule() {
  const [windows, setWindows] = useState([]);
  const [form, setForm] = useState({ day_of_week: 1, start_time: '09:00', end_time: '17:00' });
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/psychologists/me/availability`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setWindows(data); })
      .catch(() => setError('Could not load your schedule.'));
  };

  useEffect(load, []);

  const addWindow = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/psychologists/me/availability`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, day_of_week: Number(form.day_of_week) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not add this window.');
        return;
      }
      setWindows((prev) => [...prev, data]);
    } catch {
      setError('Could not reach the server.');
    }
  };

  const removeWindow = async (availabilityId) => {
    try {
      const res = await fetch(`${API_URL}/psychologists/me/availability/${availabilityId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setWindows((prev) => prev.filter((w) => w.availability_id !== availabilityId));
    } catch {
      // leave as-is
    }
  };

  const confirmRemove = (w) => {
    setConfirmDialog({
      title: 'Are you sure you want to remove this window?',
      message: `${DAYS[w.day_of_week]}, ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)} will no longer be bookable.`,
      confirmLabel: 'Remove',
      onConfirm: () => removeWindow(w.availability_id),
    });
  };

  const byDay = DAYS.map((_, i) => windows.filter((w) => w.day_of_week === i)).map((list) =>
    list.sort((a, b) => a.start_time.localeCompare(b.start_time))
  );

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Schedule</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Set your weekly working hours. Residents can only book slots inside these windows.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="font-medium mb-4">Add a window</h2>
        <form onSubmit={addWindow} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-brand-ink/50 block mb-1">Day</label>
            <select
              value={form.day_of_week}
              onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-brand-ink/50 block mb-1">From</label>
            <select
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            >
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-brand-ink/50 block mb-1">To</label>
            <select
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            >
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <button type="submit" className="text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
            Add
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DAYS.map((day, i) => (
          <div key={day} className="bg-brand-surface rounded-2xl shadow-sm p-5">
            <p className="font-medium mb-3">{day}</p>
            {byDay[i].length === 0 ? (
              <p className="text-xs text-brand-ink/40">No hours set</p>
            ) : (
              <div className="space-y-2">
                {byDay[i].map((w) => (
                  <div key={w.availability_id} className="flex items-center justify-between text-sm">
                    <span>{w.start_time.slice(0, 5)} – {w.end_time.slice(0, 5)}</span>
                    <button onClick={() => confirmRemove(w)} className="text-xs text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </PsychologistLayout>
  );
}

export default PsychologistSchedule;
