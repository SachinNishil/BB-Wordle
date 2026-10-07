-- =====================================================================
-- BB Wordle: Wordle for two.  Supabase schema + server logic.
--
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Then run dictionary.sql the same way. Both files are safe to re-run
-- (re-running upgrades functions in place and keeps all your data).
--
-- SECURITY MODEL
-- * There is no sign-in. One private room is protected by a long random
--   room key that lives only on your two phones (via the invite link).
--   The database stores only its SHA-256 hash.
-- * Every table has Row Level Security switched on and NO policies, and
--   the anon/authenticated roles have no table privileges at all. The
--   browser cannot read or write a single row directly.
-- * Everything goes through the SECURITY DEFINER functions below, and
--   each one checks the room key first.
-- * The answer lives in game_secrets. No function returns it until the
--   asking player has finished their own round (or the game is over).
--   It is copied into games.word only when both players are done.
-- * Guesses are evaluated here, in Postgres. The browser only ever gets
--   the colour pattern for the guess it just submitted.
-- * Word play-tracking (times_played, last_played_at) is only updated
--   when a game completes, so the repository can't hint at a live answer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONFIGURATION  (edit these and re-run the file to change behaviour)
-- ---------------------------------------------------------------------

-- How the next word is picked.
create or replace function public.word_selection_settings()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    -- Never-played words always win while any are left.
    'prefer_unplayed',  true,
    -- Once everything has been played: a word can't come back until at
    -- least this many other games have been played since...
    'cooldown_games',   20,
    -- ...and at least this many days have passed.
    'cooldown_days',    10,
    -- Among eligible played words, the longer since a word was last
    -- played the likelier it is (weight = days_since ^ power). 0 = uniform.
    'age_weight_power', 1.0
  )
$$;

-- Fewer guesses always wins. Time only matters when you both solve in the
-- same number of guesses: true = the faster solver wins (a draw then needs
-- identical times), false = it's a draw.
create or replace function public.tiebreak_by_time()
returns boolean language sql immutable as $$ select true $$;

-- Seconds of "3, 2, 1" before the board unlocks.
create or replace function public.countdown_seconds()
returns numeric language sql immutable as $$ select 3.6 $$;

-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  key_hash    bytea not null unique,
  created_at  timestamptz not null default now()
);

-- Exactly two profiles per room: slot 1 (Sachin) and slot 2 (Menaka).
create table if not exists public.players (
  room_id  uuid not null references public.rooms on delete cascade,
  slot     smallint not null check (slot in (1, 2)),
  name     text not null check (char_length(name) between 1 and 24),
  photo    text check (photo is null or char_length(photo) <= 300000),
  primary key (room_id, slot)
);

create table if not exists public.words (
  id              bigint generated always as identity primary key,
  room_id         uuid not null references public.rooms on delete cascade,
  word            text not null check (word ~ '^[A-Z]{5}$'),
  added_by        smallint not null check (added_by in (1, 2)),
  in_dictionary   boolean not null default true,
  created_at      timestamptz not null default now(),
  times_played    int not null default 0,      -- updated only when a game COMPLETES
  last_played_at  timestamptz,                 -- updated only when a game COMPLETES
  unique (room_id, word)
);

create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms on delete cascade,
  game_number    int not null,
  status         text not null default 'waiting' check (status in
                   ('waiting','ready','live','player_one_complete','player_two_complete','completed')),
  created_by     smallint not null check (created_by in (1, 2)),
  created_at     timestamptz not null default now(),
  starts_at      timestamptz,          -- the synchronised "GO!" moment
  completed_at   timestamptz,
  word           text,                 -- NULL until status = completed
  word_added_by  smallint,             -- NULL until status = completed
  winner         smallint,             -- 1, 2, or NULL (draw / both failed)
  result         text check (result in ('win','draw','both_failed')),
  unique (room_id, game_number)
);
-- At most one unfinished game per room. Also settles the race where both
-- of you press START GAME at the same moment.
create unique index if not exists games_one_active_per_room
  on public.games (room_id) where status <> 'completed';

-- The answer. Never readable by the browser.
create table if not exists public.game_secrets (
  game_id   uuid primary key references public.games on delete cascade,
  word      text not null,
  word_id   bigint,
  added_by  smallint not null
);

