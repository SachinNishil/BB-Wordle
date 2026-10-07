import { useEffect, useState } from 'react';

// Hash routing (#/stats, #/history/<id>) so the phone's back button and back
// gesture work in the installed app, with no server rewrites needed.
function current() {
  const h = location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

export function useRoute() {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => setPath(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = path.split('/').filter(Boolean);
  return { path, parts };
}

export function go(path: string, replace = false) {
  const depth = (history.state?.bbDepth as number | undefined) ?? 0;
  if (replace) history.replaceState({ bbDepth: depth }, '', '#' + path);
  else if (current() !== path) history.pushState({ bbDepth: depth + 1 }, '', '#' + path);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Back within the app if there is somewhere to go back to, otherwise to `fallback`. */
export function back(fallback = '/') {
  if (((history.state?.bbDepth as number | undefined) ?? 0) > 0) history.back();
  else go(fallback, true);
}
