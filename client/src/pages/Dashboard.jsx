import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('openup_user') || 'null');

  const handleLogout = () => {
    localStorage.removeItem('openup_token');
    localStorage.removeItem('openup_user');
    navigate('/');
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-brand-accent font-medium mb-2">Maayong adlaw,</p>
        <h1 className="font-display text-3xl font-semibold mb-6">{user.name}</h1>
        <p className="text-brand-ink/60 mb-8">Your dashboard is coming soon.</p>
        <button
          onClick={handleLogout}
          className="border border-brand-primary text-brand-primary px-6 py-2.5 rounded-full font-medium hover:bg-brand-primary/5"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default Dashboard;
