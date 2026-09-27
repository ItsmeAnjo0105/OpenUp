import { EMOTIONS } from '../utils/emotions';

// A wrapped grid of emotion pills. `variant` controls color: "dark" for use on
// a brand-primary card background, "light" for use on a plain surface.
function EmotionPicker({ selectedLabel, onPick, disabled, variant = 'dark' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EMOTIONS.map((e) => {
        const isSelected = selectedLabel === e.label;
        const base = 'flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-60';
        const dark = isSelected
          ? 'bg-white text-brand-primary'
          : 'bg-white/15 text-white hover:bg-white/25';
        const light = isSelected
          ? 'bg-brand-primary text-white'
          : 'bg-brand-bg text-brand-ink/70 hover:bg-brand-ink/10';

        return (
          <button
            key={e.label}
            type="button"
            disabled={disabled}
            onClick={() => onPick(e)}
            className={`${base} ${variant === 'dark' ? dark : light}`}
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-base ${
                variant === 'dark'
                  ? isSelected ? 'bg-brand-primary/10' : 'bg-white/10'
                  : isSelected ? 'bg-white/20' : 'bg-white'
              }`}
            >
              {e.emoji}
            </span>
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

export default EmotionPicker;
