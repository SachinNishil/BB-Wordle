// Runs supabase/schema.sql against a real Postgres and attacks it the way a
// browser holding the anon key could.  Usage:
//   PGURL=postgres://postgres@127.0.0.1:54329/bbw_test node --experimental-strip-types tests/sql/run.mjs
import fs from 'node:fs';
import pg from 'pg';
import { evaluate } from '../../src/lib/wordle.ts';

const base = process.env.PGURL ?? 'postgres://postgres@127.0.0.1:54329/postgres';
const DB = 'bbw_test';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  FAIL', name, extra ?? ''); } };

const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${DB}`);
await admin.query(`create database ${DB}`);
await admin.end();
const url = base.replace(/\/[^/]*$/, '/' + DB);
const su = new pg.Client({ connectionString: url });
await su.connect();
for (const f of ['tests/sql/supabase_stub.sql', 'supabase/schema.sql', 'supabase/dictionary.sql', 'supabase/schema.sql']) {
  await su.query(fs.readFileSync(f, 'utf8'));
}

// A "browser": every call runs as the anon role, like PostgREST does.
async function asAnon(sql, params = [], client = su) {
  await client.query('begin');
  try {
    await client.query('set local role anon');
    const r = await client.query(sql, params);
    await client.query('commit');
    return r;
  } catch (e) { await client.query('rollback'); throw e; }
}
async function rpc(fn, args = {}, client = su) {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
  const r = await asAnon(sql, names.map((n) => args[n]), client);
  return r.rows[0].r;
}
async function rpcErr(fn, args, client) {
  try { await rpc(fn, args, client); return null; } catch (e) { return e.message; }
}
const secretOf = async (gid) => (await su.query('select word from game_secrets where game_id=$1', [gid])).rows[0].word;

console.log('1. The browser cannot touch tables or internal functions');
for (const t of ['rooms', 'players', 'words', 'games', 'game_secrets', 'game_players', 'guesses', 'dictionary']) {
  let msg = null;
  try { await asAnon(`select * from public.${t} limit 1`); } catch (e) { msg = e.message; }
  ok(msg && /permission denied/.test(msg), `select ${t} denied`, msg);
  msg = null;
  try { await asAnon(`delete from public.${t}`); } catch (e) { msg = e.message; }
  ok(msg && /permission denied/.test(msg), `delete ${t} denied`, msg);
}
for (const f of ["_pick_word('00000000-0000-0000-0000-000000000000')", "evaluate_guess('CRANE','CRANE')", 'admin_new_room_key()',
                 "_game_json('00000000-0000-0000-0000-000000000000', 1)", "_room('x')", "_after_finish('00000000-0000-0000-0000-000000000000')"]) {
  let msg = null;
  try { await asAnon(`select public.${f}`); } catch (e) { msg = e.message; }
  ok(msg && /permission denied/.test(msg), `internal ${f} denied`, msg);
}

console.log('2. Room setup');
ok((await rpc('room_exists')) === false, 'no room yet');
const { key } = await rpc('create_room');
ok(/^[0-9a-f]{64}$/.test(key), 'room key is 64 hex chars');
ok((await rpcErr('create_room', {})) === 'room_exists', 'second create_room refused');
ok((await rpcErr('get_room', { p_key: 'nope' })) === 'bad_room_key', 'wrong key refused');
ok((await rpcErr('get_room', { p_key: null })) === 'bad_room_key', 'null key refused');
const room = await rpc('get_room', { p_key: key });
ok(room.players.map((p) => p.name).join() === 'Sachin,Menaka', 'two profiles ready', JSON.stringify(room.players));
ok((await su.query('select count(*)::int n from rooms where key_hash = sha256(convert_to($1,\'UTF8\'))', [key])).rows[0].n === 1, 'only hash stored');
ok((await rpcErr('get_room', { p_key: key })) === null, 'right key works');
ok((await rpcErr('update_player', { p_key: key, p_slot: 3, p_name: 'X' })) === 'bad_player', 'slot 3 refused');
const up = await rpc('update_player', { p_key: key, p_slot: 2, p_name: '  Menu  ', p_photo: 'data:image/jpeg;base64,AAAA' });
ok(up.players[1].name === 'Menu' && up.players[1].photo.startsWith('data:image/jpeg'), 'rename + photo');
ok((await rpcErr('update_player', { p_key: key, p_slot: 2, p_name: null, p_photo: 'javascript:alert(1)' })) === 'bad_photo', 'non-image photo refused');
await rpc('update_player', { p_key: key, p_slot: 2, p_name: 'Menaka', p_clear_photo: true });
ok((await rpc('get_room', { p_key: key })).players[1].photo === null, 'photo cleared');

console.log('3. Word repository');
ok((await rpcErr('start_game', { p_key: key, p_slot: 1 })) === 'no_words', 'cannot start with no words');
let res = await rpc('add_words', { p_key: key, p_slot: 1, p_words: ['crane', ' House ', 'PLANT', 'plant', 'toolong', 'ab1de', '', 'QWXYZ', 'brick'] });
ok(JSON.stringify(res.added) === '["CRANE","HOUSE","PLANT","BRICK"]', 'normalised and added', JSON.stringify(res));
ok(res.duplicates.length === 1 && res.duplicates[0].reason === 'repeated_in_list', 'in-batch duplicate');
ok(JSON.stringify(res.invalid) === '["toolong","ab1de"]', 'invalid reported', JSON.stringify(res.invalid));
ok(JSON.stringify(res.unknown) === '["QWXYZ"]', 'unknown reported');
res = await rpc('add_words', { p_key: key, p_slot: 2, p_words: ['CRANE', 'MOUSE', 'PAPAD'] });
ok(res.duplicates[0].word === 'CRANE' && res.duplicates[0].added_by === 1, 'duplicate shows original adder');
ok(JSON.stringify(res.unknown) === '["PAPAD"]', 'PAPAD not in dictionary');
res = await rpc('add_words', { p_key: key, p_slot: 2, p_words: ['PAPAD'], p_allow_unknown: true });
ok(JSON.stringify(res.added) === '["PAPAD"]', 'allow_unknown adds it');
let words = await rpc('list_words', { p_key: key });
ok(words.length === 6, '6 words', words.length);
const papad = words.find((w) => w.word === 'PAPAD');
ok(papad.added_by === 2 && papad.in_dictionary === false, 'contributor + dictionary flag kept');
const brick = words.find((w) => w.word === 'BRICK');
ok((await rpcErr('delete_word', { p_key: key, p_slot: 2, p_word_id: brick.id })) === 'cannot_delete_word', "can't delete partner's word");
ok((await rpc('delete_word', { p_key: key, p_slot: 1, p_word_id: brick.id })) === true, 'delete own word');

console.log('4. Starting a game hides the answer');
// Make the pick deterministic for this test: only one word left unplayed.
await su.query("update words set times_played = 1, last_played_at = now() - interval '400 days' where word <> 'PLANT'");
const s1 = await rpc('start_game', { p_key: key, p_slot: 1 });
const gid = s1.game.id;
const answer = await secretOf(gid);
ok(answer === 'PLANT', 'never-played word picked first', answer);
await su.query("update words set times_played = 0, last_played_at = null");
ok(s1.game.status === 'waiting' && s1.game.answer === null && s1.game.word_added_by === null, 'waiting, no answer, no contributor');
ok(!JSON.stringify(s1).includes(answer), 'answer string appears nowhere in start response');
ok(s1.game.me.status === 'ready' && s1.game.partner.status === 'waiting', 'starter joined, partner waiting');
const again = await rpc('start_game', { p_key: key, p_slot: 2 });
ok(again.already_active === true && again.game.id === gid, 'second start returns the same game');
ok((await rpc('get_room', { p_key: key })).active_game_id === gid, 'room knows the active game');
words = await rpc('list_words', { p_key: key });
ok(words.every((w) => w.times_played === 0 && w.last_played_at === null), 'repository gives no hint of the live word');
ok((await rpcErr('begin_round', { p_key: key, p_slot: 1, p_game_id: gid })) === 'not_started', 'cannot begin before partner joins');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'CRANE', p_attempt: 1 })) === 'not_started', 'cannot guess while waiting');

console.log('5. Join, countdown, begin');
const j = await rpc('join_game', { p_key: key, p_slot: 2, p_game_id: gid });
ok(j.game.status === 'ready' && j.game.starts_at, 'both joined -> ready with GO time');
const lead = (new Date(j.game.starts_at) - new Date(j.server_now)) / 1000;
ok(lead > 3 && lead < 4, 'countdown ~3.6s', lead);
ok((await rpcErr('begin_round', { p_key: key, p_slot: 1, p_game_id: gid })) === 'too_early', 'begin refused before GO');
await su.query("update games set starts_at = now() - interval '1 second' where id = $1", [gid]);
let b1 = await rpc('begin_round', { p_key: key, p_slot: 1, p_game_id: gid });
ok(b1.game.status === 'live' && b1.game.me.status === 'playing' && b1.game.me.started_at, 'live and playing');

console.log('6. Guessing');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'ZZZZZ', p_attempt: 1 })) === 'not_a_word', 'non-word refused');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'CRAN', p_attempt: 1 })) === 'invalid_guess', 'short guess refused');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'CRANE', p_attempt: 2 })) === 'stale_attempt', 'wrong attempt number refused');
let g1 = await rpc('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'crane', p_attempt: 1 });
ok(g1.pattern === evaluate('CRANE', answer), 'pattern matches TS evaluator', g1.pattern);
ok(!JSON.stringify(g1).includes(answer), 'guess response has no answer');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'HOUSE', p_attempt: 1 })) === 'stale_attempt', 'replayed attempt (second device) refused');
const pg1 = await rpc('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'PAPAD', p_attempt: 2 });
ok(pg1.pattern.length === 5, 'repository-only word is guessable');
// Player 2 auto-begins on first guess (closed the app during countdown).
const g2 = await rpc('submit_guess', { p_key: key, p_slot: 2, p_game_id: gid, p_guess: 'MOUSE', p_attempt: 1 });
ok(g2.game.me.status === 'playing' && g2.game.me.started_at, 'first guess starts a late player');
let st1 = await rpc('get_game_state', { p_key: key, p_slot: 1 });
ok(st1.game.partner.guess_count === 1 && st1.game.partner.patterns.length === 1, 'partner progress visible');
ok(st1.game.partner.guesses === null && !JSON.stringify(st1).includes('MOUSE'), "partner's letters hidden");

console.log('7. One player solves');
const win1 = await rpc('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: answer, p_attempt: 3 });
ok(win1.pattern === 'GGGGG' && win1.game.me.status === 'solved', 'solved');
ok(win1.game.status === 'player_one_complete', 'PLAYER_ONE_COMPLETE');
ok(win1.game.answer === answer && win1.game.word_added_by === 1, 'finished player sees answer + contributor');
ok(win1.game.me.duration_ms >= 0, 'duration recorded');
const st2 = await rpc('get_game_state', { p_key: key, p_slot: 2 });
ok(st2.game.answer === null && !JSON.stringify(st2).includes(answer), 'partner still cannot see answer');
ok(st2.game.partner.status === 'solved' && st2.game.partner.guess_count === 3, 'partner sees the solve');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid, p_guess: 'HOUSE', p_attempt: 4 })) === 'already_finished', 'no guesses after solving');
ok((await rpcErr('cancel_game', { p_key: key, p_slot: 2, p_game_id: gid })) === 'cannot_cancel', 'cannot cancel a played game');
words = await rpc('list_words', { p_key: key });
ok(words.every((w) => w.times_played === 0), 'still no hint in repository');
ok((await su.query('select word from games where id=$1', [gid])).rows[0].word === null, 'games.word still null');

console.log('8. Other player fails -> completed');
const losers = ['HOUSE', 'BRICK', 'CRANE', 'MOUSE', 'HOUSE'].filter((w) => w !== answer);
let last;
for (let a = 2; a <= 6; a++) last = await rpc('submit_guess', { p_key: key, p_slot: 2, p_game_id: gid, p_guess: losers[(a - 2) % losers.length], p_attempt: a });
ok(last.game.me.status === 'failed' && last.game.status === 'completed', 'failed and COMPLETED');
ok(last.game.winner === 1 && last.game.result === 'win', 'Sachin wins');
ok(last.game.answer === answer, 'answer revealed to both');
ok(Array.isArray(last.game.partner.guesses) && last.game.partner.guesses.length === 3, "partner's words visible after completion");
const gameRow = (await su.query('select * from games where id=$1', [gid])).rows[0];
ok(gameRow.word === answer && gameRow.word_added_by === 1 && gameRow.completed_at, 'word copied to games on completion');
words = await rpc('list_words', { p_key: key });
ok(words.find((w) => w.word === answer).times_played === 1, 'times_played bumped on completion');
const hist = await rpc('get_history', { p_key: key });
ok(hist.length === 1 && hist[0].word === answer && hist[0].players.length === 2 && hist[0].players[1].guesses.length === 6, 'history has the game with both boards');
ok((await rpc('get_game_state', { p_key: key, p_slot: 1 })).game === null, 'no active game');
ok((await rpcErr('submit_guess', { p_key: key, p_slot: 2, p_game_id: gid, p_guess: 'HOUSE', p_attempt: 7 })) === 'game_over', 'no guesses after game over');

console.log('9. Simultaneous finish (two connections)');
const c1 = new pg.Client({ connectionString: url }); const c2 = new pg.Client({ connectionString: url });
await c1.connect(); await c2.connect();
const [ra, rb] = await Promise.all([rpc('start_game', { p_key: key, p_slot: 1 }, c1), rpc('start_game', { p_key: key, p_slot: 2 }, c2)]);
ok(ra.game.id === rb.game.id, 'simultaneous START -> one game', `${ra.game.id} ${rb.game.id}`);
const gid2 = ra.game.id; const ans2 = await secretOf(gid2);
ok(ans2 !== answer, 'played word not repeated while unplayed remain', ans2);
await rpc('join_game', { p_key: key, p_slot: 1, p_game_id: gid2 });
await rpc('join_game', { p_key: key, p_slot: 2, p_game_id: gid2 });
await su.query("update games set starts_at = now() - interval '1 second' where id = $1", [gid2]);
await Promise.all([rpc('begin_round', { p_key: key, p_slot: 1, p_game_id: gid2 }, c1), rpc('begin_round', { p_key: key, p_slot: 2, p_game_id: gid2 }, c2)]);
// Make Sachin's clock start a minute earlier, so he is the slower of the two.
await su.query("update game_players set started_at = started_at - interval '60 seconds' where game_id = $1 and slot = 1", [gid2]);
const [fa, fb] = await Promise.all([
  rpc('submit_guess', { p_key: key, p_slot: 1, p_game_id: gid2, p_guess: ans2, p_attempt: 1 }, c1),
  rpc('submit_guess', { p_key: key, p_slot: 2, p_game_id: gid2, p_guess: ans2, p_attempt: 1 }, c2),
]);
const fin = (await rpc('get_game_state', { p_key: key, p_slot: 1, p_game_id: gid2 })).game;
ok(fin.status === 'completed' && fin.result === 'win' && fin.winner === 2, 'both solved in 1 -> faster player (Menaka) wins on time', JSON.stringify([fa.game.status, fb.game.status, fin.status, fin.result, fin.winner]));
ok([fa.game.status, fb.game.status].includes('completed'), 'one of the two calls completed the game');

console.log('9b. Fewer guesses beats a faster time');
{
  const sg = await rpc('start_game', { p_key: key, p_slot: 1 });
  const g = sg.game.id; const w = await secretOf(g);
  await rpc('join_game', { p_key: key, p_slot: 2, p_game_id: g });
  await su.query("update games set starts_at = now() - interval '1 second' where id = $1", [g]);
  await rpc('begin_round', { p_key: key, p_slot: 1, p_game_id: g });
  await rpc('begin_round', { p_key: key, p_slot: 2, p_game_id: g });
  await su.query("update game_players set started_at = started_at - interval '5 minutes' where game_id = $1 and slot = 1", [g]);
  const other = ['HOUSE', 'MOUSE', 'PLANT', 'CRANE'].find((x) => x !== w);
  await rpc('submit_guess', { p_key: key, p_slot: 2, p_game_id: g, p_guess: other, p_attempt: 1 });
  await rpc('submit_guess', { p_key: key, p_slot: 2, p_game_id: g, p_guess: w, p_attempt: 2 });
  const end = await rpc('submit_guess', { p_key: key, p_slot: 1, p_game_id: g, p_guess: w, p_attempt: 1 });
  ok(end.game.status === 'completed' && end.game.winner === 1, 'slow 1-guess solve beats quick 2-guess solve', JSON.stringify([end.game.winner, end.game.result]));
}

console.log('10. Give up, cancel, play now');
const s3 = await rpc('start_game', { p_key: key, p_slot: 2 });
const gid3 = s3.game.id;
ok((await rpcErr('give_up', { p_key: key, p_slot: 2, p_game_id: gid3 })) === 'not_started', 'cannot give up before start');
ok((await rpc('cancel_game', { p_key: key, p_slot: 1, p_game_id: gid3 })) === true, 'cancel untouched game');
ok((await su.query('select count(*)::int n from games where id=$1', [gid3])).rows[0].n === 0, 'cancelled game gone (secret cascades)');
ok((await su.query('select count(*)::int n from game_secrets where game_id=$1', [gid3])).rows[0].n === 0, 'secret gone');
const s4 = await rpc('start_game', { p_key: key, p_slot: 2 });
const gid4 = s4.game.id;
const pn = await rpc('join_game', { p_key: key, p_slot: 2, p_game_id: gid4, p_play_now: true });
ok(pn.game.status === 'ready' && pn.game.partner.status === 'waiting', 'play now starts without partner');
await su.query("update games set starts_at = now() - interval '1 second' where id = $1", [gid4]);
await rpc('begin_round', { p_key: key, p_slot: 2, p_game_id: gid4 });
const gu = await rpc('give_up', { p_key: key, p_slot: 2, p_game_id: gid4 });
ok(gu.game.me.status === 'failed' && gu.game.me.gave_up && gu.game.status === 'player_two_complete', 'gave up -> PLAYER_TWO_COMPLETE');
ok(gu.game.answer, 'answer shown after giving up');
const late = await rpc('join_game', { p_key: key, p_slot: 1, p_game_id: gid4 });
ok(late.game.me.status === 'ready' && late.game.answer === null, 'late partner joins, answer still hidden');
await rpc('begin_round', { p_key: key, p_slot: 1, p_game_id: gid4 });
await rpc('give_up', { p_key: key, p_slot: 1, p_game_id: gid4 });
const g4 = (await rpc('get_game_state', { p_key: key, p_slot: 1, p_game_id: gid4 })).game;
ok(g4.status === 'completed' && g4.result === 'both_failed' && g4.winner === null, 'both failed');

console.log('11. Word selection when everything has been played');
// 5 words, 4 games played (PLANT, ans2, gid4 word, + cancelled none). Make all played and recent.
await su.query("update words set times_played = 1, last_played_at = now()");
const s5 = await rpc('start_game', { p_key: key, p_slot: 1 });
ok(s5.game.id, 'still starts (falls back to longest-rested)');
await su.query('delete from games where id=$1', [s5.game.id]);
await su.query("update words set last_played_at = now() - interval '30 days' where word = 'MOUSE'");
await su.query("update words set last_played_at = now() where word <> 'MOUSE'");
const s6 = await rpc('start_game', { p_key: key, p_slot: 1 });
ok((await secretOf(s6.game.id)) === 'MOUSE', 'only the rested word is eligible');
await su.query('delete from games where id=$1', [s6.game.id]);

console.log('12. Evaluator parity: SQL vs TypeScript');
const dict = fs.readFileSync('public/words5.txt', 'utf8').trim().split('\n');
const pairs = [];
const tricky = ['SPEED', 'ABIDE', 'ERASE', 'LLAMA', 'HELLO', 'EERIE', 'EMCEE', 'KEBAB', 'ABBEY', 'BOBBY', 'ROBIN', 'APPLE', 'PLANT', 'MAMMA', 'GEESE', 'ESSES', 'SASSY', 'NANNY', 'FUZZY', 'QUEUE'];
for (const a of tricky) for (const b of tricky) pairs.push([a, b]);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
while (pairs.length < 6000) pairs.push([dict[Math.floor(rnd() * dict.length)], dict[Math.floor(rnd() * dict.length)]]);
const r = await su.query('select evaluate_guess(g, a) p from unnest($1::text[], $2::text[]) as t(g, a)', [pairs.map((p) => p[0]), pairs.map((p) => p[1])]);
let mismatches = 0;
r.rows.forEach((row, i) => { if (row.p !== evaluate(pairs[i][0], pairs[i][1])) { mismatches++; if (mismatches < 5) console.log('   ', pairs[i], row.p, evaluate(...pairs[i])); } });
ok(mismatches === 0, `${pairs.length} pairs agree`, mismatches);

await c1.end(); await c2.end(); await su.end();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
