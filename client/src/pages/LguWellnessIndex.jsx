import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { IconChartBar } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';

function LguWellnessIndex() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load the wellness index.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const trend = (data?.wellness_trend || []).map((w) => ({ ...w, index: w.index ?? 0 }));

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconChartBar size={22} className="text-brand-primary" /> Community Wellness Index
          </h1>
          <p className="text-brand-ink/60 text-sm">% of residents whose most recent mood check-in was "Okay" or better.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-6">
            <p className="text-xs text-brand-ink/50">Current index (last 30 days)</p>
            <p className="text-4xl font-semibold mt-1">
              {data.wellness_index != null ? `${data.wellness_index}%` : 'No data yet'}
            </p>
            {data.wellness_index == null && (
              <p className="text-xs text-brand-ink/40 mt-2">No residents have logged a mood check-in in the last 30 days.</p>
            )}
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <h2 className="font-display text-base font-semibold mb-1">Weekly trend</h2>
            <p className="text-xs text-brand-ink/50 mb-4">Bars with no residents checking in that week show as 0.</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} width={32} domain={[0, 100]} allowDecimals={false} />
                <Bar dataKey="index" fill="#2F5D50" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </LguLayout>
  );
}

export default LguWellnessIndex;
