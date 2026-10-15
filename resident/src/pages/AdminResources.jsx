import { useEffect, useState } from 'react';
import { IconBook, IconPlus, IconX, IconExternalLink } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminResources() {
  const [resources, setResources] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', description: '', category: '', file: null });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    fetch(`${API_URL}/admin/resources`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && Array.isArray(data)) setResources(data);
        else setError(data?.error || 'Could not load resources.');
      })
      .catch(() => setError('Could not reach the server.'));
  };

  useEffect(load, []);

  const submitAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    if (!addForm.file) { setAddError('A file is required.'); return; }
    setAddSaving(true);
    try {
      const formData = new FormData();
      formData.append('title', addForm.title);
      formData.append('description', addForm.description);
      formData.append('category', addForm.category);
      formData.append('file', addForm.file);

      const res = await fetch(`${API_URL}/admin/resources`, {
        method: 'POST',
        headers: authHeader(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Could not add resource.'); setAddSaving(false); return; }
      setAddForm({ title: '', description: '', category: '', file: null });
      setAddOpen(false);
      setAddSaving(false);
      load();
    } catch {
      setAddError('Could not reach the server.');
      setAddSaving(false);
    }
  };

  const openEdit = (r) => {
    setEditTarget(r);
    setEditForm({ title: r.title, description: r.description || '', category: r.category || '' });
    setEditError('');
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      const res = await fetch(`${API_URL}/admin/resources/${editTarget.resource_id}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Could not save changes.'); setEditSaving(false); return; }
      setEditSaving(false);
      setEditTarget(null);
      load();
    } catch {
      setEditError('Could not reach the server.');
      setEditSaving(false);
    }
  };

  const togglePublish = async (r) => {
    try {
      const res = await fetch(`${API_URL}/admin/resources/${r.resource_id}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !r.is_published }),
      });
      if (res.ok) load();
    } catch {
      // leave as-is
    }
  };

  const remove = async (resourceId) => {
    try {
      const res = await fetch(`${API_URL}/admin/resources/${resourceId}`, { method: 'DELETE', headers: authHeader() });
      if (res.ok) load();
    } catch {
      // leave as-is
    }
  };

  const confirmRemove = (r) => {
    setConfirmDialog({
      title: 'Are you sure you want to delete this resource?',
      message: `This permanently deletes "${r.title}" and its file. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: () => remove(r.resource_id),
    });
  };

  const visible = resources.filter((r) => !search || r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconBook size={22} className="text-brand-primary" /> Resources
          </h1>
          <p className="text-brand-ink/60 text-sm">Wellness Resources residents see on their own dashboard.</p>
        </div>
        <div className="flex items-center gap-3">
          <AdminTopBar search={search} onSearchChange={setSearch} searchPlaceholder="Search resources..." />
          <button
            onClick={() => { playClick(); setAddOpen(true); }}
            onMouseEnter={playHover}
            className="interactive flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-full text-white whitespace-nowrap"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            <IconPlus size={16} /> Add Resource
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4 mt-4">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-sm text-brand-ink/50 mt-6">No resources found.</p>
      ) : (
        <div className="space-y-3 mt-6">
          {visible.map((r) => (
            <div key={r.resource_id} className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {r.category && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary uppercase tracking-wide">{r.category}</span>
                  )}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${r.is_published ? 'bg-green-100 text-green-700' : 'bg-brand-ink/5 text-brand-ink/50'}`}>
                    {r.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <p className="font-medium mt-1">{r.title}</p>
                {r.description && <p className="text-sm text-brand-ink/60 mt-1">{r.description}</p>}
                <a href={r.file_url} target="_blank" rel="noreferrer" className="text-xs text-brand-primary flex items-center gap-1 mt-2 w-fit">
                  <IconExternalLink size={12} /> View file
                </a>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  onClick={() => { playClick(); togglePublish(r); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full text-white"
                  style={{ backgroundColor: r.is_published ? '#6b7280' : '#2b4d3f' }}
                >
                  {r.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => { playClick(); openEdit(r); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
                >
                  Edit
                </button>
                <button
                  onClick={() => { playClick(); confirmRemove(r); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setAddOpen(false)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">Add Resource</p>
              <button onClick={() => setAddOpen(false)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>
            {addError && <p className="text-sm text-red-600 mb-3">{addError}</p>}
            <form onSubmit={submitAdd} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Title</label>
                <input required value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Description</label>
                <textarea value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} rows={2} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Category</label>
                <input value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} placeholder="e.g. Coping Skills" className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">File</label>
                <input type="file" required onChange={(e) => setAddForm({ ...addForm, file: e.target.files[0] })} className="w-full text-sm" />
              </div>
              <p className="text-[11px] text-brand-ink/40">Saved as a draft -- publish it from the list when it's ready for residents.</p>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAddOpen(false)} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20">Cancel</button>
                <button type="submit" disabled={addSaving} className="interactive flex-1 text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {addSaving ? 'Uploading...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6" onClick={() => setEditTarget(null)}>
          <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-lg font-semibold">Edit Resource</p>
              <button onClick={() => setEditTarget(null)} className="text-brand-ink/40 hover:text-brand-ink/70"><IconX size={18} /></button>
            </div>
            {editError && <p className="text-sm text-red-600 mb-3">{editError}</p>}
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Title</label>
                <input required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-ink/60 block mb-1">Category</label>
                <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={editSaving} className="interactive w-full text-sm font-medium py-2.5 rounded-full bg-brand-primary text-white disabled:opacity-60">
                {editSaving ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

export default AdminResources;
