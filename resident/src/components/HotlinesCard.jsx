import { IconPhoneCall } from '@tabler/icons-react';

// Every number here is either independently verified (checked via live web
// search before use -- see chat) or pulled from the real, admin-managed
// Emergency_Contact table (AdminAIManagement's "Manage Emergency Contacts").
// Several numbers that are commonly cited for Cebu/Visayas crisis support
// (a CDRRMO line, a Vicente Sotto Memorial Medical Center mental health
// line, "Tawag sa Gugma", Hopeline, In-Touch) could NOT be confirmed as
// currently correct -- one turned out to be the wrong name entirely (the
// real Visayas line is "Tawag Paglaum-Centro Bisaya", with different
// numbers) -- so they're left out rather than guessed. A wrong number shown
// to someone in crisis is dangerous.
function HotlinesCard({ barangayName, emergencyContacts = [] }) {
  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5 space-y-5 lg:sticky lg:top-6">
      <div className="flex items-center gap-2">
        <IconPhoneCall size={18} className="text-brand-primary shrink-0" />
        <div>
          <p className="font-display text-base font-semibold leading-tight">Local &amp; Crisis Hotlines</p>
          <p className="text-xs text-brand-ink/50">Help is always within reach.</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/40 mb-2">
          Your Barangay{barangayName ? ` (${barangayName})` : ''}
        </p>
        <div className="space-y-2">
          {['Barangay Health Center', 'Local Emergency Team', 'Barangay Hall'].map((label) => (
            <div key={label} className="bg-brand-bg rounded-xl p-3 flex items-center justify-between gap-2">
              <p className="text-sm">{label}</p>
              <p className="text-xs text-brand-ink/40 italic">Not yet added</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/40 mb-2">
          Emergency &amp; Regional
        </p>
        <div className="space-y-2">
          <div className="bg-brand-bg rounded-xl p-3.5">
            <p className="text-sm font-semibold">Emergency (Police, Fire, Medical)</p>
            <a href="tel:911" className="text-sm font-medium text-brand-primary">911</a>
          </div>
          <div className="bg-brand-bg rounded-xl p-3.5">
            <p className="text-sm font-semibold">Tawag Paglaum–Centro Bisaya</p>
            <p className="text-xs text-brand-ink/50 mb-1">Visayas-based crisis hotline</p>
            <a href="tel:09399375433" className="text-sm font-medium text-brand-primary block">0939-937-5433</a>
            <a href="tel:09276541629" className="text-sm font-medium text-brand-primary block">0927-654-1629</a>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/40 mb-2">
          National Crisis Hotline
        </p>
        <div className="bg-brand-bg rounded-xl p-3.5">
          <p className="text-sm font-semibold">National Center for Mental Health</p>
          <a href="tel:1553" className="text-sm font-medium text-brand-primary mt-1 block">
            1553 <span className="text-brand-ink/40 font-normal text-xs">(toll-free, 24/7)</span>
          </a>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/40 mb-2">
          Verified Contacts
        </p>
        {emergencyContacts.length === 0 ? (
          <p className="text-xs text-brand-ink/50">
            No additional contacts verified yet. Your barangay can have one added through OpenUp's admin.
          </p>
        ) : (
          <div className="space-y-2">
            {emergencyContacts.map((c) => (
              <div key={c.contact_id} className="bg-brand-bg rounded-xl p-3.5">
                <p className="text-sm font-semibold">{c.name}</p>
                <a href={`tel:${c.phone}`} className="text-sm font-medium text-brand-primary">{c.phone}</a>
                {c.description && <p className="text-xs text-brand-ink/50 mt-0.5">{c.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-ink/40 mb-2">
          Other Resources
        </p>
        <a
          href="https://ncmh.gov.ph"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-primary font-medium block"
        >
          Official NCMH website
        </a>
      </div>

      <p className="text-xs text-brand-ink/50 pt-3 border-t border-brand-ink/10">
        If you're in immediate danger, call{' '}
        <a href="tel:911" className="font-semibold text-brand-primary">911</a>.
      </p>
    </div>
  );
}

export default HotlinesCard;
