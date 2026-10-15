const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-amber-500', 'bg-pink-500',
  'bg-emerald-500', 'bg-indigo-500', 'bg-rose-500', 'bg-cyan-500',
];

export function avatarColorFor(name) {
  const sum = (name || '?').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
