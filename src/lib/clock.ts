// Server clock. Every RPC returns server_now; we keep the offset so timers
// and the shared 3-2-1 countdown line up on both phones even if one phone's
// clock is off.
let offset = 0;
let samples = 0;

export function syncClock(serverNowIso: string | undefined, sentAt: number, receivedAt: number) {
  if (!serverNowIso) return;
  const server = Date.parse(serverNowIso);
  if (Number.isNaN(server)) return;
  const sample = server - (sentAt + receivedAt) / 2;
  // Smooth a little, but take the first sample as-is.
  offset = samples === 0 ? sample : offset * 0.7 + sample * 0.3;
  samples++;
}

export const serverNow = () => Date.now() + offset;

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '–';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Date(iso).toLocaleDateString('en-GB', opts);
}
