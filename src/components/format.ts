export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export const compact = (n: number) => (n >= 1000000 ? `$${(n / 1000000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`);
export const number = (n: number) => new Intl.NumberFormat('en-US').format(n);
export const date = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "Avery — demo seller" → "A"; "Jordan Demo" → "JD". Descriptors after a dash are not part of the name. */
export const initials = (name: string) =>
  name
    .split(/\s[—–-]\s/)[0]
    .split(/\s+/)
    .filter(part => /^[A-Za-z0-9]/.test(part))
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
