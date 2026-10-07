// Parsing pasted word lists for the repository.
export type Verdict = 'new' | 'invalid' | 'duplicate' | 'repeated' | 'unknown';

export interface ParsedWord {
  raw: string;
  word: string;
  verdict: Verdict;
}

/** Splits on newlines, spaces, commas, semicolons, tabs and bullets. */
export function splitWords(text: string): string[] {
  return text
    .split(/[\s,;|•·]+/)
    .map((w) => w.trim().replace(/^[\d.)\-–—*]+/, '').replace(/[.!?'"]+$/, ''))
    .filter(Boolean);
}

export function normalise(w: string) {
  return w.trim().toUpperCase();
}

/**
 * Client-side preview of an import. The server makes the final decision, but
 * this lets the user see problems before pressing Import.
 */
export function classify(text: string, existing: Set<string>, dictionary: Set<string> | null): ParsedWord[] {
  const seen = new Set<string>();
  return splitWords(text).map((raw) => {
    const word = normalise(raw);
    let verdict: Verdict;
    if (!/^[A-Z]{5}$/.test(word)) verdict = 'invalid';
    else if (seen.has(word)) verdict = 'repeated';
    else if (existing.has(word)) verdict = 'duplicate';
    else if (dictionary && dictionary.size > 0 && !dictionary.has(word)) verdict = 'unknown';
    else verdict = 'new';
    if (/^[A-Z]{5}$/.test(word)) seen.add(word);
    return { raw, word, verdict };
  });
}
