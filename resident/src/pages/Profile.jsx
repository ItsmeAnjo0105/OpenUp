import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';

function Profile() {
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', current_password: '', new_password: '' });
  const [accountError, setAccountError] = useState('');
  const [accountSuccess, setAccountSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({ name: '', relationship: '', phone: '', email: '' });
  const [contactError, setContactError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const loadAccount = () => {
    fetch(`${API_URL}/users/me`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          setAccount(data);
          setForm((f) => ({ ...f, name: data.name, email: data.email }));
        } else {
          setAccountError(data?.error || 'Could not load your account.');
        }
      })
      .catch(() => setAccountError('Could not load your account.'));
  };

  const loadContacts = () => {
    fetch(`${API_URL}/trusted-contacts`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (ok && Array.isArray(data)) setContacts(data); })
      .catch(() => {});
  };

  useEffect(() => { loadAccount(); loadContacts(); }, []);

  const saveAccount = async (e) => {
    e.preventDefault();
    setAccountError('');
    setAccountSuccess('');
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
        setAccountError(data.error || 'Could not save changes.');
        setSaving(false);
        return;
      }
      setAccount(data);
      setForm((f) => ({ ...f, current_password: '', new_password: '' }));
      setAccountSuccess('Saved.');

      const storedUser = JSON.parse(localStorage.getItem('openup_user') || 'null');
      if (storedUser) {
        localStorage.setItem('openup_user', JSON.stringify({ ...storedUser, name: data.name, email: data.email }));
      }
      setSaving(false);
    } catch {
      setAccountError('Could not reach the server.');
      setSaving(false);
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    setContactError('');
    if (!contactForm.phone && !contactForm.email) {
      setContactError('Provide a phone number or email for this contact.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/trusted-contacts`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactError(data.error || 'Could not add contact.');
        return;
      }
      setContacts((prev) => [...prev, data]);
      setContactForm({ name: '', relationship: '', phone: '', email: '' });
    } catch {
      setContactError('Could not reach the server.');
    }
  };

  const removeContact = async (contactId) => {
    try {
      const res = await fetch(`${API_URL}/trusted-contacts/${contactId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
      if (res.ok) setContacts((prev) => prev.filter((c) => c.contact_id !== contactId));
    } catch {
      // leave the list as-is; the user can retry
    }
  };

  const confirmRemoveContact = (contactId, name) => {
    setConfirmDialog({
      title: `Are you sure you want to remove ${name}?`,
      message: "You won't be able to alert them from the AI Crisis Companion anymore.",
      confirmLabel: 'Remove',
      onConfirm: () => removeContact(contactId),
    });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1">Profile</h1>
          <p className="text-brand-ink/60 text-sm">Manage your account and trusted contacts.</p>
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <h2 className="font-medium mb-4">Account</h2>
          {accountError && <p className="text-sm text-red-600 mb-3">{accountError}</p>}
          {accountSuccess && <p className="text-sm text-brand-primary mb-3">{accountSuccess}</p>}

          {account && (
            <form onSubmit={saveAccount} className="space-y-4">
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
                className="bg-brand-primary text-white text-sm font-medium px-5 py-2.5 rounded-full disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          )}
        </div>

        <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
          <h2 className="font-medium mb-1">Trusted contacts</h2>
          <p className="text-xs text-brand-ink/50 mb-4">
            Used by the AI Crisis Companion's "alert trusted person" option.
          </p>

          {contactError && <p className="text-sm text-red-600 mb-3">{contactError}</p>}

          {contacts.length > 0 && (
            <div className="space-y-2 mb-4">
              {contacts.map((c) => (
                <div key={c.contact_id} className="border border-brand-ink/10 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{c.name} {c.relationship && <span className="text-brand-ink/50 font-normal">· {c.relationship}</span>}</p>
                    <p className="text-xs text-brand-ink/60">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button onClick={() => confirmRemoveContact(c.contact_id, c.name)} className="text-xs text-red-600 font-medium">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={addContact} className="grid grid-cols-2 gap-3">
            <input
              placeholder="Name" value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              required
              className="col-span-2 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Relationship (e.g. Mother)" value={contactForm.relationship}
              onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
              className="col-span-2 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Phone" value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Email" value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
            />
            <button type="submit" className="col-span-2 text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">
              Add contact
            </button>
          </form>
        </div>
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </Layout>
  );
}

export default Profile;
