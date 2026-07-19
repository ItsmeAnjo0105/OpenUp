import { Link, useLocation, useNavigate } from 'react-router-dom';

const modules = [
  { label: 'Dashboard', path: '/dashboard', icon: '🏠', enabled: true },
  { label: 'AI Crisis Companion', path: '/crisis-companion', icon: '❤️', enabled: true },
  { label: 'Anonymous Chat', path: '/anonymous-chat', icon: '💬', enabled: false },
  { label: 'Book Counseling', path: '/booking', icon: '📅', enabled: true },
  { label: 'Group Sessions', path: '/group-counseling', icon: '👥', enabled: false },
  { label: 'Mood Tracker', path: '/mood-tracker', icon: '📈', enabled: true },
  { label: 'Voice Journal', path: '/voice-journal', icon: '🎙️', enabled: true },
  { label: 'Community', path: '/community', icon: '🌱', enabled: false },
  { label: 'Resources', path: '/resources', icon: '📚', enabled: false },
  { label: 'Notifications', path: '/notifications', icon: '🔔', enabled: false },
  { label: 'Profile', path: '/profile', icon: '👤', enabled: false },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  return (
    <aside className="w-64 min-h-screen bg-brand-surface border-r border-brand-ink/10 flex flex-col">
      <div className="px-5 py-6 flex items-center gap-2">
        <span className="text-2xl">💚</span>
        <Link to="/dashboard" className="font-display text-xl font-semibold text-brand-primary">
          OpenUp
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {modules.map((m) => {
          const isActive = location.pathname === m.path;

          if (!m.enabled) {
            return (
              <div
                key={m.path}
                className="flex items-center gap-3 px-3 py-2.5 rounded-full text-brand-ink/35 text-sm cursor-not-allowed"
              >
                <span className="text-lg grayscale opacity-60">{m.icon}</span>
                <span>{m.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={m.path}
              to={m.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-primary text-white'
                  : 'text-brand-ink/70 hover:bg-brand-ink/5'
              }`}
            >
              <span className="text-lg">{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-6 border-t border-brand-ink/10">
        {user && (
          <p className="px-3 text-xs text-brand-ink/50 mb-2 truncate">{user.email}</p>
        )}
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-full text-sm font-medium text-brand-ink/70 hover:bg-brand-ink/5"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
