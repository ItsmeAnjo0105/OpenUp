function StatCard({ icon, label, value, iconBg }) {
  return (
    <div className="bg-brand-surface rounded-2xl shadow-sm p-5 flex items-center gap-3.5">
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg || 'bg-brand-primary/10 text-brand-primary'}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-display font-semibold leading-tight">{value}</p>
        <p className="text-xs text-brand-ink/50 truncate">{label}</p>
      </div>
    </div>
  );
}

export default StatCard;
