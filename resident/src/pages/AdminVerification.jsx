import { useEffect, useState } from 'react';
import { IconClipboardCheck } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminVerification() {
  const [pending, setPending] = useState([]);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/admin/psychologists?status=pending`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setPending(data);
        else setError(data?.error || 'Could not load pending applications.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const act = async (psychologistId, action) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/psychologists/${psychologistId}/${action}`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setPending((prev) => prev.filter((p) => p.psychologist_id !== psychologistId));
    } catch {
      setError('Could not reach the server.');
    }
  };

  const confirmReject = (psychologist) => {
    setConfirmDialog({
      title: 'Are you sure you want to reject this application?',
      message: `${psychologist.User?.name || 'This applicant'}'s account will be marked rejected.`,
      confirmLabel: 'Reject',
      destructive: true,
      onConfirm: () => act(psychologist.psychologist_id, 'reject'),
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconClipboardCheck size={22} className="text-brand-primary" /> Verification
          </h1>
          <p className="text-brand-ink/60 text-sm">Pending psychologist license applications.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
        {pending.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No pending applications.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <div key={p.psychologist_id} className="border border-brand-ink/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{p.User?.name}</p>
                  <p className="text-xs text-brand-ink/50">{p.User?.email}</p>
                  <p className="text-xs text-brand-ink/60 mt-1">License: {p.license_no}</p>
                  <p className="text-xs text-brand-ink/60">Credentials: {p.credentials}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { playClick(); act(p.psychologist_id, 'verify'); }}
                    onMouseEnter={playHover}
                    className="interactive text-xs font-medium px-3 py-1.5 rounded-full bg-brand-primary text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { playClick(); confirmReject(p); }}
                    onMouseEnter={playHover}
                    className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

export default AdminVerification;