-- Per-player progress. Holds colour patterns only, never letters.
create table if not exists public.game_players (
  game_id      uuid not null references public.games on delete cascade,
  slot         smallint not null check (slot in (1, 2)),
  status       text not null default 'waiting'
                 check (status in ('waiting','ready','playing','solved','failed')),
  joined_at    timestamptz,     -- opened the game screen
  started_at   timestamptz,     -- their personal clock started
  finished_at  timestamptz,
  duration_ms  int,
  guess_count  smallint not null default 0,
  patterns     text[] not null default '{}',   -- e.g. {'GYXXX','GGYXX'}
  gave_up      boolean not null default false,
  primary key (game_id, slot)
);

create table if not exists public.guesses (
  game_id     uuid not null references public.games on delete cascade,
  slot        smallint not null check (slot in (1, 2)),
  attempt     smallint not null check (attempt between 1 and 6),
  word        text not null,
  pattern     text not null check (pattern ~ '^[GYX]{5}$'),
  created_at  timestamptz not null default now(),
  primary key (game_id, slot, attempt)
);

create table if not exists public.dictionary (
  word text primary key check (word ~ '^[A-Z]{5}$')
);

create index if not exists words_room_idx on public.words (room_id);
create index if not exists games_room_idx on public.games (room_id, game_number desc);

