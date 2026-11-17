import { useEffect, useState } from 'react';
import { IconFlag, IconCheck, IconTrash } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminCommunity() {
  const [flagged, setFlagged] = useState([]);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/admin/testimonials?flagged=true`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setFlagged(data);
        else setError(data?.error || 'Could not load flagged posts.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const keep = async (testimonialId) => {
    try {
      const res = await fetch(`${API_URL}/admin/testimonials/${testimonialId}/keep`, {
        method: 'POST',
        headers: authHeader(),
      });
      if (res.ok) setFlagged((prev) => prev.filter((t) => t.testimonial_id !== testimonialId));
    } catch {
      // leave as-is
    }
  };

  const remove = async (testimonialId) => {
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}`, { method: 'DELETE', headers: authHeader() });
      if (res.ok) setFlagged((prev) => prev.filter((t) => t.testimonial_id !== testimonialId));
    } catch {
      // leave as-is
    }
  };

  const confirmRemove = (t) => {
    setConfirmDialog({
      title: 'Are you sure you want to remove this post?',
      message: `This permanently deletes ${t.User?.name || 'this resident'}'s post and its comments. This cannot be undone.`,
      confirmLabel: 'Remove permanently',
      destructive: true,
      onConfirm: () => remove(t.testimonial_id),
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconFlag size={22} className="text-brand-primary" /> Community
          </h1>
          <p className="text-brand-ink/60 text-sm">Testimonials residents have reported, awaiting your review.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6">
        {flagged.length === 0 ? (
          <p className="text-sm text-brand-ink/50">Nothing flagged right now.</p>
        ) : (
          <div className="space-y-3">
            {flagged.map((t) => (
              <div key={t.testimonial_id} className="border border-brand-ink/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold">{t.User?.name || 'Someone'}</p>
                    <p className="text-xs text-brand-ink/50">{new Date(t.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1 shrink-0">
                    <IconFlag size={12} /> Flagged
                  </span>
                </div>
                <p className="text-sm text-brand-ink/80 mb-3">{t.body}</p>
                {t.flag_reason && (
                  <p className="text-xs text-brand-ink/50 mb-3">Reason: "{t.flag_reason}"</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { playClick(); keep(t.testimonial_id); }}
                    onMouseEnter={playHover}
                    className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-brand-ink/20"
                  >
                    <IconCheck size={13} /> Keep
                  </button>
                  <button
                    onClick={() => { playClick(); confirmRemove(t); }}
                    onMouseEnter={playHover}
                    className="interactive flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full border border-red-300 text-red-600"
                  >
                    <IconTrash size={13} /> Remove
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

export default AdminCommunity;
