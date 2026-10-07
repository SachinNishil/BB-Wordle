// The guess dictionary, loaded once (about 75 KB, ~25 KB gzipped) and cached
// by the service worker. The server re-checks every guess anyway; this is
// only for the instant "Not in word list" shake.
let cache: Promise<Set<string>> | null = null;

export function loadDictionary(): Promise<Set<string>> {
  if (!cache) {
    cache = fetch('/words5.txt')
      .then((r) => {
        if (!r.ok) throw new Error('dictionary');
        return r.text();
      })
      .then((t) => new Set(t.split('\n').map((w) => w.trim()).filter(Boolean)))
      .catch(() => {
        cache = null; // retry next time
        return new Set<string>();
      });
  }
  return cache;
}
