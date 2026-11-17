import { useEffect, useState } from 'react';
import { IconUserCircle } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function initials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function AdminProfile() {
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', current_password: '', new_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/users/me`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setError(data?.error || 'Could not load your account.'); return; }
        setAccount(data);
        setForm((f) => ({ ...f, name: data.name, email: data.email }));
      })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const payload = { name: form.name, email: form.email };
      if (form.new_password) {
        payload.current_password = form.current_password;
        payload.new_password = form.new_password;
      }
      const res = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save changes.');
        setSaving(false);
        return;
      }
      setAccount(data);
      setForm((f) => ({ ...f, current_password: '', new_password: '' }));
      setSuccess('Saved.');

      const storedUser = JSON.parse(localStorage.getItem('openup_user') || 'null');
      if (storedUser) {
        localStorage.setItem('openup_user', JSON.stringify({ ...storedUser, name: data.name, email: data.email }));
      }
      setSaving(false);
    } catch {
      setError('Could not reach the server.');
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconUserCircle size={22} className="text-brand-primary" /> Profile
          </h1>
          <p className="text-brand-ink/60 text-sm">Your admin account.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {account && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 max-w-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 shrink-0 rounded-full bg-brand-primary text-white flex items-center justify-center text-lg font-semibold">
              {initials(account.name)}
            </div>
            <div>
              <p className="font-display text-lg font-semibold">{account.name}</p>
              <p className="text-sm text-brand-ink/60">Super Admin</p>
            </div>
          </div>

          {success && <p className="text-sm text-brand-primary mb-3">{success}</p>}

          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium block mb-1">Current password</label>
                <input
                  type="password"
                  value={form.current_password}
                  onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                  placeholder="Only if changing password"
                  className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">New password</label>
                <input
                  type="password"
                  value={form.new_password}
                  onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              onMouseEnter={playHover}
              onClick={playClick}
              className="interactive bg-brand-primary text-white text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminProfile;
