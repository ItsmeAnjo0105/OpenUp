import { IconUser, IconStar, IconCircleCheck, IconMapPin, IconHeadphones, IconClock, IconCalendarEvent, IconArrowRight } from '@tabler/icons-react';

const MAX_VISIBLE_TAGS = 3;

function PsychologistCard({ psychologist, onBook }) {
  const name = psychologist.User?.name || `Psychologist #${psychologist.psychologist_id}`;
  const specialties = psychologist.specialties || [];
  const visibleTags = specialties.slice(0, MAX_VISIBLE_TAGS);
  const extraCount = specialties.length - visibleTags.length;

  return (
    <div
      className="bg-brand-surface rounded-2xl overflow-hidden flex flex-col"
      style={{ border: '1.5px solid rgba(28,36,32,0.12)' }}
    >
      <div className="p-4 pb-0 flex items-start justify-between">
        {psychologist.is_verified && (
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            <IconCircleCheck size={12} stroke={2} /> Verified
          </span>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <div className="w-20 h-20 rounded-full overflow-hidden shrink-0">
          {psychologist.profile_photo_url ? (
            <img src={psychologist.profile_photo_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #5DCAA5 0%, #2b4d3f 100%)' }}
            >
              <IconUser size={32} color="white" stroke={1.5} />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 pt-3 flex flex-col flex-1 text-center">
        <p className="text-sm font-semibold text-brand-ink truncate">{name}</p>
        {psychologist.credentials && (
          <p className="text-xs text-brand-ink/50 truncate">{psychologist.credentials}</p>
        )}

        {psychologist.rating != null && (
          <span className="flex items-center justify-center gap-1 text-xs font-medium text-brand-ink/70 mt-1">
            <IconStar size={13} fill="#E8A33D" color="#E8A33D" />
            {Number(psychologist.rating).toFixed(1)}
          </span>
        )}

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 mt-2">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(93,202,165,0.18)', color: '#2b4d3f' }}
              >
                {tag}
              </span>
            ))}
            {extraCount > 0 && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-brand-ink/50 bg-brand-ink/5">
                +{extraCount} more
              </span>
            )}
          </div>
        )}

        <div className="text-left mt-3 space-y-1.5">
          {psychologist.years_experience != null && (
            <p className="flex items-center gap-1.5 text-xs text-brand-ink/60">
              <IconUser size={13} className="shrink-0" /> {psychologist.years_experience}+ years experience
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-brand-ink/60">
            <IconMapPin size={13} className="shrink-0" /> Cebu City
          </p>
          <p className="flex items-center gap-1.5 text-xs text-brand-ink/60">
            <IconHeadphones size={13} className="shrink-0" /> Online audio session
          </p>
        </div>

        {/* Pins the price/duration footer, bio, and button to the bottom of the
            card regardless of how much variable content (tags, years, bio) sits
            above -- otherwise cards in the same row misalign when one has less. */}
        <div className="flex-1" />

        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(28,36,32,0.08)' }}>
          <span className="flex items-center gap-1 text-xs text-brand-ink/50">
            <IconClock size={13} /> 1 hour/session
          </span>
          <span className="text-sm font-semibold text-brand-ink">
            ₱{Number(psychologist.session_price).toLocaleString()}
          </span>
        </div>

        {psychologist.bio && (
          <p className="text-xs text-brand-ink/60 mt-3 text-left line-clamp-3">{psychologist.bio}</p>
        )}

        <button
          onClick={() => onBook(psychologist)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 rounded-full text-white mt-4 transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#2b4d3f' }}
        >
          <IconCalendarEvent size={15} /> Book an appointment <IconArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default PsychologistCard;
