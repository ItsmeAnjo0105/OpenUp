import { useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

// Create or edit a Subscription_Plan catalog entry. `plan` is null for create.
function SubscriptionPlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: plan?.name || '',
    description: plan?.description || '',
    price: plan?.price ?? '',
    care_credits: plan?.care_credits ?? '',
    validity_months: plan?.validity_months ?? 12,
    is_featured: plan?.is_featured || false,
    features: (plan?.features || []).join('\n'),
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const url = plan ? `${API_URL}/admin/subscription-plans/${plan.plan_id}` : `${API_URL}/admin/subscription-plans`;
      const res = await fetch(url, {
        method: plan ? 'PATCH' : 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, features: form.features.split('\n').map((x) => x.trim()).filter(Boolean) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setSaving(false); return; }
      onSaved();
    } catch {
      setError('Could not reach the server.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="font-display text-lg font-semibold">{plan ? 'Edit plan' : 'New subscription plan'}</p>
          <button onClick={onClose} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <form onSubmit={submit} className="space-y-3 mt-3">
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Plan name</label>
            <input
              required value={form.name} onChange={(e) => setField('name', e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Description</label>
            <textarea
              rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-brand-ink/60 block mb-1">Price (₱)</label>
              <input
                type="number" min="0" required value={form.price} onChange={(e) => setField('price', e.target.value)}
                className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-brand-ink/60 block mb-1">Care Credits</label>
              <input
                type="number" min="0" required value={form.care_credits} onChange={(e) => setField('care_credits', e.target.value)}
                className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Validity (months)</label>
            <input
              type="number" min="1" required value={form.validity_months} onChange={(e) => setField('validity_months', e.target.value)}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-brand-ink/60 block mb-1">Included benefits (one per line, optional)</label>
            <textarea
              rows={3} value={form.features} onChange={(e) => setField('features', e.target.value)}
              placeholder={'e.g. Priority psychologist matching\nQuarterly wellness report'}
              className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
            />
            <p className="text-[11px] text-brand-ink/45 mt-1">Shown on the barangay plan cards. Care Credits and duration are listed automatically.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-ink/70">
            <input
              type="checkbox" checked={form.is_featured} onChange={(e) => setField('is_featured', e.target.checked)}
            />
            Mark as "Most Popular"
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving} onMouseEnter={playHover} onClick={playClick}
              className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : plan ? 'Save changes' : 'Create plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SubscriptionPlanModal;
