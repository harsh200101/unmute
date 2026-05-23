// --- Money (paise → INR display) ------------------------------------------

export function paiseToRupees(paise) {
  if (paise == null) return null;
  return Number(paise) / 100;
}

export function formatINR(paise, opts = {}) {
  if (paise == null) return '—';
  const n = paiseToRupees(paise);
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.alwaysCents ? 2 : (n % 1 === 0 ? 0 : 2),
    maximumFractionDigits: 2,
  });
  return formatter.format(n);
}

export function formatPerMinute(paise) {
  if (paise == null) return '—';
  return `${formatINR(paise)}/min`;
}

// --- Time -----------------------------------------------------------------

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatDate(iso, opts = {}) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: opts.dateStyle || 'medium',
      timeStyle: opts.timeStyle || 'short',
      ...opts,
    });
  } catch (_) {
    return iso;
  }
}

export function formatDateShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium' });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { timeStyle: 'short' });
}

// "in 3 hours", "5 min ago", "tomorrow at 6:00 PM" style hints
export function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60000);
  const hr = Math.round(abs / 3600000);
  const day = Math.round(abs / 86400000);
  const sign = diffMs >= 0 ? 'in' : 'ago';
  let v;
  if (min < 1) v = 'just now';
  else if (min < 60) v = `${min} min ${sign}`;
  else if (hr < 24) v = `${hr} hr ${sign}`;
  else v = `${day} day${day === 1 ? '' : 's'} ${sign}`;
  return sign === 'ago' ? v : v.replace(/^in /, 'in ');
}

// --- Misc -----------------------------------------------------------------

export function capitalize(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
