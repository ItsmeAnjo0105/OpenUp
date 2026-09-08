import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

function Signup() {
  const [barangays, setBarangays] = useState([]);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'resident', barangay_id: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/barangays`)
      .then((res) => res.json())
      .then(setBarangays)
      .catch(() => {});
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setLoading(false);
        return;
      }

      navigate('/login');
    } catch {
      setError('Could not reach the server. Check your connection.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-brand-surface rounded-2xl shadow-sm p-8">
        <Link to="/" className="font-display text-xl font-semibold text-brand-primary">OpenUp</Link>
        <h1 className="font-display text-2xl font-semibold mt-6 mb-1">Create your account</h1>
        <p className="text-brand-ink/60 text-sm mb-6">Takes less than a minute.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Full name</label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <input
              type="email" name="email" value={form.email} onChange={handleChange} required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <input
              type="password" name="password" value={form.password} onChange={handleChange} required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">I am a</label>
            <select
              name="role" value={form.role} onChange={handleChange}
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="resident">Resident</option>
              <option value="psychologist">Psychologist</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Barangay</label>
            <select
              name="barangay_id" value={form.barangay_id} onChange={handleChange} required
              className="w-full border border-brand-ink/15 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary"
            >
              <option value="">Select your barangay</option>
              {barangays.map((b) => (
                <option key={b.barangay_id} value={b.barangay_id}>{b.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-primary text-white py-2.5 rounded-full font-medium hover:bg-brand-primary-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p className="text-sm text-brand-ink/60 mt-6 text-center">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-primary font-medium">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;
