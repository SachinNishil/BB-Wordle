// Keeps installed phones on the latest deploy without anyone refreshing.
//
// Every build publishes /version.json with a unique build id. The app checks
// it when it comes to the foreground, when the network comes back, and every
// minute while open. If the id differs from the one this copy was built with,
// it refreshes the service worker and reloads, but never on the game screen:
// there it waits until you leave it.
import { BUILD_ID } from './config';

const ATTEMPT_KEY = 'bbw.updateAttempt';
let pending: string | null = null;
let reloading = false;
let reg: ServiceWorkerRegistration | null = null;

const busy = () => location.hash.startsWith('#/game');

async function applyUpdate() {
  if (!pending || reloading || busy()) return;
  // Loop guard: if the server keeps serving an old page, don't reload forever.
  try {
    const last = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? 'null') as { build: string; at: number } | null;
    if (last && last.build === pending && Date.now() - last.at < 5 * 60 * 1000) return;
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ build: pending, at: Date.now() }));
  } catch {
    /* storage blocked: still update */
  }
  reloading = true;
  try {
    await Promise.race([reg?.update(), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* reload anyway: the page itself is fetched network-first */
  }
  location.reload();
}

async function check() {
  if (reloading) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const v = (await res.json()) as { build?: string };
    if (v.build && v.build !== BUILD_ID) {
      pending = v.build;
      void applyUpdate();
    }
  } catch {
    /* offline: try again later */
  }
}

export function startUpdates() {
  if (!import.meta.env.PROD) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((r) => (reg = r)).catch(() => {});
  }
  const visible = () => document.visibilityState === 'visible' && void check();
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', visible);
  window.addEventListener('online', () => void check());
  window.addEventListener('pageshow', visible);
  window.addEventListener('hashchange', () => void applyUpdate()); // leaving the game screen
  setInterval(() => document.visibilityState === 'visible' && void check(), 60 * 1000);
  setTimeout(check, 3000);
}
