import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';

function CommentThread({ testimonialId, currentUserId }) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = () => {
    fetch(`${API_URL}/testimonials/${testimonialId}/comments`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setComments(data); })
      .catch(() => {});
  };

  useEffect(load, [testimonialId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setError('');
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}/comments`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not post comment.');
        return;
      }
      setComments((prev) => [...prev, data]);
      setDraft('');
    } catch {
      setError('Could not reach the server.');
    }
  };

  const saveEdit = async (commentId) => {
    if (!editDraft.trim()) return;
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save comment.');
        return;
      }
      setComments((prev) => prev.map((c) => (c.comment_id === commentId ? data : c)));
      setEditingId(null);
    } catch {
      setError('Could not reach the server.');
    }
  };

  const remove = async (commentId) => {
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setComments((prev) => prev.filter((c) => c.comment_id !== commentId));
    } catch {
      // leave as-is
    }
  };

  const confirmRemove = (commentId) => {
    setConfirmDialog({
      title: 'Delete this comment?',
      message: "This can't be undone.",
      confirmLabel: 'Delete',
      onConfirm: () => remove(commentId),
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-brand-ink/10 space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {comments.map((c) => (
        <div key={c.comment_id} className="text-sm">
          {editingId === c.comment_id ? (
            <div className="flex gap-2">
              <input
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="flex-1 border border-brand-ink/15 rounded-lg px-2 py-1 text-sm"
              />
              <button onClick={() => saveEdit(c.comment_id)} className="text-xs text-brand-primary font-medium">Save</button>
              <button onClick={() => setEditingId(null)} className="text-xs text-brand-ink/50">Cancel</button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p>
                <span className="font-medium">{c.User?.name || 'Someone'}</span>{' '}
                <span className="text-brand-ink/70">{c.body}</span>
              </p>
              {c.user_id === currentUserId && (
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setEditingId(c.comment_id); setEditDraft(c.body); }} className="text-xs text-brand-ink/50">Edit</button>
                  <button onClick={() => confirmRemove(c.comment_id)} className="text-xs text-red-600">Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <form onSubmit={submit} className="flex gap-2 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment..."
          className="flex-1 border border-brand-ink/15 rounded-lg px-3 py-1.5 text-sm"
        />
        <button type="submit" className="text-xs font-medium text-brand-primary">Post</button>
      </form>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </div>
  );
}

function Community() {
  const [testimonials, setTestimonials] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const load = () => {
    fetch(`${API_URL}/testimonials`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setTestimonials(data); })
      .catch(() => setError('Could not load posts.'));
  };

  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setError('');
    try {
      const res = await fetch(`${API_URL}/testimonials`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not post.');
        return;
      }
      setTestimonials((prev) => [data, ...prev]);
      setDraft('');
    } catch {
      setError('Could not reach the server.');
    }
  };

  const saveEdit = async (testimonialId) => {
    if (!editDraft.trim()) return;
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save.');
        return;
      }
      setTestimonials((prev) => prev.map((t) => (t.testimonial_id === testimonialId ? data : t)));
      setEditingId(null);
    } catch {
      setError('Could not reach the server.');
    }
  };

  const remove = async (testimonialId) => {
    try {
      const res = await fetch(`${API_URL}/testimonials/${testimonialId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setTestimonials((prev) => prev.filter((t) => t.testimonial_id !== testimonialId));
    } catch {
      // leave as-is
    }
  };

  const confirmRemove = (testimonialId) => {
    setConfirmDialog({
      title: 'Delete this post?',
      message: "This can't be undone, and its comments will be deleted too.",
      confirmLabel: 'Delete',
      onConfirm: () => remove(testimonialId),
    });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-display text-2xl font-semibold mb-1">Community</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Share what's helped you, and support others.</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <form onSubmit={submit} className="bg-brand-surface rounded-2xl shadow-sm p-5 mb-6">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share something with the community..."
            rows={3}
            className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button type="submit" className="mt-2 text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
            Post
          </button>
        </form>

        <div className="space-y-4">
          {testimonials.map((t) => (
            <div key={t.testimonial_id} className="bg-brand-surface rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{t.User?.name || 'Someone'}</p>
                  <p className="text-xs text-brand-ink/50">{new Date(t.created_at).toLocaleDateString()}</p>
                </div>
                {t.user_id === user?.user_id && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setEditingId(t.testimonial_id); setEditDraft(t.body); }} className="text-xs text-brand-ink/50">Edit</button>
                    <button onClick={() => confirmRemove(t.testimonial_id)} className="text-xs text-red-600">Delete</button>
                  </div>
                )}
              </div>

              {editingId === t.testimonial_id ? (
                <div className="mt-2 flex gap-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    className="flex-1 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex flex-col gap-1">
                    <button onClick={() => saveEdit(t.testimonial_id)} className="text-xs text-brand-primary font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-brand-ink/50">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-brand-ink/80 mt-2">{t.body}</p>
              )}

              <button
                onClick={() => setExpandedId(expandedId === t.testimonial_id ? null : t.testimonial_id)}
                className="text-xs text-brand-ink/50 mt-3"
              >
                {expandedId === t.testimonial_id ? 'Hide comments' : 'View comments'}
              </button>

              {expandedId === t.testimonial_id && (
                <CommentThread testimonialId={t.testimonial_id} currentUserId={user?.user_id} />
              )}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </Layout>
  );
}

export default Community;
