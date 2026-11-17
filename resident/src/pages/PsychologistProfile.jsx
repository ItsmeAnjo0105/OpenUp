import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconCamera, IconPencil, IconUser, IconBriefcase, IconCash, IconCircleCheck, IconAlertTriangle, IconSend, IconLock,
} from '@tabler/icons-react';
import PsychologistLayout from '../components/PsychologistLayout';
import CredentialsSection from '../components/verification/CredentialsSection';
import { API_URL, authHeader } from '../config';
import { displayStatus, CONSULTATION_TYPE_LABEL, SESSION_DURATIONS } from '../utils/verificationStatus';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function initials(name) {
  return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const joinList = (a) => (a || []).join(', ');

function formFromProfile(p) {
  return {
    name: p.name || '',
    professional_title: p.professional_title || '',
    contact_number: p.contact_number || '',
    bio: p.bio || '',
    specialties: joinList(p.specialties),
    expertise: joinList(p.expertise),
    years_experience: p.years_experience ?? '',
    languages: joinList(p.languages),
    education: p.education || '',
    consultation_types: p.consultation_types || [],
    session_duration_minutes: p.session_duration_minutes ?? '',
    session_price: p.session_price ?? '',
    services: joinList(p.services),
    availability: p.availability || '',
  };
}

async function readJson(res) {
  try { return await res.json(); } catch { return { error: 'Unexpected server response. Is the backend up to date?' }; }
}

// Psychologist > Profile. Sections 1-3 are ordinary profile details (Edit
// Profile -> Save Profile Changes, never affects verification). Sections 4-5
// (CredentialsSection) hold the regulated credentials, documents and the
// "Submit Documents for Verification" flow.
function PsychologistProfile() {
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }
  const [photoUploading, setPhotoUploading] = useState(false);
  const [verification, setVerification] = useState(null); // { status, isVerified }
  const fileInputRef = useRef(null);

  const load = useCallback(() => {
    fetch(`${API_URL}/psychologists/me`, { headers: authHeader() })
      .then(async (res) => ({ ok: res.ok, data: await readJson(res) }))
      .then(({ ok, data }) => {
        if (!ok) { setLoadError(data?.error || 'Could not load your profile.'); return; }
        setProfile(data);
      })
      .catch(() => setLoadError('Could not load your profile.'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!message || message.tone === 'error') return undefined;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  const onVerificationStatus = useCallback((status, isVerified) => setVerification({ status, isVerified }), []);

  const startEdit = () => {
    setForm(formFromProfile(profile));
    setEditing(true);
    setMessage(null);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setMessage({ tone: 'error', text: 'Full name is required.' }); return; }
    if (!form.session_price || Number(form.session_price) <= 0) {
      setMessage({ tone: 'error', text: 'Enter your standard consultation rate.' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        professional_title: form.professional_title,
        contact_number: form.contact_number,
        bio: form.bio,
        specialties: splitList(form.specialties),
        expertise: splitList(form.expertise),
        years_experience: form.years_experience,
        languages: splitList(form.languages),
        education: form.education,
        consultation_types: form.consultation_types,
        session_duration_minutes: form.session_duration_minutes,
        session_price: form.session_price,
        services: splitList(form.services),
        availability: form.availability,
      };
      if (!profile.is_verified) body.name = form.name.trim();
      const res = await fetch(`${API_URL}/psychologists/me`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not save changes.' }); return; }

      if (data.name && data.name !== profile.name) {
        try {
          const stored = JSON.parse(localStorage.getItem('openup_user')) || {};
          localStorage.setItem('openup_user', JSON.stringify({ ...stored, name: data.name }));
        } catch { /* storage unavailable -- the server copy is what matters */ }
      }
      setProfile((p) => ({ ...p, ...data, name: data.name || p.name, email: p.email }));
      setEditing(false);
      setMessage({ tone: 'success', text: 'Profile changes saved.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage({ tone: 'error', text: 'Please choose an image file.' }); return; }
    if (file.size > MAX_PHOTO_BYTES) { setMessage({ tone: 'error', text: 'Image must be 5MB or smaller.' }); return; }

    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${API_URL}/psychologists/me/photo`, { method: 'POST', headers: authHeader(), body: formData });
      const data = await readJson(res);
      if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not upload photo.' }); return; }
      setProfile((p) => ({ ...p, profile_photo_url: data.profile_photo_url }));
      setMessage({ tone: 'success', text: 'Profile picture updated.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoUploading(true);
    try {
      const res = await fetch(`${API_URL}/psychologists/me/photo`, { method: 'DELETE', headers: authHeader() });
      const data = await readJson(res);
      if (!res.ok) { setMessage({ tone: 'error', text: data.error || 'Could not remove photo.' }); return; }
      setProfile((p) => ({ ...p, profile_photo_url: null }));
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach the server.' });
    } finally {
      setPhotoUploading(false);
    }
  };

  const status = verification?.status || profile?.verification_status || (profile?.is_verified ? 'approved' : 'not_submitted');
  const statusMeta = displayStatus(status, verification ? verification.isVerified : profile?.is_verified);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleType = (t) => setForm({
    ...form,
    consultation_types: form.consultation_types.includes(t)
      ? form.consultation_types.filter((x) => x !== t)
      : [...form.consultation_types, t],
  });

  return (
    <PsychologistLayout>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="font-display text-2xl font-semibold">Profile</h1>
          <p className="text-brand-ink/60 text-sm">Your professional profile, credentials and verification.</p>
        </div>
        {profile && (
          <div className="flex flex-wrap gap-2">
            {!editing && (
              <button onClick={startEdit} className="interactive inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-brand-primary text-white">
                <IconPencil size={15} /> Edit Profile
              </button>
            )}
            <a href="#verification-status" className="interactive inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full border border-brand-primary/40 text-brand-primary bg-brand-surface">
              <IconSend size={15} /> Submit Documents
            </a>
          </div>
        )}
      </div>

      {loadError && <p className="text-sm text-red-600 mt-4">{loadError}</p>}

      {message && (
        <p role="status" className={`mt-4 text-sm rounded-xl px-3 py-2 flex items-start gap-2 max-w-3xl ${
          message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-brand-primary/10 text-brand-primary'
        }`}>
          {message.tone === 'error' ? <IconAlertTriangle size={16} className="mt-0.5 shrink-0" /> : <IconCircleCheck size={16} className="mt-0.5 shrink-0" />}
          {message.text}
        </p>
      )}

      {profile && (
        <div className="max-w-3xl mt-6 space-y-6">
          <form onSubmit={save} className="space-y-6">
            {/* 1. Profile information */}
            <section className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <SectionTitle icon={IconUser} title="Profile Information" />
              <div className="flex items-center gap-4 mb-5">
                <div className="relative w-16 h-16 shrink-0">
                  {profile.profile_photo_url ? (
                    <img src={profile.profile_photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-brand-primary text-white flex items-center justify-center text-lg font-semibold">
                      {initials(profile.name)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    title="Upload photo"
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center shadow-sm disabled:opacity-60"
                  >
                    <IconCamera size={14} />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold truncate">{profile.name}</p>
                  <p className="text-sm text-brand-ink/60">{profile.professional_title || profile.credentials}</p>
                  <span className={`inline-flex items-center gap-1.5 mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${statusMeta.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}
                  </span>
                  <div className="flex gap-3 mt-1">
                    {photoUploading && <span className="text-xs text-brand-ink/50">Uploading…</span>}
                    {profile.profile_photo_url && !photoUploading && (
                      <button type="button" onClick={handleRemovePhoto} className="text-xs text-brand-ink/50 hover:text-red-600">Remove photo</button>
                    )}
                  </div>
                </div>
              </div>

              {editing ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Full name" value={form.name} onChange={set('name')} disabled={profile.is_verified} maxLength={100}
                    hint={profile.is_verified ? 'Locked: your name is tied to your verified PRC license. Contact an admin to change it.' : null} />
                  <Input label="Professional title" value={form.professional_title} onChange={set('professional_title')} maxLength={100} placeholder="e.g. Licensed Clinical Psychologist" />
                  <Input label="Email (login)" value={profile.email || ''} disabled hint="Your login email can only be changed by an admin." />
                  <Input label="Contact number (private, admin only)" value={form.contact_number} onChange={set('contact_number')} maxLength={30} placeholder="e.g. 0917 123 4567" />
                  <TextArea label="Professional biography (shown on your public card)" value={form.bio} onChange={set('bio')} maxLength={600} className="sm:col-span-2" />
                </div>
              ) : (
                <dl className="grid sm:grid-cols-2 gap-4">
                  <View label="Email (login)" value={profile.email} />
                  <View label="Contact number" value={profile.contact_number} />
                  <View label="Professional biography" value={profile.bio} className="sm:col-span-2" />
                </dl>
              )}
            </section>

            {/* 2. Professional information */}
            <section className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <SectionTitle icon={IconBriefcase} title="Professional Information" />
              {editing ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input label="Specialization (comma-separated)" value={form.specialties} onChange={set('specialties')} placeholder="e.g. Anxiety, Depression" />
                  <Input label="Areas of expertise (comma-separated)" value={form.expertise} onChange={set('expertise')} placeholder="e.g. CBT, Trauma-informed care" />
                  <Input label="Years of professional experience" type="number" min="0" max="70" value={form.years_experience} onChange={set('years_experience')} />
                  <Input label="Languages spoken (comma-separated)" value={form.languages} onChange={set('languages')} placeholder="e.g. English, Filipino, Cebuano" />
                  <TextArea label="Educational background" value={form.education} onChange={set('education')} maxLength={1000} className="sm:col-span-2"
                    placeholder="e.g. MA Clinical Psychology, University of ..., 2018" />
                </div>
              ) : (
                <dl className="grid sm:grid-cols-2 gap-4">
                  <View label="Specialization" value={joinList(profile.specialties)} />
                  <View label="Areas of expertise" value={joinList(profile.expertise)} />
                  <View label="Years of experience" value={profile.years_experience ?? null} />
                  <View label="Languages" value={joinList(profile.languages)} />
                  <View label="Educational background" value={profile.education} className="sm:col-span-2" />
                </dl>
              )}
            </section>

            {/* 3. Services & consultation rates */}
            <section className="bg-brand-surface rounded-2xl shadow-sm p-6">
              <SectionTitle icon={IconCash} title="Services & Consultation Rates" />
              {editing ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <fieldset className="sm:col-span-2">
                    <legend className="text-xs text-brand-ink/60 mb-1.5">Consultation types offered</legend>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(CONSULTATION_TYPE_LABEL).map(([key, label]) => {
                        const on = form.consultation_types.includes(key);
                        return (
                          <button key={key} type="button" onClick={() => toggleType(key)} aria-pressed={on}
                            className={`text-sm px-4 py-1.5 rounded-full border ${on ? 'bg-brand-primary text-white border-brand-primary' : 'border-brand-ink/20 text-brand-ink/70'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="text-xs text-brand-ink/60">
                    Session duration
                    <select value={form.session_duration_minutes} onChange={set('session_duration_minutes')}
                      className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink bg-brand-surface">
                      <option value="">Not specified</option>
                      {SESSION_DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
                    </select>
                  </label>
                  <Input label="Standard consultation rate (₱)" type="number" min="1" value={form.session_price} onChange={set('session_price')} required />
                  <Input label="Available services (comma-separated)" value={form.services} onChange={set('services')} className="sm:col-span-2"
                    placeholder="e.g. Individual counseling, Couples therapy, Psychological assessment" />
                  <Input label="Availability note" value={form.availability} onChange={set('availability')} maxLength={120} className="sm:col-span-2"
                    placeholder="e.g. Mon-Fri, 9 AM-6 PM" hint="Bookable time slots are set in Schedule > Manage Availability." />
                </div>
              ) : (
                <dl className="grid sm:grid-cols-2 gap-4">
                  <View label="Consultation types" value={(profile.consultation_types || []).map((t) => CONSULTATION_TYPE_LABEL[t]).join(', ')} />
                  <View label="Session duration" value={profile.session_duration_minutes ? `${profile.session_duration_minutes} minutes` : null} />
                  <View label="Standard consultation rate" value={profile.session_price ? `₱${Number(profile.session_price).toLocaleString()}` : null} />
                  <View label="Availability note" value={profile.availability} />
                  <View label="Available services" value={joinList(profile.services)} className="sm:col-span-2" />
                </dl>
              )}
            </section>

            {editing && (
              <div className="sticky bottom-4 z-10 bg-brand-surface/95 backdrop-blur rounded-2xl shadow-md p-4 flex flex-wrap items-center gap-2">
                <p className="text-xs text-brand-ink/55 mr-auto flex items-center gap-1.5">
                  <IconLock size={13} /> These details don't affect your verification status.
                </p>
                <button type="button" onClick={() => setEditing(false)} disabled={saving}
                  className="interactive text-sm font-medium px-4 py-2 rounded-full border border-brand-ink/20">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="interactive text-sm font-medium px-5 py-2 rounded-full bg-brand-primary text-white disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            )}
          </form>

          {/* 4 + 5. Credentials and verification status */}
          <CredentialsSection onStatus={onVerificationStatus} />
        </div>
      )}
    </PsychologistLayout>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <h2 className="font-display text-lg font-semibold flex items-center gap-2 mb-4">
      <Icon size={19} className="text-brand-primary" /> {title}
    </h2>
  );
}

function View({ label, value, className = '' }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={className}>
      <dt className="text-xs text-brand-ink/50 mb-1">{label}</dt>
      <dd className={`text-sm whitespace-pre-wrap wrap-break-word ${empty ? 'text-brand-ink/35' : ''}`}>{empty ? '—' : value}</dd>
    </div>
  );
}

function Input({ label, hint, className = '', ...props }) {
  return (
    <label className={`text-xs text-brand-ink/60 ${className}`}>
      {label}
      <input {...props} className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink disabled:bg-brand-ink/5 disabled:text-brand-ink/50" />
      {hint && <span className="block text-[11px] text-brand-ink/45 mt-1">{hint}</span>}
    </label>
  );
}

function TextArea({ label, className = '', ...props }) {
  return (
    <label className={`text-xs text-brand-ink/60 ${className}`}>
      {label}
      <textarea rows={3} {...props} className="mt-1 w-full border border-brand-ink/15 rounded-lg px-3 py-2 text-sm text-brand-ink resize-none" />
    </label>
  );
}

export default PsychologistProfile;