-- Lock everything down. RLS on, no policies, no privileges.
do $$
declare t text;
begin
  foreach t in array array['rooms','players','words','games','game_secrets','game_players','guesses','dictionary'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. INTERNAL HELPERS  (not callable from the browser)
-- ---------------------------------------------------------------------

-- Standard Wordle scoring, including duplicate letters.
-- Returns 5 chars: G = right letter right place, Y = in the word
-- elsewhere, X = not in the word (or all copies already accounted for).
-- Mirrors src/lib/wordle.ts; tests/sql checks the two agree.
create or replace function public.evaluate_guess(p_guess text, p_answer text)
returns text language plpgsql immutable strict as $$
declare
  res    text[] := array['X','X','X','X','X'];
  counts int[]  := array_fill(0, array[26]);
  i int; c int;
begin
  if p_guess !~ '^[A-Z]{5}$' or p_answer !~ '^[A-Z]{5}$' then
    raise exception 'evaluate_guess expects two upper-case 5 letter words';
  end if;
  -- Pass 1: greens, and count the answer letters that are still unmatched.
  for i in 1..5 loop
    if substr(p_guess, i, 1) = substr(p_answer, i, 1) then
      res[i] := 'G';
    else
      c := ascii(substr(p_answer, i, 1)) - 64;
      counts[c] := counts[c] + 1;
    end if;
  end loop;
  -- Pass 2: yellows, left to right, only while unmatched copies remain.
  for i in 1..5 loop
    if res[i] <> 'G' then
      c := ascii(substr(p_guess, i, 1)) - 64;
      if counts[c] > 0 then
        res[i] := 'Y';
        counts[c] := counts[c] - 1;
      end if;
    end if;
  end loop;
  return array_to_string(res, '');
end $$;

create or replace function public._room(p_key text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare r uuid;
begin
  select id into r from rooms
   where key_hash = sha256(convert_to(coalesce(p_key, ''), 'UTF8'));
  if r is null then
    raise exception using message = 'bad_room_key', errcode = 'P0001';
  end if;
  return r;
end $$;

create or replace function public._check_slot(p_slot int)
returns void language plpgsql immutable as $$
begin
  if p_slot is null or p_slot not in (1, 2) then
    raise exception using message = 'bad_player', errcode = 'P0001';
  end if;
end $$;

create or replace function public._fail(p_code text, p_detail text default null)
returns void language plpgsql as $$
begin
  raise exception using message = p_code, errcode = 'P0001', detail = coalesce(p_detail, '');
end $$;

-- Pick the next answer for a room according to word_selection_settings().
create or replace function public._pick_word(p_room uuid)
returns table (word_id bigint, word text, added_by smallint)
language plpgsql volatile security definer set search_path = public as $$
declare
  s jsonb := word_selection_settings();
  v_cool_games int := coalesce((s->>'cooldown_games')::int, 0);
  v_cool_days  numeric := coalesce((s->>'cooldown_days')::numeric, 0);
  v_power      numeric := coalesce((s->>'age_weight_power')::numeric, 1);
begin
  -- 1. Never played.
  if coalesce((s->>'prefer_unplayed')::boolean, true) then
    return query
      select w.id, w.word, w.added_by from words w
       where w.room_id = p_room and w.times_played = 0
       order by random() limit 1;
    if found then return; end if;
  end if;

  -- 2. Eligible played words, weighted towards the longest-rested.
  --    (Efraimidis-Spirakis weighted sampling: smallest -ln(u)/weight wins.)
  return query
    with recent as (
      select g.word from games g
       where g.room_id = p_room and g.status = 'completed'
       order by g.game_number desc limit v_cool_games
    )
    select w.id, w.word, w.added_by from words w
     where w.room_id = p_room
       and w.word not in (select r.word from recent r where r.word is not null)
       and (w.last_played_at is null or w.last_played_at < now() - make_interval(secs => v_cool_days * 86400))
     order by -ln(1 - random()) /
              power(1 + extract(epoch from now() - coalesce(w.last_played_at, w.created_at)) / 86400, v_power)
              / (1 + w.times_played * 0.25)
     limit 1;
  if found then return; end if;

  -- 3. Small repository: everything is cooling down, so take the word
  --    that has rested longest (random among ties).
  return query
    select w.id, w.word, w.added_by from words w
     where w.room_id = p_room
     order by w.last_played_at asc nulls first, random()
     limit 1;
end $$;

-- What a given player is allowed to see about a game, as JSON.
create or replace function public._game_json(p_game uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g games; sec game_secrets; me game_players; op game_players;
  reveal boolean;
begin
  select * into g from games where id = p_game;
  if not found then return null; end if;
  select * into me from game_players where game_id = p_game and slot = p_slot;
  select * into op from game_players where game_id = p_game and slot = 3 - p_slot;
  reveal := g.status = 'completed' or me.status in ('solved', 'failed');
  if reveal then select * into sec from game_secrets where game_id = p_game; end if;

  return jsonb_build_object(
    'id', g.id, 'number', g.game_number, 'status', g.status,
    'created_by', g.created_by, 'created_at', g.created_at,
    'starts_at', g.starts_at, 'completed_at', g.completed_at,
    'winner', g.winner, 'result', g.result,
    'answer', case when reveal then sec.word end,
    'word_added_by', case when reveal then sec.added_by end,
    'me', jsonb_build_object(
      'slot', p_slot, 'status', me.status, 'joined_at', me.joined_at,
      'started_at', me.started_at, 'finished_at', me.finished_at,
      'duration_ms', me.duration_ms, 'guess_count', me.guess_count, 'gave_up', me.gave_up,
      'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', x.word, 'pattern', x.pattern) order by x.attempt)
                             from guesses x where x.game_id = p_game and x.slot = p_slot), '[]'::jsonb)),
    'partner', jsonb_build_object(
      'slot', 3 - p_slot, 'status', op.status, 'joined_at', op.joined_at,
      'started_at', op.started_at, 'finished_at', op.finished_at,
      'duration_ms', op.duration_ms, 'guess_count', op.guess_count, 'gave_up', op.gave_up,
      'patterns', to_jsonb(op.patterns),
      -- Their actual words only once the whole game is over.
      'guesses', case when g.status = 'completed' then
                   coalesce((select jsonb_agg(jsonb_build_object('word', x.word, 'pattern', x.pattern) order by x.attempt)
                               from guesses x where x.game_id = p_game and x.slot = 3 - p_slot), '[]'::jsonb)
                 end)
  );
end $$;

