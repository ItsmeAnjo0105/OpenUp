import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setLoading(false);
        return;
      }

      localStorage.setItem('openup_token', data.token);
      localStorage.setItem('openup_user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-brand-surface rounded-2xl shadow-sm p-8">
        <Link to="/" className="font-display text-xl font-semibold text-brand-primary">OpenUp</Link>
        <h1 className="font-display text-2xl font-semibold mt-6 mb-1">Welcome back</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Log in to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <p className="text-sm text-brand-ink/60 mt-6 text-center">
          Don't have an account?{' '}
          <Link to="/signup" className="text-brand-primary font-medium">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
