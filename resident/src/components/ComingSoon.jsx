function ComingSoon({ title, subtitle }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">{title}</h1>
      <p className="text-brand-ink/60 text-sm mb-8">{subtitle || 'This section is coming soon.'}</p>
      <div className="bg-brand-surface rounded-2xl shadow-sm p-6">
        <p className="text-sm text-brand-ink/50">Nothing to show here yet.</p>
      </div>
    </div>
  );
}

export default ComingSoon;
