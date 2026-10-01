import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, authHeader, getStoredUser } from '../config';
import LguSidebar from './LguSidebar';

// Mirrors PsychologistLayout: owns the auth/role guard once here instead of
// every LGU page repeating the same "am I actually logged in as this
// barangay" check.
function LguLayout({ children }) {
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const user = getStoredUser();

  useEffect(() => {
    if (!user || user.role !== 'lgu') {
      navigate('/login');
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
        navigate('/login');
      });
  }, []);

  if (checking) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg">
      <LguSidebar user={user} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 px-8 py-8 overflow-y-auto">
        <button onClick={() => setSidebarOpen(true)} className="md:hidden mb-6 text-2xl text-brand-ink/70">
          ☰
        </button>
        {children}
      </main>
    </div>
  );
}

export default LguLayout;
