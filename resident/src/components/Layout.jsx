import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ReminderBanner from './ReminderBanner';
import { API_URL, authHeader, dashboardPathForRole, getStoredUser } from '../config';

// Mirrors PsychologistLayout/LguLayout/AdminLayout: owns the auth/role guard
// once here. Without this, a logged-in admin/lgu/psychologist landing on
// /dashboard (stale link, typed URL, back button) would silently render the
// resident UI with their own real account data instead of being routed home.
function Layout({ children }) {
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const user = getStoredUser();

  useEffect(() => {
    if (!user) {
      navigate('/', { state: { authMode: 'login' } });
      return;
    }
    if (user.role !== 'resident') {
      navigate(dashboardPathForRole(user.role));
      return;
    }

    fetch(`${API_URL}/auth/me`, { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error('invalid session');
        setChecking(false);
      })
      .catch(() => {
        localStorage.removeItem('openup_token');
        localStorage.removeItem('openup_user');
        navigate('/', { state: { authMode: 'login' } });
      });
  }, []);

  if (checking) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg">
      <ReminderBanner />
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 px-8 py-10 overflow-y-auto">
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden mb-6 text-2xl text-brand-ink/70"
        >
          ☰
        </button>
        {children}
      </main>
    </div>
  );
}

export default Layout;
