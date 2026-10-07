# Wordle for Two

A private Wordle battle for Sachin and Menaka. You both add words to a shared
repository. Whenever either of you presses **START GAME**, the app picks one secret
word and you both play it at the same time on your own phones, watching each
other's progress live (colours only, never letters).

Built with React + TypeScript + Supabase. Installs to the home screen as an app.

---

## Setup (about 15 minutes, once)

### 1. Create the database (Supabase, free)

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**.
   Any name (e.g. `bb-wordle`), any password, the region closest to you (Mumbai).
2. When it's ready, open **SQL Editor** in the left sidebar and click **New query**.
3. Open `supabase/schema.sql` from this folder, copy all of it, paste it in, click **Run**.
   You should see "Success. No rows returned".
4. New query again. Do the same with `supabase/dictionary.sql` (it's long, that's
   normal: it's the 12,675-word list used to check guesses).
5. Get your two connection values. Click **Connect** at the top of the project
   (or go to **Project Settings › API Keys**) and copy:
   - the **Project URL**, like `https://abcdefgh.supabase.co`
   - the **publishable** key (`sb_publishable_…`) or the legacy **anon public** key.

   Never use the `service_role` / secret key in the app.

Realtime needs no setup. (If the app's Settings page ever says live sync is
"reconnecting" for good, check **Project Settings › Realtime** and make sure
public channel access is allowed.)

### 2. Put the code on GitHub

1. Create a new **private** repository on GitHub, e.g. `bb-wordle`.
2. Click **uploading an existing file** and drag in everything in this folder
   **except** `node_modules` and `dist` if they exist. Commit.

### 3. Deploy on Vercel

1. In Vercel, **Add New › Project** and import the `bb-wordle` repo.
   It detects Vite on its own; leave the build settings alone.
2. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your publishable / anon key |

3. Click **Deploy**. You get a link like `https://bb-wordle.vercel.app`.

(If you add the variables after the first deploy, redeploy once so they're picked up.)

### 4. Set up your phones

**Sachin's phone**

1. Open the Vercel link.
   - **iPhone:** tap Share › **Add to Home Screen** first, then open the new icon.
     (iPhone keeps home-screen apps separate from Safari, so do the setup inside the app.)
   - **Android:** Chrome menu › **Install app**, then open it.
2. Tap **Set up our room**, then **Share invite link** and send it to Menaka.
3. Tap **Continue**, choose **Sachin**, and you're in.

**Menaka's phone**

1. Copy the invite link from the message.
2. Open the Vercel link, add it to the Home Screen the same way, and open the icon.
3. Tap **Paste invite link**, then choose **Menaka**.

(Opening the link straight in the browser also works. The app will show a
"Copy room link" card to carry the room into the installed app.)

### 5. Play

Add words (aim for about 100 each to start: paste a whole list at once in
**Word repository › Paste a list of words**), then press **START GAME**.

---

## How it works

**The two of you.** There is no sign-in. Each phone picks who it belongs to in
**Settings** (a simple Sachin / Menaka choice), and you can add photos there too.
The room itself is protected by a long random key that only lives on your two
phones, sent via the invite link. Without it, someone who finds the website
sees only a "join your room" screen and can't read or change anything.

**The secret word stays secret.** The browser never receives the answer before
you finish:

- Every table has Row Level Security on with no policies, and the browser role
  has no table access at all. Everything goes through Postgres functions that
  check the room key first.
- The answer sits in a locked `game_secrets` table. Your guess is checked inside
  the database, and your phone only gets back the colours for that guess.
- You see the word the moment *your* round ends (solved, failed or given up).
  Your partner keeps playing without it. It's copied into the game record only
  once you've both finished.
- The repository's "played" counts only update when a game completes, so the
  word list can't give away which word is live.

Because there's no sign-in, the two of you are trusted not to impersonate each
other with developer tools. That was the trade for not having to log in.

**Live sync.** Supabase Realtime carries tiny "something changed" pings and
"who's online" presence between the phones; each phone then re-reads its own
view through the secure functions. If realtime drops (bad signal), the app
quietly polls every few seconds and catches up the moment it reconnects.

**Game flow.** START GAME → *Waiting for player* → when both phones are on the
game screen, a shared **3, 2, 1, GO!** → play. Each of you has your own clock.
If your partner isn't around, **Play now** starts you anyway and they get their own
countdown when they arrive. You can **Cancel** a game nobody has guessed in yet,
or **Give up** your own round (flag icon). A new game can only start once the
current one is complete.

States: `waiting` → `ready` (countdown) → `live` → `player_one_complete` /
`player_two_complete` → `completed`.

**Winner.** Fewer guesses wins, whatever the time. Time only counts when you both
solve in the same number of guesses: then the faster solver wins (results say
"the clock decided it"). A draw needs the same guesses *and* the same time.
A solve beats a fail. To make equal guesses a plain draw instead, change
`tiebreak_by_time()` in `schema.sql` to `select false` and re-run the file.

**Word selection.** Never-played words always come first. Once everything has
been played, a word can't return until 20 other games and 10 days have passed,
and longer-rested words are likelier. All of this is at the top of `schema.sql`
in `word_selection_settings()`. Edit and re-run the file to change it.

**Words not in the dictionary** (names, Tamil words, slang) are flagged on import
with an **Add anyway** button. Anything in your repository is always accepted as
a guess, so a custom word can never make a game unwinnable.

**Stats.** Win rate (battles won), solve rate, average guesses and time, streaks,
fastest solve, most common score, guess distribution, head-to-head, a
"Hall of fame" (Most Brutal Word, Easy Money, Clutch Player, Speed Demon,
Comeback King, Word Setter, Hardest Word Setter, Nemesis Letter) and a
"who picks harder words" rivalry in the repository. A failed round counts as
7 guesses in difficulty averages.

- *Comeback King*: wins where the other person finished first on the clock.
- *Nemesis Letter*: the letter you most often guess that isn't in the word.

---

## Maintenance

- **Updating the app:** replace the changed files on GitHub and Vercel redeploys.
  Both phones update themselves: an open app checks every minute (and the
  moment you bring it back to the screen), then reloads quietly and shows
  "Updated to vX · What's new". If you're on the game screen it waits until
  you leave it, so a game is never interrupted. No refreshing needed.
- **Version history:** the version button at the top right of the home screen.
  For each release, add an entry at the top of `src/lib/versions.ts`; that also
  sets the version number shown in the app. (Updates happen even if you forget,
  since every deploy gets its own build id; you just won't get the "what's new" note.)
- **Updating the database:** re-run `schema.sql`. It's safe to re-run and keeps
  all games and words.
- **Lost the invite link / new phone:** on a phone that still works, Settings ›
  Invite. If neither phone has it, run `select public.admin_new_room_key();`
  in the SQL Editor and open `https://YOUR-APP/#room=<the key>` on both phones.
- **Backups:** everything is in Supabase (Table Editor or Database › Backups).
- **Free tier note:** Supabase pauses free projects after a week with no
  activity. Playing regularly keeps it awake; if it does pause, click
  **Restore** in the dashboard.

## Development

```bash
npm install
cp .env.example .env      # fill in the two values
npm run dev               # http://localhost:5173
npm test                  # Wordle scoring (duplicate letters), stats, import parsing
PGURL=postgres://... npm run test:sql   # attacks the schema in a real Postgres
```

`npm run test:sql` creates a throwaway database, loads the schema the way Supabase
would, and checks 105 things: that the browser role can't read any table or call
internal functions, that the answer never appears in any response before you've
finished, simultaneous starts and finishes, stale second-device guesses, give up,
cancel, word selection, and that the SQL and TypeScript scoring agree on 6,000
word pairs.

```
supabase/schema.sql       tables, security, all game logic (Postgres functions)
supabase/dictionary.sql   guess dictionary
src/lib/wordle.ts         scoring reference + keyboard colours (with tests)
src/lib/stats.ts          every statistic and award (with tests)
src/lib/api.ts            typed calls to the database functions
src/lib/realtime.ts       broadcast pings + presence
src/lib/versions.ts       version history (top entry = app version)
src/lib/updates.ts        self-updating after each deploy (polls /version.json)
src/store.tsx             app state, realtime, polling fallback
src/screens/              Home, Game, Words, History, Stats, Settings, Onboarding
public/                   manifest, service worker, icons, words5.txt
scripts/build-dictionary.mjs   regenerates the dictionary
```
