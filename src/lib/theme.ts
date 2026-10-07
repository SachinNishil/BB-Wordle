import { load, save } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'bbw.theme';

export const getTheme = () => load<ThemeChoice>(KEY, 'system');

export function applyTheme(t: ThemeChoice = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#16130f' : '#f7f1e9');
}

export function setTheme(t: ThemeChoice) {
  save(KEY, t);
  applyTheme(t);
}
