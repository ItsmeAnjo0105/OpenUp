import { useEffect, useState } from 'react';
import { IconFileText, IconDownload } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function downloadReportCsv(data) {
  const rows = [
    ['Barangay', data.barangay.name],
    ['City', data.barangay.city || ''],
    ['Registered residents', data.resident_count],
    ['Sessions requested', data.session_count],
    ['Sessions confirmed', data.confirmed_session_count],
    ['High-risk residents flagged', data.high_risk_count],
    ['Wellness index', data.wellness_index != null ? `${data.wellness_index}%` : 'No data'],
    ['Care credits issued (PHP)', data.care_credits_issued],
    ['Care credits used (PHP)', data.care_credits_used],
    ['Care credits used this month (PHP)', data.care_credits_used_this_month],
    ['Budget funded (PHP)', data.budget_funded],
    ['Budget spent (PHP)', data.budget_spent],
    ['Budget remaining (PHP)', data.budget_remaining],
    ['Subscription status', data.subscription_status],
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-${data.barangay.name.toLowerCase().replace(/\s+/g, '-')}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function LguReport() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/dashboard`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load your report.')))
      .catch(() => setError('Could not reach the server.'));
  }, []);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconFileText size={22} className="text-brand-primary" /> Accomplishment Report
          </h1>
          <p className="text-brand-ink/60 text-sm">Your barangay's activity, generated from live data.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {data && (
        <>
          <div className="flex justify-end mt-6 mb-4">
            <button
              onClick={() => { playClick(); downloadReportCsv(data); }}
              onMouseEnter={playHover}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
              style={{ backgroundColor: '#2b4d3f' }}
            >
              <IconDownload size={14} /> Export report
            </button>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <h2 className="font-display text-base font-semibold mb-4">Barangay {data.barangay.name}, {data.barangay.city}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Registered residents" value={data.resident_count} />
              <Field label="Sessions requested" value={data.session_count} />
              <Field label="Sessions confirmed" value={data.confirmed_session_count} />
              <Field label="High-risk residents flagged" value={data.high_risk_count} />
              <Field label="Wellness index" value={data.wellness_index != null ? `${data.wellness_index}%` : 'No data'} />
              <Field label="Care credits issued" value={`₱${data.care_credits_issued.toLocaleString()}`} />
              <Field label="Care credits used" value={`₱${data.care_credits_used.toLocaleString()}`} />
              <Field label="Care credits used this month" value={`₱${data.care_credits_used_this_month.toLocaleString()}`} />
              <Field label="Budget funded" value={`₱${data.budget_funded.toLocaleString()}`} />
              <Field label="Budget spent" value={`₱${data.budget_spent.toLocaleString()}`} />
              <Field label="Budget remaining" value={`₱${data.budget_remaining.toLocaleString()}`} />
              <Field label="Subscription status" value={data.subscription_status} capitalize />
            </div>
          </div>
        </>
      )}
    </LguLayout>
  );
}

function Field({ label, value, capitalize }) {
  return (
    <div>
      <p className="text-xs text-brand-ink/50">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}

export default LguReport;
