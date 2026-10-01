import { useEffect, useMemo, useState } from 'react';
import { IconFileText, IconFileDownload, IconPrinter } from '@tabler/icons-react';
import LguLayout from '../components/LguLayout';
import LguTopBar from '../components/LguTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function downloadReportCsv(data) {
  const rows = [
    ['Barangay', data.barangay.name],
    ['City', data.barangay.city || ''],
    ['Reporting period', data.period_label],
    ['Registered residents', data.resident_count],
    ['Sessions requested', data.sessions_requested],
    ['Sessions confirmed', data.sessions_confirmed],
    ['Crisis escalations', data.crisis_escalations],
    ['Community wellness index', data.wellness_index != null ? `${data.wellness_index}%` : 'No data'],
    ['Wellness index, previous period', data.wellness_index_previous != null ? `${data.wellness_index_previous}%` : 'No data'],
    ['Care credits distributed (PHP)', data.care_credits_distributed],
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-${data.barangay.name.toLowerCase().replace(/\s+/g, '-')}-${data.period_label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function LguReport() {
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/lgu/me/monthly-report?month=${month}`, { headers: authHeader() })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => (ok ? setData(body) : setError(body?.error || 'Could not load your report.')))
      .catch(() => setError('Could not reach the server.'));
  }, [month]);

  const sections = useMemo(() => {
    if (!data) return [];
    const name = data.barangay.name;

    const reach = `A total of ${data.resident_count} resident${data.resident_count === 1 ? '' : 's'} of Barangay ${name} ${
      data.resident_count === 1 ? 'is' : 'were'
    } registered on the OpenUp platform as of this reporting period, representing active engagement within the barangay.`;

    let services = `${data.sessions_confirmed} of ${data.sessions_requested} counseling session${data.sessions_requested === 1 ? '' : 's'} requested by residents of Barangay ${name} were confirmed this period.`;
    services += data.crisis_escalations > 0
      ? ` ${data.crisis_escalations} case${data.crisis_escalations === 1 ? '' : 's'} were escalated directly to a licensed professional through the AI Crisis Companion.`
      : ' No crisis escalations were recorded this period.';

    let wellness;
    if (data.wellness_index == null) {
      wellness = `No residents logged a mood check-in this period, so a Community Wellness Index could not be calculated for Barangay ${name}.`;
    } else {
      wellness = `Barangay ${name}'s Community Wellness Index stands at ${data.wellness_index}% this period`;
      wellness += data.wellness_index_delta != null
        ? `, reflecting a ${data.wellness_index_delta >= 0 ? '+' : ''}${data.wellness_index_delta}% change from the previous period.`
        : ' (no prior-period data to compare against yet).';
    }

    const funds = data.care_credits_distributed > 0
      ? `₱${data.care_credits_distributed.toLocaleString()} in OpenUp Care Credits were distributed to residents of Barangay ${name}, supporting equitable access to professional counseling services.`
      : `No OpenUp Care Credits were distributed to residents of Barangay ${name} this period.`;

    return [
      { title: 'I. Program Reach', body: reach },
      { title: 'II. Services Rendered', body: services },
      { title: 'III. Community Wellness Index', body: wellness },
      { title: 'IV. Fund Utilization', body: funds },
    ];
  }, [data]);

  return (
    <LguLayout>
      <div className="flex items-start justify-between gap-4 mb-1 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconFileText size={22} className="text-brand-primary" /> Auto-Generated Accomplishment Report
          </h1>
          <p className="text-brand-ink/60 text-sm">Ready for DOH / higher government submission.</p>
        </div>
        <LguTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4 print:hidden">{error}</p>}

      {data && (
        <>
          <div className="flex items-center justify-between mt-6 mb-4 print:hidden">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-brand-surface rounded-2xl shadow-sm p-6">
              <h2 className="font-display text-lg font-semibold text-center">
                Barangay {data.barangay.name} Mental Wellness Program
              </h2>
              <p className="text-xs text-brand-ink/50 text-center mb-6">
                Monthly Accomplishment Report -- Barangay {data.barangay.name} -- {data.period_label}
              </p>

              <div className="space-y-5">
                {sections.map((s) => (
                  <div key={s.title}>
                    <p className="text-sm font-semibold text-brand-primary mb-1">{s.title}</p>
                    <p className="text-sm text-brand-ink/80 leading-relaxed">{s.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="print:hidden">
              <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
                <h2 className="font-display text-base font-semibold mb-3">Export options</h2>
                <div className="space-y-2">
                  <button
                    onClick={() => { playClick(); window.print(); }}
                    onMouseEnter={playHover}
                    className="interactive w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-full text-white"
                    style={{ backgroundColor: '#2b4d3f' }}
                  >
                    <IconPrinter size={16} /> Export as PDF
                  </button>
                  <button
                    onClick={() => { playClick(); downloadReportCsv(data); }}
                    onMouseEnter={playHover}
                    className="interactive w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20"
                  >
                    <IconFileDownload size={16} /> Export as CSV
                  </button>
                </div>
                <p className="text-xs text-brand-ink/40 mt-4">
                  Reports compile from live platform data for the selected month -- no manual encoding needed.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </LguLayout>
  );
}

export default LguReport;
