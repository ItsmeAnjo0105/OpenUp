import { useEffect, useState } from 'react';
import PsychologistLayout from '../components/PsychologistLayout';
import { API_URL, authHeader, getStoredUser } from '../config';

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function PsychologistProfile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const user = getStoredUser();

  const load = () => {
    fetch(`${API_URL}/psychologists/me`, { headers: authHeader() })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data?.error || 'Could not load your profile.');
          return;
        }
        setProfile(data);
        setForm({
          specialties: (data.specialties || []).join(', '),
          years_experience: data.years_experience ?? '',
          languages: (data.languages || []).join(', '),
          availability: data.availability || '',
          session_price: data.session_price ?? '',
        });
      })
      .catch(() => setError('Could not load your profile.'));
  };

  useEffect(load, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/psychologists/me`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean),
          years_experience: form.years_experience,
          languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
          availability: form.availability,
          session_price: form.session_price,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save changes.');
        setSaving(false);
        return;
      }
      setProfile(data);
      setEditing(false);
      setSaving(false);
    } catch {
      setError('Could not reach the server.');
      setSaving(false);
    }
  };

  return (
    <PsychologistLayout>
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-display text-2xl font-semibold">Profile</h1>
        {profile && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-brand-ink/20"
          >
            Edit profile
          </button>
        )}
      </div>
      <p className="text-brand-ink/60 text-sm mb-8">Your professional profile and verification.</p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {profile && (
        <div className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-2xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 shrink-0 rounded-full bg-brand-primary text-white flex items-center justify-center text-lg font-semibold">
              {initials(user?.name)}
            </div>
            <div>
              <p className="font-display text-lg font-semibold">{user?.name}</p>
              <p className="text-sm text-brand-ink/60">{profile.credentials}</p>
              {profile.is_verified ? (
                <span className="inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                  ✓ Verified License
                </span>
              ) : (
                <span className="inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                  Pending verification
                </span>
              )}
            </div>
          </div>

          {editing ? (
            <form onSubmit={save} className="grid grid-cols-2 gap-4">
              <Field label="Specialization (comma-separated)">
                <input
                  value={form.specialties}
                  onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Years of experience">
                <input
                  type="number" min="0"
                  value={form.years_experience}
                  onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Languages (comma-separated)">
                <input
                  value={form.languages}
                  onChange={(e) => setForm({ ...form, languages: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Availability">
                <input
                  value={form.availability}
                  onChange={(e) => setForm({ ...form, availability: e.target.value })}
                  placeholder="e.g. Mon-Fri, 9 AM-6 PM"
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Session price (₱)">
                <input
                  type="number" min="1"
                  value={form.session_price}
                  onChange={(e) => setForm({ ...form, session_price: e.target.value })}
                  className="w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm"
                />
              </Field>

              <div className="col-span-2 flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Specialization">
                <p className="text-sm">{profile.specialties?.length ? profile.specialties.join(', ') : '—'}</p>
              </Field>
              <Field label="Years of experience">
                <p className="text-sm">{profile.years_experience ?? '—'}</p>
              </Field>
              <Field label="Languages">
                <p className="text-sm">{profile.languages?.length ? profile.languages.join(', ') : '—'}</p>
              </Field>
              <Field label="Availability">
                <p className="text-sm">{profile.availability || '—'}</p>
              </Field>
              <Field label="Session price">
                <p className="text-sm">₱{Number(profile.session_price).toLocaleString()}</p>
              </Field>
              <Field label="License no.">
                <p className="text-sm">{profile.license_no || '—'}</p>
              </Field>
            </div>
          )}

          {!profile.is_verified && (
            <p className="text-sm text-brand-ink/50 mt-4">
              An admin needs to verify your license before you appear to residents and can accept bookings.
            </p>
          )}
        </div>
      )}
    </PsychologistLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs text-brand-ink/50 mb-1">{label}</p>
      {children}
    </div>
  );
}

export default PsychologistProfile;
