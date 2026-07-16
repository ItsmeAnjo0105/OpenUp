import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-8 py-6">
        <span className="font-display text-2xl font-semibold text-brand-primary">OpenUp</span>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium hover:text-brand-primary">Log in</Link>
          <Link
            to="/signup"
            className="text-sm font-medium bg-brand-primary text-white px-5 py-2.5 rounded-full hover:bg-brand-primary-dark transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-8 pt-16 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-brand-accent font-medium mb-4">Maayong adlaw.</p>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold leading-tight">
            A quiet place to open up.
          </h1>
          <p className="mt-6 text-lg text-brand-ink/70 max-w-lg">
            Talk to someone, track how you're doing, and reach a licensed counselor —
            all in one place, built for Cebu City communities.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              to="/signup"
              className="bg-brand-primary text-white px-6 py-3 rounded-full font-medium hover:bg-brand-primary-dark transition-colors"
            >
              Get started
            </Link>
            <Link
              to="/login"
              className="border border-brand-primary text-brand-primary px-6 py-3 rounded-full font-medium hover:bg-brand-primary/5 transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="relative h-105 hidden lg:block">
          <svg viewBox="0 0 500 420" className="w-full h-full" fill="none">
            <defs>
              <linearGradient id="sunrise" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#E8A33D" />
                <stop offset="100%" stopColor="#2F5D50" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="sunriseLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#2F5D50" stopOpacity="0" />
                <stop offset="50%" stopColor="#2F5D50" />
                <stop offset="100%" stopColor="#2F5D50" stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle cx="250" cy="420" r="220" fill="url(#sunrise)" />
            <circle cx="250" cy="260" r="70" fill="#E8A33D" opacity="0.85" />
            <line x1="20" y1="420" x2="480" y2="420" stroke="url(#sunriseLine)" strokeWidth="2" />
          </svg>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-8 pb-24 grid sm:grid-cols-3 gap-10">
        <div>
          <h3 className="font-display text-xl font-semibold mb-2">Talk when you need to</h3>
          <p className="text-brand-ink/70 text-sm">
            Reach out anonymously or book a session with a licensed psychologist, whenever it works for you.
          </p>
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold mb-2">Track your days</h3>
          <p className="text-brand-ink/70 text-sm">
            Log your mood and voice journal entries to notice patterns in how you're feeling over time.
          </p>
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold mb-2">Backed by your barangay</h3>
          <p className="text-brand-ink/70 text-sm">
            Participating LGUs help fund sessions through OpenUp Care Credits, so cost isn't a barrier.
          </p>
        </div>
      </section>

      <footer className="max-w-7xl mx-auto px-8 py-8 border-t border-brand-ink/10 text-sm text-brand-ink/50">
        OpenUp — a pilot mental wellness platform for Cebu City barangays.
      </footer>
    </div>
  );
}

export default Landing;
