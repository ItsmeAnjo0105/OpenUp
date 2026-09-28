import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const items = [
  { label: 'Dashboard', path: '/psychologist/dashboard', icon: '🏠', color: 'bg-emerald-400/20' },
  { label: 'Appointment Requests', path: '/psychologist/requests', icon: '📥', color: 'bg-sky-400/20' },
  { label: 'My Clients', path: '/psychologist/clients', icon: '👥', color: 'bg-indigo-400/20' },
  { label: 'Anonymous Chats', path: '/psychologist/chats', icon: '💬', color: 'bg-violet-400/20' },
  { label: 'Group Sessions', path: '/psychologist/group-sessions', icon: '🧑‍🤝‍🧑', color: 'bg-teal-400/20' },
  { label: 'Notes', path: '/psychologist/notes', icon: '📝', color: 'bg-amber-400/20' },
  { label: 'Schedule', path: '/psychologist/schedule', icon: '📅', color: 'bg-cyan-400/20' },
  { label: 'Reports', path: '/psychologist/reports', icon: '📊', color: 'bg-lime-400/20' },
  { label: 'Profile', path: '/psychologist/profile', icon: '👤', color: 'bg-fuchsia-400/20' },
];

function PsychologistSidebar({ user, sidebarOpen, setSidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('openup_sidebar_collapsed') === 'true');

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('openup_sidebar_collapsed', String(!prev));
      return !prev;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  const initials = (user.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      className={`${collapsed ? 'w-20' : 'w-64'} min-h-screen overflow-hidden flex flex-col text-white
        fixed left-0 top-0 h-full z-50 transition-[transform,width] duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:relative`}
      style={{ background: 'linear-gradient(160deg, #1F4438 0%, #16362C 55%, #102821 100%)' }}
    >
      <div
        className="absolute -top-16 -right-20 w-56 h-56 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(94,214,163,0.18) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 -left-16 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(94,214,163,0.10) 0%, transparent 70%)' }}
      />

      <div className={`relative px-5 py-5 flex items-start justify-between shrink-0 ${collapsed ? 'px-3' : ''}`}>
        <Link to="/psychologist/dashboard" className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
            style={{ background: 'linear-gradient(135deg, #5ED6A3, #2F5D50)' }}
          >
            💚
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-tight truncate">OpenUp</p>
              <p className="text-[10px] text-white/50 leading-tight truncate">For Psychologists</p>
            </div>
          )}
        </Link>
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex text-white/40 hover:text-white/80 text-sm mt-1 shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden text-xl text-white/50 shrink-0">
          ✕
        </button>
      </div>

      {!collapsed && (
        <p className="relative px-5 text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2 mt-1">Main</p>
      )}

      <nav className="relative flex-1 px-3 space-y-0.5 min-h-0 overflow-y-auto">
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-medium transition-colors relative ${
                collapsed ? 'justify-center' : ''
              } ${isActive ? 'text-white shadow-sm' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              style={isActive ? { background: 'linear-gradient(90deg, #3FAE7F, #2F5D50)' } : undefined}
            >
              {isActive && !collapsed && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-emerald-300" />
              )}
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 ${item.color}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="flex-1 leading-tight truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="relative px-3 py-4 mt-1 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {collapsed ? (
          <div className="flex justify-center mb-2">
            <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold">
              {initials}
            </span>
          </div>
        ) : (
          <>
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-2">Account</p>
            <div className="flex items-center gap-2.5 px-1 mb-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold shrink-0">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-[11px] text-white/50 truncate">Psychologist</p>
              </div>
            </div>
          </>
        )}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Log out' : undefined}
        >
          <span>⏻</span>
          {!collapsed && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}

export default PsychologistSidebar;
