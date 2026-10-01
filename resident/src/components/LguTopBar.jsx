import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconBell, IconChevronDown, IconLogout } from '@tabler/icons-react';
import { API_URL, authHeader, getStoredUser } from '../config';
import { playHover, playClick } from '../utils/sound';

// Mirrors PsychologistTopBar's bell + account dropdown. No Profile link --
// there's no LGU-facing profile page yet.
function LguTopBar() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const user = getStoredUser();
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/notifications`, { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setUnreadCount(data.filter((n) => !n.read).length); })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  return (
    <div className="flex items-center gap-3 shrink-0">
      <Link
        to="/notifications"
        onMouseEnter={playHover}
        onClick={playClick}
        className="interactive relative w-9 h-9 rounded-full bg-brand-surface shadow-sm flex items-center justify-center text-brand-ink/60 hover:text-brand-ink"
      >
        <IconBell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        )}
      </Link>

      <div className="relative">
        <button
          onClick={() => { playClick(); setAccountMenuOpen((v) => !v); }}
          onMouseEnter={playHover}
          className="interactive flex items-center gap-1.5 bg-brand-surface shadow-sm rounded-full pl-1.5 pr-2.5 py-1.5"
        >
          <span className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px] font-semibold">
            {(user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span className="text-xs font-medium text-brand-ink/80 hidden sm:inline">{user?.name}</span>
          <IconChevronDown size={13} className="text-brand-ink/40" />
        </button>
        {accountMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} />
            <div className="absolute right-0 mt-1 w-40 bg-brand-surface rounded-xl shadow-md py-1 z-20" style={{ border: '1px solid rgba(28,36,32,0.08)' }}>
              <button
                onClick={() => { playClick(); handleLogout(); }}
                onMouseEnter={playHover}
                className="interactive-nav w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <IconLogout size={15} /> Log out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LguTopBar;
