// Regenerates the guess dictionary from two MIT-licensed word lists.
//   npm i --no-save word-list wordlist-english && node scripts/build-dictionary.mjs
// Writes public/words5.txt (client, instant "not in word list" feedback)
// and supabase/dictionary.sql (server, authoritative validation).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const words = new Set();
const add = (list) => { for (const w of list) if (/^[a-z]{5}$/.test(w)) words.add(w.toUpperCase()); };

const { default: wordListPath } = await import('word-list');
add(fs.readFileSync(wordListPath, 'utf8').split('\n'));
for (const variant of ['american', 'british', 'australian', 'canadian', 'english']) {
  for (const size of [10, 20, 35, 40, 50, 55, 60, 70]) {
    try { add(require(`wordlist-english/${variant}-words-${size}.json`)); } catch { /* not every size exists */ }
  }
}
const sorted = [...words].sort();
fs.writeFileSync('public/words5.txt', sorted.join('\n') + '\n');
fs.writeFileSync('supabase/dictionary.sql',
  `-- BB Wordle guess dictionary: ${sorted.length} five-letter words.\n` +
  `-- Sources: word-list (MIT, Sindre Sorhus) and SCOWL via wordlist-english (MIT-style, Kevin Atkinson).\n` +
  `-- Run AFTER schema.sql. Safe to re-run.\n` +
  `insert into public.dictionary (word)\nselect unnest(string_to_array('${sorted.join(',')}', ','))\non conflict do nothing;\n`);
console.log(`${sorted.length} words`);
