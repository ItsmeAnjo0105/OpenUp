import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import DateOverrideCalendar from '../components/DateOverrideCalendar';
import { API_URL, authHeader } from '../config';

function PsychologistSchedule() {
  const [windows, setWindows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/availability`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setWindows(data); })
      .catch(() => setError('Could not load your schedule.'));
  }, []);

  const removeWeeklyWindow = async (availabilityId) => {
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

  return (
    <PsychologistLayout>
      <h1 className="font-display text-2xl font-semibold mb-1">Schedule</h1>
      <p className="text-brand-ink/60 text-sm mb-8">
        Pick a date to set your hours, or take that day off. Residents can only book slots inside these windows.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <DateOverrideCalendar weeklyWindows={windows} onRemoveWeeklyWindow={removeWeeklyWindow} />
    </PsychologistLayout>
  );
}

export default PsychologistSchedule;
