export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Attach to fetch() calls that hit a requireAuth-protected route:
// fetch(url, { headers: authHeader() })
export function authHeader() {
  const token = localStorage.getItem('openup_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('openup_user'));
  } catch {
    return null;
  }
}

// Where each role lands after login.
export function dashboardPathForRole(role) {
  if (role === 'psychologist') return '/psychologist/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/dashboard';
}
