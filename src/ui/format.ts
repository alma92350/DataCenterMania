const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

export function money(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString('en-US');
  return `${n < 0 ? '-' : ''}$${abs}`;
}

export function stars(rep: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rep)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/** Game minutes -> compact duration. */
export function countdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
