import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowLeft, IconAlertTriangle, IconUserCog } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const MOOD_LABELS = { 1: 'Low', 2: 'Down', 3: 'Okay', 4: 'Good', 5: 'Calm' };

function LguResidents() {
  const [residents, setResidents] = useState([]);
  const [error, setError] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/residents`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok && Array.isArray(body) ? setResidents(body) : setError(body?.error || 'Could not load residents.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const visible = useMemo(
    () => (flaggedOnly ? residents.filter((r) => r.flagged) : residents),
    [residents, flaggedOnly]
  );

  return (
    <LguLayout>
      <Link to="/lgu/dashboard" onMouseEnter={playHover} onClick={playClick} className="interactive-nav inline-flex items-center gap-1.5 text-sm text-brand-ink/60 mb-4">
        <IconArrowLeft size={15} /> Back to Dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconUserCog size={22} className="text-brand-primary" /> Manage Residents
          </h1>
          <p className="text-brand-ink/60 text-sm">Residents registered in your barangay and their most recent check-in.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="flex items-center gap-2 mt-6 mb-4">
        <button
          onClick={() => { playClick(); setFlaggedOnly(false); }}
          onMouseEnter={playHover}
          className={`interactive text-xs font-medium px-3.5 py-2 rounded-full ${!flaggedOnly ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'}`}
        >
          All residents
        </button>
        <button
          onClick={() => { playClick(); setFlaggedOnly(true); }}
          onMouseEnter={playHover}
          className={`interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full ${flaggedOnly ? 'bg-red-600 text-white' : 'border border-brand-ink/15 text-brand-ink/70'}`}
        >
          <IconAlertTriangle size={13} /> Flagged only
        </button>
      </div>

      {residents.length === 0 ? (
        <p className="text-sm text-brand-ink/50">No residents registered yet.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-brand-ink/50">No flagged residents right now.</p>
      ) : (
        <div className="bg-brand-surface rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-brand-ink/50 uppercase bg-brand-bg/60">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Last check-in</th>
                <th className="px-5 py-3 font-medium">Recent mood</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.user_id} className="border-t border-brand-ink/10">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-brand-ink/60">
                    {r.last_check_in ? new Date(r.last_check_in).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'No check-ins yet'}
                  </td>
                  <td className="px-5 py-3 text-brand-ink/60">
                    {r.recent_mood_level != null ? MOOD_LABELS[r.recent_mood_level] : '—'}
                  </td>
                  <td className="px-5 py-3">
                    {r.flagged ? (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                        <IconAlertTriangle size={12} /> Flagged
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">Clear</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LguLayout>
  );
}

export default LguResidents;
