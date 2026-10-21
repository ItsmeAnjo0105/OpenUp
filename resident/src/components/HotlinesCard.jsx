import { IconPhoneCall } from '@tabler/icons-react';

// Every number here is either independently verified (NCMH's 1553 -- confirmed
// active via multiple 2026 sources) or pulled from the real, admin-managed
// Emergency_Contact table (see AdminAIManagement's "Manage Emergency
// Contacts"). Deliberately does NOT include barangay-specific numbers or
// other commonly-cited PH crisis lines (e.g. Hopeline, In Touch) -- their
// current operating status/number couldn't be confirmed, and a wrong number
// shown to someone in crisis is dangerous. No fabricated resource links
// either, for the same reason.
function HotlinesCard({ emergencyContacts = [] }) {
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

      <p className="text-xs text-brand-ink/50 pt-3 border-t border-brand-ink/10">
        If you're in immediate danger, call{' '}
        <a href="tel:911" className="font-semibold text-brand-primary">911</a>.
      </p>
    </div>
  );
}

export default HotlinesCard;
