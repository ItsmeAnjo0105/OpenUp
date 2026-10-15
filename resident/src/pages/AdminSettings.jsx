import { useEffect, useState } from 'react';
import { IconSettings, IconDownload, IconShieldLock } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function downloadSnapshotJson(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `openup-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AdminSettings() {
  const [settings, setSettings] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState('');

  const load = () => {
    fetch(`${API_URL}/admin/settings`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setSettings(data);
        else setError(data?.error || 'Could not load settings.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const updateSetting = async (key, value) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_URL}/admin/settings/${key}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (res.ok) load();
    } catch {
      // leave as-is
    } finally {
      setSaving(null);
    }
  };

  const exportSnapshot = async () => {
    setSnapshotStatus('Generating...');
    try {
      const res = await fetch(`${API_URL}/admin/backup-snapshot`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setSnapshotStatus(data.error || 'Could not generate snapshot.'); return; }
      downloadSnapshotJson(data);
      setSnapshotStatus('Downloaded.');
    } catch {
      setSnapshotStatus('Could not reach the server.');
    }
  };

  const maintenanceMode = settings.find((s) => s.key === 'maintenance_mode');
  const platformName = settings.find((s) => s.key === 'platform_name');

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconSettings size={22} className="text-brand-primary" /> Settings
          </h1>
          <p className="text-brand-ink/60 text-sm">Platform configuration and data export.</p>
        </div>
        <AdminTopBar />
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-6">
        <h2 className="font-display text-base font-semibold mb-4">Manage Configurations</h2>

        {maintenanceMode && (
          <div className="flex items-center justify-between py-3 border-b border-brand-ink/10">
            <div>
              <p className="text-sm font-medium">Maintenance mode</p>
              <p className="text-xs text-brand-ink/50">{maintenanceMode.description}</p>
            </div>
            <button
              onClick={() => { playClick(); updateSetting('maintenance_mode', maintenanceMode.value === 'true' ? 'false' : 'true'); }}
              onMouseEnter={playHover}
              disabled={saving === 'maintenance_mode'}
              className={`interactive text-xs font-medium px-4 py-2 rounded-full text-white disabled:opacity-60 ${maintenanceMode.value === 'true' ? 'bg-red-600' : ''}`}
              style={maintenanceMode.value !== 'true' ? { backgroundColor: '#2b4d3f' } : undefined}
            >
              {maintenanceMode.value === 'true' ? 'Enabled -- click to disable' : 'Disabled -- click to enable'}
            </button>
          </div>
        )}

        {platformName && (
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">Platform name</p>
              <p className="text-xs text-brand-ink/50">{platformName.description}</p>
            </div>
            <input
              defaultValue={platformName.value}
              onBlur={(e) => { if (e.target.value !== platformName.value) updateSetting('platform_name', e.target.value); }}
              className="border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm w-40"
            />
          </div>
        )}
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mb-6">
        <h2 className="font-display text-base font-semibold mb-1">Backup & Maintenance</h2>
        <p className="text-xs text-brand-ink/50 mb-4">
          Exports a snapshot of platform-wide aggregate counts (never raw resident records) for your own
          record-keeping. This isn't a full database backup -- Supabase already handles infrastructure-level
          backups for this project automatically.
        </p>
        <button
          onClick={() => { playClick(); exportSnapshot(); }}
          onMouseEnter={playHover}
          className="interactive flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full text-white"
          style={{ backgroundColor: '#2b4d3f' }}
        >
          <IconDownload size={15} /> Export platform snapshot
        </button>
        {snapshotStatus && <p className="text-xs text-brand-ink/50 mt-2">{snapshotStatus}</p>}
      </div>

      <div className="bg-brand-ink/5 rounded-2xl p-6">
        <h2 className="font-display text-base font-semibold mb-1 flex items-center gap-1.5">
          <IconShieldLock size={16} /> Manage Roles & Permissions
        </h2>
        <p className="text-sm text-brand-ink/60">
          Not built. Every role check in this app (resident/psychologist/lgu/admin) is hardcoded in the
          backend via a <code className="text-xs bg-brand-ink/10 px-1 rounded">requireRole()</code> guard
          on each route -- there's no dynamic permissions table or editor. Making roles genuinely
          admin-configurable would mean redesigning the authorization layer itself, not adding a settings
          page on top of it.
        </p>
      </div>
    </AdminLayout>
  );
}

export default AdminSettings;
