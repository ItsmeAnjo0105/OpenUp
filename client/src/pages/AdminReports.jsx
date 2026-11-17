import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { IconReportAnalytics, IconDownload, IconChartBar } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function downloadPlatformReportCsv(report) {
  const rows = [
    ['Month', 'Resident Signups', 'Psychologist Signups', 'Sessions Confirmed', 'Sessions Pending', 'Sessions Cancelled'],
    ...report.signups_by_month.map((s, i) => [
      s.label, s.residents, s.psychologists,
      report.sessions_by_month[i].confirmed, report.sessions_by_month[i].pending, report.sessions_by_month[i].cancelled,
    ]),
    [],
    ['Total collected (PHP)', report.payments.total_collected],
    ['Platform fees (PHP)', report.payments.platform_fees],
    ['Psychologist payouts (PHP)', report.payments.psychologist_payouts],
    ['Paid payments', report.payments.paid_count],
    ['Pending payments', report.payments.pending_count],
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-platform-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadAccomplishmentCsv(rows) {
  const header = ['Barangay', 'City', 'Residents', 'Sessions Requested', 'Sessions Confirmed', 'Care Credits Issued (PHP)', 'Care Credits Used (PHP)', 'Budget Funded (PHP)', 'Budget Spent (PHP)', 'Budget Remaining (PHP)'];
  const csvRows = rows.map((r) => [
    r.name, r.city, r.resident_count, r.session_count, r.confirmed_session_count,
    r.care_credits_issued, r.care_credits_used, r.budget_funded, r.budget_spent, r.budget_remaining,
  ]);
  const csv = [header, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-accomplishment-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const RISK_STYLE = {
  no_data: { bg: 'bg-brand-ink/10', text: 'text-brand-ink/40', label: 'No data' },
  low: { bg: 'bg-green-200', text: 'text-green-800', label: 'Low' },
  mild: { bg: 'bg-lime-200', text: 'text-lime-800', label: 'Mild' },
  moderate: { bg: 'bg-amber-200', text: 'text-amber-800', label: 'Moderate' },
  high: { bg: 'bg-orange-300', text: 'text-orange-900', label: 'High' },
  critical: { bg: 'bg-red-300', text: 'text-red-900', label: 'Critical' },
};
const HEATMAP_RANGES = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
];

function AdminReports() {
  const [platformReport, setPlatformReport] = useState(null);
  const [platformError, setPlatformError] = useState('');
  const [accReport, setAccReport] = useState([]);
  const [accError, setAccError] = useState('');
  const [accBarangayId, setAccBarangayId] = useState('');
  const [heatmap, setHeatmap] = useState([]);
  const [heatmapError, setHeatmapError] = useState('');
  const [heatmapRange, setHeatmapRange] = useState('week');

  const loadPlatform = () => {
    fetch(`${API_URL}/admin/platform-report`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) setPlatformReport(data);
        else setPlatformError(data?.error || 'Could not load the platform report.');
      })
      .catch(() => setPlatformError('Could not reach the server.'));
  };

  const loadAcc = () => {
    fetch(`${API_URL}/admin/accomplishment-report`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setAccReport(data);
        else setAccError(data?.error || 'Could not load the accomplishment report.');
      })
      .catch(() => setAccError('Could not reach the server.'));
  };

  const loadHeatmap = (range) => {
    fetch(`${API_URL}/admin/heatmap-overview?range=${range}`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setHeatmap(data);
        else setHeatmapError(data?.error || 'Could not load the heatmap.');
      })
      .catch(() => setHeatmapError('Could not reach the server.'));
  };

  useEffect(() => { loadPlatform(); loadAcc(); loadHeatmap('week'); }, []);

  const changeHeatmapRange = (range) => {
    setHeatmapRange(range);
    loadHeatmap(range);
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconReportAnalytics size={22} className="text-brand-primary" /> Reports
          </h1>
          <p className="text-brand-ink/60 text-sm">Accomplishment reporting and risk patterns across every barangay.</p>
        </div>
        <AdminTopBar />
      </div>

      {platformError && <p className="text-sm text-red-600 mb-4 mt-4">{platformError}</p>}

      {platformReport && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-display text-base font-semibold flex items-center gap-1.5">
              <IconChartBar size={16} className="text-brand-primary" /> Platform analytics
            </h2>
            <button
              onClick={() => { playClick(); downloadPlatformReportCsv(platformReport); }}
              onMouseEnter={playHover}
              className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full bg-brand-primary text-white"
            >
              <IconDownload size={14} /> Export data
            </button>
          </div>
          <p className="text-xs text-brand-ink/50 mb-4">Platform-wide trends, last 12 months -- not per-barangay (see Accomplishment report below for that).</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <p className="text-xs text-brand-ink/50">Total collected</p>
              <p className="text-xl font-semibold mt-0.5">₱{platformReport.payments.total_collected.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-brand-ink/50">Platform fees</p>
              <p className="text-xl font-semibold mt-0.5">₱{platformReport.payments.platform_fees.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-brand-ink/50">Psychologist payouts</p>
              <p className="text-xl font-semibold mt-0.5">₱{platformReport.payments.psychologist_payouts.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-brand-ink/50">Paid / Pending</p>
              <p className="text-xl font-semibold mt-0.5">{platformReport.payments.paid_count} / {platformReport.payments.pending_count}</p>
            </div>
          </div>

          <p className="text-xs font-medium text-brand-ink/60 mb-2">Signups per month</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={platformReport.signups_by_month}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} width={24} allowDecimals={false} />
              <Bar dataKey="residents" stackId="a" fill="#2F5D50" radius={[0, 0, 0, 0]} />
              <Bar dataKey="psychologists" stackId="a" fill="#5ED6A3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 mb-5 text-xs text-brand-ink/50">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-primary" /> Residents</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#5ED6A3' }} /> Psychologists</span>
          </div>

          <p className="text-xs font-medium text-brand-ink/60 mb-2">Sessions per month</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={platformReport.sessions_by_month}>
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} width={24} allowDecimals={false} />
              <Bar dataKey="confirmed" stackId="a" fill="#2F5D50" radius={[0, 0, 0, 0]} />
              <Bar dataKey="pending" stackId="a" fill="#E8A33D" radius={[0, 0, 0, 0]} />
              <Bar dataKey="cancelled" stackId="a" fill="#D9534F" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 text-xs text-brand-ink/50">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand-primary" /> Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#E8A33D' }} /> Pending</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#D9534F' }} /> Cancelled/Declined</span>
          </div>
        </div>
      )}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-display text-base font-semibold">Accomplishment report</h2>
          <button
            onClick={() => { playClick(); downloadAccomplishmentCsv(accBarangayId ? accReport.filter((r) => String(r.barangay_id) === accBarangayId) : accReport); }}
            onMouseEnter={playHover}
            disabled={accReport.length === 0}
            className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full bg-brand-primary text-white disabled:opacity-40"
          >
            <IconDownload size={14} /> Export report
          </button>
        </div>
        <p className="text-xs text-brand-ink/50 mb-4">
          Residents, sessions, care credits, and budget per barangay. Pick a barangay for its own
          report, or leave it on "All barangays" for the full picture.
        </p>

        {accError && <p className="text-sm text-red-600 mb-3">{accError}</p>}

        <select
          value={accBarangayId}
          onChange={(e) => setAccBarangayId(e.target.value)}
          className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm mb-4"
        >
          <option value="">All barangays</option>
          {accReport.map((r) => (
            <option key={r.barangay_id} value={r.barangay_id}>{r.name}</option>
          ))}
        </select>

        {accReport.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No barangays found.</p>
        ) : accBarangayId ? (
          (() => {
            const r = accReport.find((row) => String(row.barangay_id) === accBarangayId);
            if (!r) return null;
            return (
              <div className="border border-brand-ink/10 rounded-xl p-4">
                <p className="text-sm font-semibold mb-3">{r.name}{r.city ? `, ${r.city}` : ''}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><p className="text-xs text-brand-ink/50">Residents</p><p className="text-base font-semibold">{r.resident_count}</p></div>
                  <div><p className="text-xs text-brand-ink/50">Sessions requested</p><p className="text-base font-semibold">{r.session_count}</p></div>
                  <div><p className="text-xs text-brand-ink/50">Sessions confirmed</p><p className="text-base font-semibold">{r.confirmed_session_count}</p></div>
                  <div><p className="text-xs text-brand-ink/50">Care credits issued</p><p className="text-base font-semibold">₱{r.care_credits_issued.toLocaleString()}</p></div>
                  <div><p className="text-xs text-brand-ink/50">Care credits used</p><p className="text-base font-semibold">₱{r.care_credits_used.toLocaleString()}</p></div>
                  <div><p className="text-xs text-brand-ink/50">Budget remaining</p><p className="text-base font-semibold">₱{r.budget_remaining.toLocaleString()}</p></div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-brand-ink/50 uppercase">
                  <th className="pb-2 font-medium">Barangay</th>
                  <th className="pb-2 font-medium">Residents</th>
                  <th className="pb-2 font-medium">Sessions</th>
                  <th className="pb-2 font-medium">Credits used</th>
                  <th className="pb-2 font-medium">Budget remaining</th>
                </tr>
              </thead>
              <tbody>
                {accReport.map((r) => (
                  <tr key={r.barangay_id} className="border-t border-brand-ink/10">
                    <td className="py-2.5">{r.name}</td>
                    <td className="py-2.5 text-brand-ink/60">{r.resident_count}</td>
                    <td className="py-2.5 text-brand-ink/60">{r.confirmed_session_count}/{r.session_count}</td>
                    <td className="py-2.5 text-brand-ink/60">₱{r.care_credits_used.toLocaleString()}</td>
                    <td className="py-2.5 text-brand-ink/60">₱{r.budget_remaining.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <h2 className="font-display text-base font-semibold mb-1">Mental Health Heatmap -- All Barangays</h2>
        <p className="text-xs text-brand-ink/50 mb-4">
          Color intensity reflects reported distress & crisis-flag density. Risk band reflects distinct
          flagged residents within the selected window.
        </p>

        {heatmapError && <p className="text-sm text-red-600 mb-3">{heatmapError}</p>}

        <div className="flex flex-wrap gap-2 mb-4">
          {HEATMAP_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { playClick(); changeHeatmapRange(r.key); }}
              onMouseEnter={playHover}
              className={`interactive text-xs font-medium px-3.5 py-1.5 rounded-full ${
                heatmapRange === r.key ? 'bg-brand-primary text-white' : 'border border-brand-ink/15 text-brand-ink/70'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {heatmap.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No barangays found.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {heatmap.map((b) => {
              const style = RISK_STYLE[b.risk_band] || RISK_STYLE.no_data;
              return (
                <div key={b.barangay_id} className={`rounded-xl px-2 py-3 text-center ${style.bg} ${style.text}`}>
                  <p className="text-[11px] font-medium leading-tight truncate">{b.name}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{b.high_risk_count}/{b.resident_count}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-brand-ink/50">
          {Object.entries(RISK_STYLE).map(([key, s]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${s.bg}`} /> {s.label}
            </span>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminReports;