-- Called (with the game row locked) whenever a player finishes.
create or replace function public._after_finish(p_game uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  p1 game_players; p2 game_players; sec game_secrets;
  v_winner smallint; v_result text;
  done1 boolean; done2 boolean;
begin
  select * into p1 from game_players where game_id = p_game and slot = 1;
  select * into p2 from game_players where game_id = p_game and slot = 2;
  done1 := p1.status in ('solved', 'failed');
  done2 := p2.status in ('solved', 'failed');

  if done1 and done2 then
    if p1.status = 'solved' and p2.status = 'solved' then
      if p1.guess_count < p2.guess_count then v_winner := 1;
      elsif p2.guess_count < p1.guess_count then v_winner := 2;
      elsif tiebreak_by_time() and p1.duration_ms < p2.duration_ms then v_winner := 1;
      elsif tiebreak_by_time() and p2.duration_ms < p1.duration_ms then v_winner := 2;
      end if;
      v_result := case when v_winner is null then 'draw' else 'win' end;
    elsif p1.status = 'solved' then v_winner := 1; v_result := 'win';
    elsif p2.status = 'solved' then v_winner := 2; v_result := 'win';
    else v_result := 'both_failed';
    end if;

    select * into sec from game_secrets where game_id = p_game;
    update games set status = 'completed', completed_at = now(),
                     word = sec.word, word_added_by = sec.added_by,
                     winner = v_winner, result = v_result
     where id = p_game;
    update words set times_played = times_played + 1, last_played_at = now()
     where room_id = (select room_id from games where id = p_game) and word = sec.word;
  elsif done1 then
    update games set status = 'player_one_complete' where id = p_game;
  elsif done2 then
    update games set status = 'player_two_complete' where id = p_game;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. PUBLIC API  (the only things the browser can call)
--    Every function takes the room key; most take the player slot
--    (1 = Sachin, 2 = Menaka) chosen in Settings on that device.
-- ---------------------------------------------------------------------

-- First-time setup. Works exactly once per database: creates the room
-- and both profiles, and returns the room key for the invite link.
create or replace function public.create_room()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_key text; v_room uuid;
begin
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from rooms) then perform _fail('room_exists'); end if;
  v_key := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into rooms (key_hash) values (sha256(convert_to(v_key, 'UTF8'))) returning id into v_room;
  insert into players (room_id, slot, name) values (v_room, 1, 'Sachin'), (v_room, 2, 'Menaka');
  return jsonb_build_object('key', v_key);
end $$;

-- Is a room set up yet? (Lets the app choose between setup and "ask for link".)
create or replace function public.room_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rooms)
$$;

create or replace function public.get_room(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r uuid := _room(p_key);
begin
  return jsonb_build_object(
    'server_now', now(),
    'players', (select jsonb_agg(jsonb_build_object('slot', slot, 'name', name, 'photo', photo) order by slot)
                  from players where room_id = r),
    'active_game_id', (select id from games where room_id = r and status <> 'completed')
  );
end $$;

create or replace function public.update_player(p_key text, p_slot int, p_name text, p_photo text default null, p_clear_photo boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key);
begin
  perform _check_slot(p_slot);
  if p_name is not null and char_length(trim(p_name)) not between 1 and 24 then perform _fail('bad_name'); end if;
  if p_photo is not null and (char_length(p_photo) > 300000 or p_photo !~ '^data:image/(jpeg|png|webp);base64,') then
    perform _fail('bad_photo');
  end if;
  update players set
    name  = coalesce(nullif(trim(p_name), ''), name),
    photo = case when p_clear_photo then null else coalesce(p_photo, photo) end
   where room_id = r and slot = p_slot;
  return get_room(p_key);
end $$;

-- ---- Word repository -------------------------------------------------

create or replace function public.list_words(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r uuid := _room(p_key);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', id, 'word', word, 'added_by', added_by, 'in_dictionary', in_dictionary,
             'created_at', created_at, 'times_played', times_played, 'last_played_at', last_played_at)
           order by created_at desc, id desc)
      from words where room_id = r), '[]'::jsonb);
end $$;

