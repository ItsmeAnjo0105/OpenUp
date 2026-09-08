import { IconUser, IconStar } from '@tabler/icons-react';

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
      <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
        {psychologist.profile_photo_url ? (
          <img
            src={psychologist.profile_photo_url}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5DCAA5 0%, #2b4d3f 100%)' }}
          >
            <IconUser size={40} color="white" stroke={1.5} />
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <p className="text-sm font-semibold text-brand-ink truncate">{name}</p>
        {psychologist.credentials && (
          <p className="text-xs text-brand-ink/50 truncate mb-2">{psychologist.credentials}</p>
        )}

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
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

        <div className="flex items-center justify-between mb-3 mt-auto">
          {psychologist.rating != null ? (
            <span className="flex items-center gap-1 text-xs font-medium text-brand-ink/70">
              <IconStar size={13} fill="#E8A33D" color="#E8A33D" />
              {Number(psychologist.rating).toFixed(1)}
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-brand-ink">
            ₱{Number(psychologist.session_price).toLocaleString()}/session
          </span>
        </div>

        <button
          onClick={() => onBook(psychologist)}
          className="w-full text-sm font-medium py-2 rounded-full border transition-colors"
          style={{ borderColor: '#2b4d3f', color: '#2b4d3f' }}
        >
          Book an appointment
        </button>
      </div>
    </div>
  );
}

export default PsychologistCard;
