import { useEffect, useState } from 'react';
import { IconRobot, IconPlus, IconTrash, IconPhoneCall } from '@tabler/icons-react';
import AdminLayout from '../components/AdminLayout';
import AdminTopBar from '../components/AdminTopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { API_URL, authHeader } from '../config';
import { playHover, playClick } from '../utils/sound';

function AdminAIManagement() {
  const [rules, setRules] = useState([]);
  const [newPhrase, setNewPhrase] = useState('');
  const [ruleError, setRuleError] = useState('');

  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', description: '' });
  const [contactError, setContactError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null);

  const loadRules = () => {
    fetch(`${API_URL}/admin/escalation-rules`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setRules(data); })
      .catch(() => setRuleError('Could not load escalation rules.'));
  };

  const loadContacts = () => {
    fetch(`${API_URL}/emergency-contacts`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setContacts(data); })
      .catch(() => setContactError('Could not load emergency contacts.'));
  };

  useEffect(() => { loadRules(); loadContacts(); }, []);

  const addRule = async (e) => {
    e.preventDefault();
    setRuleError('');
    if (!newPhrase.trim()) return;
    try {
      const res = await fetch(`${API_URL}/admin/escalation-rules`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: newPhrase }),
      });
      const data = await res.json();
      if (!res.ok) { setRuleError(data.error || 'Could not add phrase.'); return; }
      setNewPhrase('');
      loadRules();
    } catch {
      setRuleError('Could not reach the server.');
    }
  };

  const removeRule = async (ruleId) => {
    try {
      const res = await fetch(`${API_URL}/admin/escalation-rules/${ruleId}`, { method: 'DELETE', headers: authHeader() });
      if (res.ok) setRules((prev) => prev.filter((r) => r.rule_id !== ruleId));
    } catch {
      // leave as-is
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    setContactError('');
    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      setContactError('Name and phone are both required.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/admin/emergency-contacts`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const data = await res.json();
      if (!res.ok) { setContactError(data.error || 'Could not add contact.'); return; }
      setContactForm({ name: '', phone: '', description: '' });
      loadContacts();
    } catch {
      setContactError('Could not reach the server.');
    }
  };

  const removeContact = async (contactId) => {
    try {
      const res = await fetch(`${API_URL}/admin/emergency-contacts/${contactId}`, { method: 'DELETE', headers: authHeader() });
      if (res.ok) setContacts((prev) => prev.filter((c) => c.contact_id !== contactId));
    } catch {
      // leave as-is
    }
  };

  const confirmRemoveContact = (contact) => {
    setConfirmDialog({
      title: `Remove ${contact.name} from emergency contacts?`,
      message: 'Residents in a crisis who are queued (no psychologist free) will no longer see this number.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => removeContact(contact.contact_id),
    });
  };

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <IconRobot size={22} className="text-brand-primary" /> AI Management
          </h1>
          <p className="text-brand-ink/60 text-sm">Crisis detection keywords and verified emergency contacts.</p>
        </div>
        <AdminTopBar />
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6 mt-6 mb-6">
        <h2 className="font-display text-base font-semibold mb-1">Configure Escalation Rules</h2>
        <p className="text-xs text-brand-ink/50 mb-4">
          If a resident's message or voice journal entry contains any of these phrases, it's treated as a
          crisis: an escalation is attempted immediately, matching them with an available psychologist or
          queuing them. Used by both the AI Crisis Companion and Voice Journal.
        </p>

        {ruleError && <p className="text-sm text-red-600 mb-3">{ruleError}</p>}

        <form onSubmit={addRule} className="flex gap-2 mb-4">
          <input
            value={newPhrase}
            onChange={(e) => setNewPhrase(e.target.value)}
            placeholder="Add a phrase..."
            className="flex-1 border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            onMouseEnter={playHover}
            onClick={playClick}
            className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            <IconPlus size={14} /> Add
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {rules.map((r) => (
            <span key={r.rule_id} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-brand-ink/5 text-brand-ink/70">
              {r.phrase}
              <button onClick={() => { playClick(); removeRule(r.rule_id); }} onMouseEnter={playHover} className="interactive text-brand-ink/40 hover:text-red-600">
                <IconTrash size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <h2 className="font-display text-base font-semibold flex items-center gap-1.5 mb-1">
          <IconPhoneCall size={16} className="text-brand-primary" /> Manage Emergency Contacts
        </h2>
        <p className="text-xs text-brand-ink/50 mb-4">
          Shown to a resident in the AI Crisis Companion when they're queued (no psychologist is
          immediately available). Only add numbers you've personally verified -- a wrong number shown
          to someone in crisis is dangerous, so this list starts empty on purpose rather than with a
          guessed placeholder.
        </p>

        {contactError && <p className="text-sm text-red-600 mb-3">{contactError}</p>}

        <form onSubmit={addContact} className="flex flex-wrap gap-2 mb-4">
          <input
            value={contactForm.name}
            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
            placeholder="Name (e.g. NCMH Crisis Line)"
            className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm flex-1 min-w-40"
          />
          <input
            value={contactForm.phone}
            onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
            placeholder="Phone number"
            className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm w-40"
          />
          <input
            value={contactForm.description}
            onChange={(e) => setContactForm({ ...contactForm, description: e.target.value })}
            placeholder="Note (optional)"
            className="border border-brand-ink/15 rounded-lg px-3 py-2 text-sm flex-1 min-w-32"
          />
          <button
            type="submit"
            onMouseEnter={playHover}
            onClick={playClick}
            className="interactive flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-full text-white"
            style={{ backgroundColor: '#2b4d3f' }}
          >
            <IconPlus size={14} /> Add
          </button>
        </form>

        {contacts.length === 0 ? (
          <p className="text-sm text-brand-ink/50">No emergency contacts configured yet.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.contact_id} className="border border-brand-ink/10 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.name} · {c.phone}</p>
                  {c.description && <p className="text-xs text-brand-ink/50 truncate">{c.description}</p>}
                </div>
                <button
                  onClick={() => { playClick(); confirmRemoveContact(c); }}
                  onMouseEnter={playHover}
                  className="interactive text-xs font-medium px-3 py-1.5 rounded-full border border-red-300 text-red-600 shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </AdminLayout>
  );
}

export default AdminAIManagement;
