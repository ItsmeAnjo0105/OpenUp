import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { IconReportMoney, IconDownload, IconWallet, IconCircleCheck, IconCalendarEvent } from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import PsychologistTopBar from '../components/PsychologistTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

const STATUS_STYLE = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-brand-ink/5 text-brand-ink/50',
  declined: 'bg-brand-ink/5 text-brand-ink/50',
};

// Turns the already-fetched report data into a CSV and triggers a real
// browser download -- no server round trip needed for this, and no fake
// "coming soon" button either.
function downloadCsv(sessions) {
  const header = ['Date', 'Client', 'Status', 'Payout (PHP)', 'Payment Status'];
  const rows = sessions.map((s) => [
    new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
    s.client,
    s.status,
    s.payout ?? '',
    s.payment_status ?? '',
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-session-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function PsychologistReports() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/psychologists/me/reports`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => (ok ? setReport(data) : setError(data?.error || 'Could not load reports.')))
      .catch(() => setError('Could not load reports.'));
  }, []);

  return (
    <PsychologistLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconReportMoney size={22} className="text-brand-primary" /> Reports
          </h1>
          <p className="text-brand-ink/60 text-sm">Session and earnings history over the last 12 months.</p>
        </div>
        <PsychologistTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-6">
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <span className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center">
                <IconCalendarEvent size={18} />
              </span>
              <p className="text-xs text-brand-ink/50 mt-3">Total sessions</p>
              <p className="text-2xl font-semibold mt-0.5">{report.totals.total_sessions}</p>
            </div>
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <span className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                <IconCircleCheck size={18} />
              </span>
              <p className="text-xs text-brand-ink/50 mt-3">Completed</p>
              <p className="text-2xl font-semibold mt-0.5">{report.totals.completed_sessions}</p>
            </div>
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <span className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <IconWallet size={18} />
              </span>
              <p className="text-xs text-brand-ink/50 mt-3">Total earned</p>
              <p className="text-2xl font-semibold mt-0.5">₱{report.totals.total_paid.toLocaleString()}</p>
            </div>
            <div className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <span className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center">
                <IconWallet size={18} />
              </span>
              <p className="text-xs text-brand-ink/50 mt-3">Pending</p>
              <p className="text-2xl font-semibold mt-0.5">₱{report.totals.total_pending.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Earnings report</h2>
              <span className="text-xs text-brand-ink/40">Last 12 months</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={report.earnings_by_month}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} width={32} allowDecimals={false} />
                <Bar dataKey="paid" stackId="a" fill="#2F5D50" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill="#E8A33D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-brand-ink/50">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-primary" /> Paid</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#E8A33D' }} /> Pending</span>
            </div>
          </div>

          <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold">Session report</h2>
              <button
                onClick={() => { playClick(); downloadCsv(report.sessions); }}
                onMouseEnter={playHover}
                disabled={report.sessions.length === 0}
                className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full text-white disabled:opacity-40"
                style={{ backgroundColor: '#2b4d3f' }}
              >
                <IconDownload size={14} /> Export Report
              </button>
            </div>
            {report.sessions.length === 0 ? (
              <p className="text-sm text-brand-ink/50">No sessions in the last 12 months.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-brand-ink/50 uppercase">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Client</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sessions.map((s) => (
                      <tr key={s.booking_id} className="border-t border-brand-ink/10">
                        <td className="py-2.5 whitespace-nowrap">
                          {new Date(s.schedule).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 text-brand-ink/60 whitespace-nowrap">{s.client}</td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[s.status] || 'bg-brand-ink/5 text-brand-ink/50'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-brand-ink/60 whitespace-nowrap">
                          {s.payout != null ? `₱${s.payout.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </PsychologistLayout>
  );
}

export default PsychologistReports;
