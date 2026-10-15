import { useState } from 'react';
import { IconSpeakerphone } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminAnnouncements() {
  const [announcement, setAnnouncement] = useState({ title: '', body: '' });
  const [status, setStatus] = useState('');

  const postAnnouncement = async (e) => {
    e.preventDefault();
    setStatus('');
    try {
      const res = await fetch(`${API_URL}/admin/announcements`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(data.error || 'Could not post announcement.'); return; }
      setAnnouncement({ title: '', body: '' });
      setStatus('Sent to every user.');
    } catch {
      setStatus('Could not reach the server.');
    }
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconSpeakerphone size={22} className="text-brand-primary" /> Announcements
          </h1>
          <p className="text-brand-ink/60 text-sm">Sends a notification to every user on the platform.</p>
        </div>
        <AdminTopBar />
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 max-w-xl">
        {status && <p className="text-sm text-brand-primary mb-3">{status}</p>}

        <form onSubmit={postAnnouncement} className="space-y-3">
          <input
            placeholder="Title" value={announcement.title}
            onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
            required
            className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Message" value={announcement.body}
            onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}
            required
            rows={3}
            className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <button
            type="submit"
            onMouseEnter={playHover}
            onClick={playClick}
            className="interactive text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white"
          >
            Send to everyone
          </button>
        </form>
      </div>
    </AdminLayout>
  );
}

export default AdminAnnouncements;