-- Validates and imports a batch. Returns what happened to every word.
-- p_allow_unknown = true accepts words that aren't in the dictionary
-- (names, slang). They become guessable automatically.
create or replace function public.add_words(p_key text, p_slot int, p_words text[], p_allow_unknown boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r uuid := _room(p_key);
  raw text; w text; known boolean; existing smallint;
  seen text[] := '{}';
  added jsonb := '[]'; dups jsonb := '[]'; invalid jsonb := '[]'; unknown jsonb := '[]';
begin
  perform _check_slot(p_slot);
  if coalesce(array_length(p_words, 1), 0) > 5000 then perform _fail('too_many_words'); end if;
  foreach raw in array coalesce(p_words, '{}') loop
    w := upper(regexp_replace(coalesce(raw, ''), '\s', '', 'g'));
    continue when w = '';
    if w !~ '^[A-Z]{5}$' then
      invalid := invalid || to_jsonb(trim(raw));
      continue;
    end if;
    if w = any(seen) then
      dups := dups || jsonb_build_object('word', w, 'added_by', null, 'reason', 'repeated_in_list');
      continue;
    end if;
    seen := seen || w;
    select added_by into existing from words where room_id = r and word = w;
    if found then
      dups := dups || jsonb_build_object('word', w, 'added_by', existing, 'reason', 'already_in_repository');
      continue;
    end if;
    known := exists (select 1 from dictionary d where d.word = w);
    if not known and not p_allow_unknown then
      unknown := unknown || to_jsonb(w);
      continue;
    end if;
    insert into words (room_id, word, added_by, in_dictionary) values (r, w, p_slot, known);
    added := added || to_jsonb(w);
  end loop;
  return jsonb_build_object('added', added, 'duplicates', dups, 'invalid', invalid, 'unknown', unknown);
end $$;

-- Remove a word you added (fixing a typo, say). Past games keep their word.
create or replace function public.delete_word(p_key text, p_slot int, p_word_id bigint)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key);
begin
  perform _check_slot(p_slot);
  delete from words where id = p_word_id and room_id = r and added_by = p_slot;
  if not found then perform _fail('cannot_delete_word'); end if;
  return true;
end $$;

-- ---- Games -------------------------------------------------------------

