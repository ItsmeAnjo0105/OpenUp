import { Link, useLocation, useNavigate } from 'react-router-dom';

const items = [
  { label: 'Dashboard', path: '/psychologist/dashboard', icon: '🏠' },
  { label: 'Appointment Requests', path: '/psychologist/requests', icon: '📥' },
  { label: 'My Clients', path: '/psychologist/clients', icon: '👥' },
  { label: 'Anonymous Chats', path: '/psychologist/chats', icon: '💬' },
  { label: 'Group Sessions', path: '/psychologist/group-sessions', icon: '🧑‍🤝‍🧑' },
  { label: 'Notes', path: '/psychologist/notes', icon: '📝' },
  { label: 'Schedule', path: '/psychologist/schedule', icon: '📅' },
  { label: 'Reports', path: '/psychologist/reports', icon: '📊' },
  { label: 'Profile', path: '/psychologist/profile', icon: '👤' },
];

function PsychologistSidebar({ user, sidebarOpen, setSidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  return (
    <aside
      className={`w-64 min-h-screen bg-brand-surface border-r border-brand-ink/10 flex flex-col
        fixed left-0 top-0 h-full z-50 transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static`}
    >
      <div className="px-5 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💚</span>
          <Link to="/psychologist/dashboard" className="font-display text-xl font-semibold text-brand-primary">
            OpenUp
          </Link>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden text-xl text-brand-ink/50">
          ✕
        </button>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-primary text-white' : 'text-brand-ink/70 hover:bg-brand-ink/5'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-brand-ink/10 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-full bg-brand-primary text-white flex items-center justify-center text-sm font-semibold">
            {user.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-brand-ink/50">Psychologist</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-xs text-brand-ink/50 hover:text-brand-ink shrink-0">
          Log out
        </button>
      </div>
    </aside>
  );
}

export default PsychologistSidebar;