create or replace function public.get_game_state(p_key text, p_slot int, p_game_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r uuid := _room(p_key); gid uuid;
begin
  perform _check_slot(p_slot);
  if p_game_id is null then
    select id into gid from games where room_id = r and status <> 'completed';
  else
    select id into gid from games where id = p_game_id and room_id = r;
  end if;
  return jsonb_build_object('server_now', now(), 'game', case when gid is null then null else _game_json(gid, p_slot) end);
end $$;

-- Either player can start a game when none is active. If one already is
-- (say you both pressed START at once) you simply get that game back.
create or replace function public.start_game(p_key text, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r uuid := _room(p_key);
  gid uuid; pick record; n int;
begin
  perform _check_slot(p_slot);
  perform 1 from rooms where id = r for update;     -- serialise starts in this room
  select id into gid from games where room_id = r and status <> 'completed';
  if gid is not null then
    return jsonb_build_object('server_now', now(), 'already_active', true, 'game', _game_json(gid, p_slot));
  end if;

  select * into pick from _pick_word(r);
  if pick.word is null then perform _fail('no_words'); end if;

  select coalesce(max(game_number), 0) + 1 into n from games where room_id = r;
  insert into games (room_id, game_number, created_by) values (r, n, p_slot) returning id into gid;
  insert into game_secrets (game_id, word, word_id, added_by) values (gid, pick.word, pick.word_id, pick.added_by);
  insert into game_players (game_id, slot, status, joined_at) values
    (gid, 1, case when p_slot = 1 then 'ready' else 'waiting' end, case when p_slot = 1 then now() end),
    (gid, 2, case when p_slot = 2 then 'ready' else 'waiting' end, case when p_slot = 2 then now() end);
  return jsonb_build_object('server_now', now(), 'already_active', false, 'game', _game_json(gid, p_slot));
end $$;

-- "I'm here." When both players have joined, the shared countdown is set.
-- p_play_now = true starts the countdown without waiting for the partner
-- (they get their own countdown whenever they arrive).
create or replace function public.join_game(p_key text, p_slot int, p_game_id uuid, p_play_now boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key); g games; both_in boolean;
begin
  perform _check_slot(p_slot);
  select * into g from games where id = p_game_id and room_id = r for update;
  if not found then perform _fail('game_not_found'); end if;
  if g.status <> 'completed' then
    update game_players set joined_at = coalesce(joined_at, now()),
                            status = case when status = 'waiting' then 'ready' else status end
     where game_id = g.id and slot = p_slot;
    select count(*) = 2 into both_in from game_players where game_id = g.id and joined_at is not null;
    if g.status = 'waiting' and (both_in or p_play_now) then
      update games set status = 'ready',
                       starts_at = now() + make_interval(secs => countdown_seconds())
       where id = g.id;
    end if;
  end if;
  return jsonb_build_object('server_now', now(), 'game', _game_json(g.id, p_slot));
end $$;

-- Starts this player's clock. Called when their countdown hits GO.
create or replace function public.begin_round(p_key text, p_slot int, p_game_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key); g games;
begin
  perform _check_slot(p_slot);
  select * into g from games where id = p_game_id and room_id = r for update;
  if not found then perform _fail('game_not_found'); end if;
  if g.status = 'waiting' or g.starts_at is null then perform _fail('not_started'); end if;
  if now() < g.starts_at - interval '1.5 seconds' then perform _fail('too_early'); end if;
  update game_players set status = 'playing',
                          joined_at = coalesce(joined_at, now()),
                          started_at = greatest(now(), g.starts_at)
   where game_id = g.id and slot = p_slot and status in ('waiting', 'ready');
  if g.status = 'ready' then update games set status = 'live' where id = g.id; end if;
  return jsonb_build_object('server_now', now(), 'game', _game_json(g.id, p_slot));
end $$;

-- Submit one guess. p_attempt is the attempt number the device thinks it
-- is on (1-6); a mismatch means another device already played it, and
-- the call is refused instead of double-counting.
create or replace function public.submit_guess(p_key text, p_slot int, p_game_id uuid, p_guess text, p_attempt int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r uuid := _room(p_key);
  g games; me game_players; sec game_secrets;
  w text := upper(trim(coalesce(p_guess, '')));
  pat text; v_status text; finished boolean;
begin
  perform _check_slot(p_slot);
  -- Lock the game first: all guesses in a game are serialised, which is
  -- what makes "both finish at the same instant" safe.
  select * into g from games where id = p_game_id and room_id = r for update;
  if not found then perform _fail('game_not_found'); end if;
  if g.status = 'completed' then perform _fail('game_over'); end if;
  select * into me from game_players where game_id = g.id and slot = p_slot for update;
  if me.status in ('solved', 'failed') then perform _fail('already_finished'); end if;

  if me.status <> 'playing' then
    if g.status = 'waiting' or g.starts_at is null or now() < g.starts_at - interval '1.5 seconds' then
      perform _fail('not_started');
    end if;
    update game_players set status = 'playing', joined_at = coalesce(joined_at, now()),
                            started_at = greatest(now(), g.starts_at)
     where game_id = g.id and slot = p_slot
     returning * into me;
  end if;

  if p_attempt is distinct from me.guess_count + 1 then
    perform _fail('stale_attempt', me.guess_count::text);
  end if;
  if w !~ '^[A-Z]{5}$' then perform _fail('invalid_guess'); end if;

  select * into sec from game_secrets where game_id = g.id;
  if w <> sec.word
     and not exists (select 1 from dictionary d where d.word = w)
     and not exists (select 1 from words x where x.room_id = r and x.word = w) then
    perform _fail('not_a_word');
  end if;

  pat := evaluate_guess(w, sec.word);
  insert into guesses (game_id, slot, attempt, word, pattern) values (g.id, p_slot, p_attempt, w, pat);

  v_status := case when pat = 'GGGGG' then 'solved' when p_attempt >= 6 then 'failed' else 'playing' end;
  finished := v_status <> 'playing';
  update game_players set
      guess_count = p_attempt,
      patterns    = patterns || pat,
      status      = v_status,
      finished_at = case when finished then now() end,
      duration_ms = case when finished then (extract(epoch from now() - started_at) * 1000)::int end
   where game_id = g.id and slot = p_slot;

  if g.status = 'ready' then update games set status = 'live' where id = g.id; end if;
  if finished then perform _after_finish(g.id); end if;

  return jsonb_build_object('server_now', now(), 'pattern', pat, 'attempt', p_attempt,
                            'game', _game_json(g.id, p_slot));
end $$;

-- Concede your own round (counts as a failed round). Your partner keeps playing.
create or replace function public.give_up(p_key text, p_slot int, p_game_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key); g games;
begin
  perform _check_slot(p_slot);
  select * into g from games where id = p_game_id and room_id = r for update;
  if not found then perform _fail('game_not_found'); end if;
  if g.status = 'completed' then perform _fail('game_over'); end if;
  if g.status = 'waiting' then perform _fail('not_started'); end if;
  update game_players set status = 'failed', gave_up = true,
                          started_at = coalesce(started_at, now()),
                          finished_at = now(),
                          duration_ms = (extract(epoch from now() - coalesce(started_at, now())) * 1000)::int
   where game_id = g.id and slot = p_slot and status not in ('solved', 'failed');
  if not found then perform _fail('already_finished'); end if;
  if g.status = 'ready' then update games set status = 'live' where id = g.id; end if;
  perform _after_finish(g.id);
  return jsonb_build_object('server_now', now(), 'game', _game_json(g.id, p_slot));
end $$;

-- Call off a game nobody has guessed in yet. It leaves no trace.
create or replace function public.cancel_game(p_key text, p_slot int, p_game_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare r uuid := _room(p_key); g games;
begin
  perform _check_slot(p_slot);
  select * into g from games where id = p_game_id and room_id = r for update;
  if not found then perform _fail('game_not_found'); end if;
  if g.status = 'completed'
     or exists (select 1 from game_players where game_id = g.id and (guess_count > 0 or status in ('solved','failed'))) then
    perform _fail('cannot_cancel');
  end if;
  delete from games where id = g.id;
  return true;
end $$;

-- Completed games, newest first, with both boards. p_limit null = all.
create or replace function public.get_history(p_key text, p_limit int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r uuid := _room(p_key);
begin
  return coalesce((
    select jsonb_agg(row_json order by gn desc) from (
      select g.game_number gn, jsonb_build_object(
        'id', g.id, 'number', g.game_number, 'created_at', g.created_at, 'created_by', g.created_by,
        'starts_at', g.starts_at, 'completed_at', g.completed_at, 'word', g.word, 'word_added_by', g.word_added_by,
        'winner', g.winner, 'result', g.result,
        'players', (select jsonb_agg(jsonb_build_object(
                       'slot', p.slot, 'status', p.status, 'guess_count', p.guess_count,
                       'duration_ms', p.duration_ms, 'started_at', p.started_at, 'finished_at', p.finished_at,
                       'gave_up', p.gave_up,
                       'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', x.word, 'pattern', x.pattern) order by x.attempt)
                                              from guesses x where x.game_id = g.id and x.slot = p.slot), '[]'::jsonb))
                     order by p.slot)
                      from game_players p where p.game_id = g.id)
      ) row_json
      from games g
      where g.room_id = r and g.status = 'completed'
      order by g.game_number desc
      limit p_limit
    ) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. RECOVERY  (run by hand in the SQL editor, never from the app)
--    Lost the invite link?  select public.admin_new_room_key();
--    It returns a fresh key; open  https://YOUR-APP/#room=<key>  on both
--    phones. The old link stops working. All data is kept.
-- ---------------------------------------------------------------------
create or replace function public.admin_new_room_key()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_key text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update rooms set key_hash = sha256(convert_to(v_key, 'UTF8'));
  return v_key;
end $$;

-- ---------------------------------------------------------------------
-- 6. PERMISSIONS
-- ---------------------------------------------------------------------
do $$
declare f record; role_name text;
begin
  -- Nothing is executable by default...
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'word_selection_settings','tiebreak_by_time','countdown_seconds','evaluate_guess',
              '_room','_check_slot','_fail','_pick_word','_game_json','_after_finish',
              'create_room','room_exists','get_room','update_player','list_words','add_words','delete_word',
              'get_game_state','start_game','join_game','begin_round','submit_guess','give_up','cancel_game',
              'get_history','admin_new_room_key') loop
    execute format('revoke all on function %s from public', f.sig);
    foreach role_name in array array['anon','authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', f.sig, role_name);
      end if;
    end loop;
  end loop;
  -- ...except the public API.
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'create_room','room_exists','get_room','update_player','list_words','add_words','delete_word',
              'get_game_state','start_game','join_game','begin_round','submit_guess','give_up','cancel_game',
              'get_history') loop
    foreach role_name in array array['anon','authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('grant execute on function %s to %I', f.sig, role_name);
      end if;
    end loop;
  end loop;
end $$;
