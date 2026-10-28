import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Board, REVEAL_MS } from '../components/Board';
import { BadgeChips } from '../components/Badges';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { Keyboard, shuffledRows } from '../components/Keyboard';
import { PartnerMini, RoundElapsed, SideCard, WatchingEye } from '../components/Live';
import { fromGameView, ResultsView } from '../components/Results';
import { DarkOverlay, FreezeOverlay, partnerHitEmoji, PowerBar, PowerPicker, SabBanner, useIncoming, useSabNews } from '../components/Sabotage';
import { HiddenWord, WordTiles } from '../components/Tiles';
import { Soundboard, TrashTalk, useFeedTaunts } from '../components/TrashTalk';
import { api, ApiError } from '../lib/api';
import { serverNow } from '../lib/clock';
import { loadDictionary } from '../lib/dictionary';
import type { GameView, Slot } from '../lib/types';
import { keyboardStates } from '../lib/wordle';
import { back, go } from '../router';
import { useStore } from '../store';

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

type Phase = 'loading' | 'none' | 'setting' | 'readycheck' | 'waiting' | 'countdown' | 'playing' | 'finished' | 'results';

function phaseOf(g: GameView | null, loaded: boolean): Phase {
  if (!g) return loaded ? 'none' : 'loading';
  if (g.status === 'completed') return 'results';
  if (g.me.status === 'solved' || g.me.status === 'failed') return 'finished';
  if (g.me.status === 'playing') return 'playing';
  if (g.status === 'setting') return 'setting';
  // Challenge: once both words are in, each of you taps Ready.
  if (g.mode === 'challenge' && g.status === 'waiting' && !g.me.joined_at) return 'readycheck';
  if (g.status === 'waiting' || !g.starts_at) return 'waiting';
  return 'countdown';
}

export function GameScreen({ id }: { id?: string }) {
  const store = useStore();
  const { slot, players, active, activeLoaded, pulse, ping, toast, reportError, setActive, sendTyping, partnerTyping, setQuietInvites, partnerPresence } = store;
  const [rematching, setRematching] = useState(false);
  const [gameId, setGameId] = useState<string | null>(id ?? null);
  const [game, setGame] = useState<GameView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [bounceRow, setBounceRow] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [cdTarget, setCdTarget] = useState<number | null>(null);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const [changing, setChanging] = useState(false);
  const joining = useRef(false);
  const beginning = useRef(false);
  const prevPartner = useRef<string | null>(null);
  // Spectator mode (v1.4): once my round is over, watch my partner's board.
  const [watch, setWatch] = useState<'partner' | 'mine' | null>(null);
  const [showWord, setShowWord] = useState(false);
  const [partnerReveal, setPartnerReveal] = useState<number | null>(null);
  const sawPlaying = useRef(false);
  const prevPartnerCount = useRef<number | null>(null);
  // v1.17: when a guess ends the whole game, finish the flip (and the bounce) before
  // the results take over, for the player and for whoever is watching.
  const [holdMine, setHoldMine] = useState(false);
  const [holdPartner, setHoldPartner] = useState(false);

  const me = slot ? players[slot] : null;
  const partner = slot ? players[(3 - slot) as 1 | 2] : null;

  // Lock on to the active game once we know it.
  useEffect(() => {
    if (!gameId && active) setGameId(active.id);
  }, [active, gameId]);

  const apply = useCallback(
    (g: GameView | null) => {
      setGame(g);
      setLoaded(true);
      if (g) setActive(g);
    },
    [setActive],
  );

  const reload = useCallback(async () => {
    if (!slot) return;
    if (!gameId) {
      if (activeLoaded && !active) setLoaded(true);
      return;
    }
    try {
      const s = await api.getGameState(slot, gameId);
      if (!s.game) {
        setGame(null);
        setLoaded(true);
        return;
      }
      setGame(s.game);
      setLoaded(true);
    } catch (e) {
      if (!(e instanceof ApiError && e.network)) reportError(e);
    }
  }, [slot, gameId, active, activeLoaded, reportError]);

  useEffect(() => {
    void reload();
  }, [reload, pulse]);

  const phase = phaseOf(game, loaded);
  const endless = game?.mode === 'endless';
  // v1.21 Sabotage: what's hitting me right now.
  const sabotage = game?.mode === 'sabotage';
  const incoming = useIncoming(sabotage ? game : null, slot);
  useSabNews(sabotage ? game : null, slot, partner);
  const sabRef = useRef(incoming);
  sabRef.current = incoming;
  // Ghost letter types itself in (once); Forced first puts its letter first.
  const ghost = phase === 'playing' ? incoming.has('ghost') : null;
  const ghostDone = useRef<number | null>(null);
  useEffect(() => {
    if (!ghost || ghostDone.current === ghost.id) return;
    ghostDone.current = ghost.id;
    const l = 'ABCDEFGHIJKLMNOPRSTUVWY'[Math.floor(Math.random() * 23)];
    setTyped((t) => (t.length < 5 ? t + l : t));
  }, [ghost]);
  const forced = phase === 'playing' ? incoming.has('first') : null;
  useEffect(() => {
    if (forced?.letter && !typed.startsWith(forced.letter)) setTyped((t) => (forced.letter! + t).slice(0, 5));
  }, [forced?.id, typed]); // eslint-disable-line react-hooks/exhaustive-deps

  // v1.20: the waiting room is back (it lives right here, for all three modes).

  // v1.19: leaving a round (app minimised, or back to Home) stops my clock;
  // coming back carries on. Nothing is counted while I'm away.
  const playingId = phase === 'playing' && game ? game.id : null;
  useEffect(() => {
    if (!playingId || !slot) return;
    const send = (paused: boolean) => api.pauseRound(slot, playingId, paused).then((r) => { if (r.game && !paused) apply(r.game); ping('game', 'pause'); }).catch(() => {});
    if (document.visibilityState === 'visible') void send(false);
    const vis = () => void send(document.visibilityState !== 'visible');
    const hide = () => void send(true);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', hide);
      void send(true);
    };
  }, [playingId, slot]); // eslint-disable-line react-hooks/exhaustive-deps
  useFeedTaunts(game, slot);
  if (phase === 'playing') sawPlaying.current = true;
  const finishedNow = phase === 'finished' && revealRow === null;

  // Straight after finishing, let the win (or the answer) sink in, then switch to watching.
  useEffect(() => {
    if (!finishedNow || watch) return;
    const t = setTimeout(() => setWatch('partner'), sawPlaying.current ? 2400 : 0);
    return () => clearTimeout(t);
  }, [finishedNow, watch]);

  // Live typing (v1.5): while my partner watches (they've finished), send the
  // letters in my current row as I type them, and every few seconds so a
  // partner who just opened spectator mode catches up.
  const partnerDone = game?.partner.status === 'solved' || game?.partner.status === 'failed';
  const myRow = game?.me.guess_count ?? 0;
  const gid = game?.id;
  useEffect(() => {
    if (phase !== 'playing' || !partnerDone || !gid) return;
    sendTyping(gid, myRow, typed);
    const t = setInterval(() => sendTyping(gid, myRow, typed), 3000);
    return () => clearInterval(t);
  }, [phase, partnerDone, gid, myRow, typed, sendTyping]);
  // v1.11: my partner has finished and is on the game screen, so they're watching me.
  const partnerWatching = phase === 'playing' && partnerDone && partnerPresence.some((p) => p.screen === 'game');
  const wasWatched = useRef(false);
  useEffect(() => {
    if (partnerWatching && !wasWatched.current && slot) toast(`👀 ${players[(3 - slot) as Slot].name} is watching you`);
    wasWatched.current = partnerWatching;
  }, [partnerWatching]); // eslint-disable-line react-hooks/exhaustive-deps
  // Backup (v1.6.1): also save the row to the server (a moment after typing stops),
  // so a spectator sees it even if the live connection on either phone has dropped
  // or this phone hasn't heard yet that they finished. The server only shows it to
  // a partner whose own round is over.
  const draftSent = useRef('');
  useEffect(() => {
    if (phase !== 'playing' || !gid || !slot) return;
    const key = `${gid}|${myRow}|${typed}`;
    if (draftSent.current === key) return;
    const t = setTimeout(() => {
      draftSent.current = key;
      api.setDraft(slot, gid, myRow, typed).catch(() => { draftSent.current = ''; });
    }, typed ? 250 : 0);
    return () => clearTimeout(t);
  }, [phase, gid, slot, myRow, typed]);

  // Rematch (v1.6.1): on the results screen, a new game from my partner turns the
  // Rematch button into "Join rematch" instead of popping up a notice.
  useEffect(() => {
    setQuietInvites(phase === 'results');
    return () => setQuietInvites(false);
  }, [phase, setQuietInvites]);
  const nextGame = phase === 'results' && active && game && active.id !== game.id ? active : null;
  const invitedBy = nextGame && slot && nextGame.created_by !== slot ? players[nextGame.created_by] : null;
  useEffect(() => {
    if (invitedBy) navigator.vibrate?.([30, 60, 30]);
  }, [invitedBy?.slot, nextGame?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rematch() {
    if (!game || !slot) return;
    if (nextGame) return go(`/game/${nextGame.id}`, true);
    setRematching(true);
    try {
      const s = await api.startGame(slot, game.mode ?? 'classic');
      setActive(s.game);
      ping('game', s.already_active ? 'joined' : game.mode === 'challenge' ? 'challenged' : 'started');
      if (s.game) go(`/game/${s.game.id}`, true);
    } catch (e) {
      reportError(e);
    } finally {
      setRematching(false);
    }
  }

  // Chat (v1.7): mark my partner's messages seen once they're on my game screen.
  const unseenTop = (game?.taunts ?? []).filter((t) => slot && t.from !== slot && !t.seen).reduce((m, t) => Math.max(m, t.id), 0);
  useEffect(() => {
    if (!unseenTop || !slot || !gid || document.visibilityState !== 'visible') return;
    api.markTauntsSeen(slot, gid, unseenTop).then(() => ping('game', 'seen')).catch(() => {});
  }, [unseenTop, slot, gid, ping]);

  // Flip in each new row my partner plays while I'm watching.
  const partnerCount = game?.partner.guesses ? game.partner.guesses.length : null;
  useEffect(() => {
    const prev = prevPartnerCount.current;
    prevPartnerCount.current = partnerCount;
    if (prev === null || partnerCount === null || partnerCount !== prev + 1) return;
    setPartnerReveal(partnerCount - 1);
    const t = setTimeout(() => setPartnerReveal(null), REVEAL_MS);
    let h: ReturnType<typeof setTimeout> | undefined;
    if (game?.status === 'completed') {
      setHoldPartner(true);
      h = setTimeout(() => setHoldPartner(false), REVEAL_MS + 1100);
    }
    return () => { clearTimeout(t); if (h) clearTimeout(h); };
  }, [partnerCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // The render that first sees their final row comes before the effect above runs.
  const partnerJustPlayed = prevPartnerCount.current !== null && partnerCount !== null && partnerCount === prevPartnerCount.current + 1;

  // Opening the game screen means "I'm here".
  useEffect(() => {
    if (!game || !slot || joining.current) return;
    if (game.status === 'completed' || game.me.joined_at) return;
    // v1.20: opening the game screen means "I'm in the room" in every mode, challenge included.
    joining.current = true;
    api
      .joinGame(slot, game.id)
      .then((s) => {
        apply(s.game);
        ping('game', 'joined');
      })
      .catch(reportError)
      .finally(() => (joining.current = false));
  }, [game, slot, apply, ping, reportError]);

  // Decide the countdown: the shared one if we're on time, a personal one if we arrive late.
  useEffect(() => {
    if (phase !== 'countdown' || !game?.starts_at) {
      if (phase !== 'countdown') setCdTarget(null);
      return;
    }
    setCdTarget((t) => {
      if (t) return t;
      const shared = Date.parse(game.starts_at!);
      return shared - serverNow() > -1200 ? shared : serverNow() + 3200;
    });
  }, [phase, game?.starts_at]);

  const begin = useCallback(async () => {
    if (!game || !slot || beginning.current) return;
    beginning.current = true;
    const attempt = async (tries: number): Promise<void> => {
      try {
        const s = await api.beginRound(slot, game.id);
        apply(s.game);
        ping('game', 'began');
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'too_early' || e.network) && tries < 6) {
          await new Promise((r) => setTimeout(r, 700));
          return attempt(tries + 1);
        }
        reportError(e);
        void reload();
      }
    };
    await attempt(0);
    beginning.current = false;
  }, [game, slot, apply, ping, reportError, reload]);

  // Partner news, once each.
  useEffect(() => {
    if (!game || !partner) return;
    const now = game.partner.status;
    const before = prevPartner.current;
    prevPartner.current = now;
    if (before === null || before === now) return;
    const stillGoing = game.me.status !== 'solved' && game.me.status !== 'failed';
    if (now === 'solved') {
      navigator.vibrate?.([40, 50, 40]);
      toast(`🏆 ${partner.name} solved it in ${game.partner.guess_count}!`, 'win');
    } else if (now === 'failed' && stillGoing) {
      toast(`${partner.name} ran out of guesses`, 'info');
    } else if (before === 'waiting' && (now === 'ready' || now === 'playing')) {
      toast(game.mode === 'challenge' ? `${partner.name} is ready` : `${partner.name} is here`, 'info');
    }
  }, [game, partner, toast]);

  const revealing = revealRow !== null;

  const doShake = useCallback(
    (msg: string) => {
      setShake(true);
      navigator.vibrate?.(60);
      toast(msg);
      setTimeout(() => setShake(false), 600);
    },
    [toast],
  );

  const submit = useCallback(async () => {
    if (!game || !slot) return;
    const word = typed;
    if (word.length < 5) return doShake('Not enough letters');
    const dict = await loadDictionary();
    if (dict.size > 0 && !dict.has(word)) return doShake('Not in word list');
    setSubmitting(true);
    const row = game.me.guess_count;
    try {
      const r = await api.submitGuess(slot, game.id, word, row + 1);
      setTyped('');
      setRevealRow(row);
      if (r.game?.status === 'completed') {
        setHoldMine(true);
        setTimeout(() => setHoldMine(false), REVEAL_MS + (r.pattern === 'GGGGG' ? 1300 : 1100));
      }
      apply(r.game);
      const finished = r.game?.me.status === 'solved' || r.game?.me.status === 'failed';
      ping('game', finished ? 'finished' : 'guess');
      setTimeout(() => {
        setRevealRow(null);
        if (r.pattern === 'GGGGG') {
          setBounceRow(row);
          toast(PRAISE[row] ?? 'Solved!', 'win');
          setTimeout(() => setBounceRow(null), 1200);
        } else if (r.game?.me.status === 'failed') {
          toast(r.game.answer ?? 'Out of guesses', 'info');
        }
      }, REVEAL_MS);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_a_word') doShake('Not in word list');
      else if (e instanceof ApiError && e.code === 'stale_attempt') {
        setTyped('');
        toast('Updated from your other device');
        void reload();
      } else if (e instanceof ApiError && e.network) toast("Couldn't send that guess. Check your connection and press Enter again.", 'error');
      else {
        reportError(e);
        void reload();
      }
    } finally {
      setSubmitting(false);
    }
  }, [game, slot, typed, apply, ping, toast, doShake, reportError, reload]);

  // v1.20 challenge: the words are picked in the waiting room, once you're both in it.
  const bothIn = !!game && !!game.me.joined_at && !!game.partner.joined_at && game.partner.here;
  const inRoom = !!game && (phase === 'waiting' || phase === 'readycheck' || (phase === 'setting' && !bothIn));
  const picking = phase === 'setting' && !!game && bothIn && (!game.i_have_set || changing);

  const submitPick = useCallback(async () => {
    if (!game || !slot) return;
    if (pick.length < 5) return doShake('Not enough letters');
    const dict = await loadDictionary();
    if (dict.size > 0 && !dict.has(pick)) return doShake('Not in word list');
    setSubmitting(true);
    try {
      const r = await api.setChallengeWord(slot, game.id, pick);
      apply(r.game);
      setChanging(false);
      setPick('');
      ping('game', 'word-set');
      toast(`${pick} is set for ${partner?.name ?? 'your partner'}`, 'win');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_a_word') doShake('Not in word list');
      else {
        reportError(e);
        void reload();
      }
    } finally {
      setSubmitting(false);
    }
  }, [game, slot, pick, apply, ping, toast, doShake, reportError, reload, partner]);

  const onKey = useCallback(
    (k: string) => {
      if (picking && !submitting) {
        if (k === 'Enter') void submitPick();
        else if (k === 'Backspace') setPick((t) => t.slice(0, -1));
        else if (/^[a-z]$/i.test(k)) setPick((t) => (t.length < 5 ? t + k.toUpperCase() : t));
        return;
      }
      if (phase !== 'playing' || submitting || revealing) return;
      const sab = sabRef.current;
      if (sab.has('freeze')) return;
      if (k === 'Enter') void submit();
      else if (k === 'Backspace') {
        const f = sab.has('first');
        setTyped((t) => (f && t.length <= 1 ? t : t.slice(0, -1)));
      } else if (/^[a-z]$/i.test(k)) {
        const L = k.toUpperCase();
        const ban = sab.has('ban');
        if (ban && ban.letter === L) { navigator.vibrate?.(60); return; }
        const sticky = sab.has('sticky');
        const add = sticky && sticky.letter === L ? L + L : L;
        setTyped((t) => (t + add).slice(0, 5));
      }
    },
    [phase, submitting, revealing, submit, picking, submitPick],
  );

  // Physical keyboard.
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    // The button that brought us here may still hold focus while disabled,
    // which makes the browser drop the first keystroke. Let it go.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
        e.preventDefault();
        keyRef.current(e.key);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  async function cancel() {
    if (!game || !slot) return;
    setBusy(true);
    try {
      await api.cancelGame(slot, game.id);
      setActive(null);
      ping('game', 'cancelled');
      go('/', true);
    } catch (e) {
      reportError(e);
      void reload();
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    if (!game || !slot) return;
    setConfirmGiveUp(false);
    try {
      const s = await api.giveUp(slot, game.id);
      apply(s.game);
      ping('game', 'finished');
    } catch (e) {
      reportError(e);
    }
  }

  async function nudge() {
    const text = `Wordle battle is on! Open BB Wordle: ${location.origin}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied a nudge to send');
      }
    } catch {
      /* cancelled */
    }
  }

  if (!me || !partner) return null;

  // ------------------------------------------------------------------ views
  if (phase === 'loading') {
    return (
      <div className="screen center">
        <div className="loader" aria-label="Loading" />
      </div>
    );
  }

  if (phase === 'none') {
    return (
      <div className="screen center">
        <p className="empty-emoji" aria-hidden="true">🌙</p>
        <h2>No game right now</h2>
        <p className="muted">Start one from the home screen.</p>
        <button className="btn primary" onClick={() => go('/', true)}>Go home</button>
      </div>
    );
  }

  const holdingMine = phase === 'results' && holdMine;
  const holdingSpectate = phase === 'results' && !holdMine && !!watch && (holdPartner || partnerJustPlayed);
  if (phase === 'results' && game && !holdingMine && !holdingSpectate) {
    return (
      <div className="screen scroll">
        <header className="topbar">
          <button className="iconbtn" onClick={() => go('/', true)} aria-label="Home"><Icon name="back" /></button>
          <h1 className="topbar-title">Game #{game.number}</h1>
          <div className="topbar-right" />
        </header>
        <ResultsView data={fromGameView(game)} isToday />
        <div className="stack pad">
          {slot && <TrashTalk game={game} slot={slot} players={players} onGame={apply} variant="card" />}
          <div className="rematch">
            {invitedBy && <p className="rematch-note">🔁 {invitedBy.name} is up for a rematch</p>}
            <button className={`btn primary big${invitedBy ? ' glow' : ''}`} onClick={rematch} disabled={rematching}>
              {invitedBy ? 'JOIN REMATCH' : nextGame ? 'BACK TO THE REMATCH' : game.mode === 'challenge' ? 'REMATCH ⚔️' : 'REMATCH'}
            </button>
            <button className="btn text" onClick={() => go('/', true)}>Back home</button>
          </div>
        </div>
      </div>
    );
  }

  if (inRoom && game) {
    const partnerIn = !!game.partner.joined_at && game.partner.here;
    const emoji = game.mode === 'challenge' ? '⚔️' : game.mode === 'endless' ? '♾️' : game.mode === 'sabotage' ? '😈' : '🟩';
    const ready = !sabotage || (!!game.sab?.powers && game.sab.partner_ready);
    return (
      <div className="screen waiting room">
        <header className="topbar">
          <button className="iconbtn" onClick={() => go('/', true)} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">{game.mode === 'challenge' ? 'Challenge ⚔️' : game.mode === 'endless' ? 'Endless ♾️' : sabotage ? 'Sabotage 😈' : 'Classic'}</h1>
          <div className="topbar-right" />
        </header>
        <div className="waiting-body">
          <div className="waiting-couple">
            <span className="room-seat in"><Avatar player={me} size={84} ring /><span className="room-tick">✓</span></span>
            <span className="beat" aria-hidden="true">{emoji}</span>
            <span className={`room-seat${partnerIn ? ' in' : ''}`}><Avatar player={partner} size={84} ring={partnerIn} />{partnerIn && <span className="room-tick">✓</span>}</span>
          </div>
          <h2 className="waiting-title" role="status">{partnerIn ? (game.mode === 'challenge' ? 'Both in!' : ready ? 'Starting…' : 'Both in!') : <>Waiting for {partner.name}<span className="room-dots" aria-hidden="true"><i /><i /><i /></span></>}</h2>
          {sabotage && slot && <PowerPicker game={game} slot={slot} partner={partner} onGame={apply} />}
          <button className="btn text" onClick={cancel} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  if (phase === 'setting' && game) {
    return (
      <div className="screen game pick-screen">
        <header className="topbar">
          <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">Challenge ⚔️</h1>
          <div className="topbar-right" />
        </header>
        <div className="pick-body">
          <div className="waiting-couple small">
            <Avatar player={me} size={52} ring />
            <span className="pick-arrow" aria-hidden="true">⚔️</span>
            <Avatar player={partner} size={52} />
          </div>
          {picking ? (
            <>
              <p className="eyebrow">Your word for {partner.name}</p>
              <h2 className="waiting-title">Pick a word for {partner.name}</h2>
              <p className="muted small">{partner.name} gets 6 guesses to find it. Any real 5-letter word works.</p>
              <div className={`row pick-row${shake ? ' shake' : ''}`} style={{ ['--tile' as string]: '54px' }} aria-label="Your word">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`tile ${pick[i] ? 'filled' : ''}`}>{pick[i] ?? ''}</div>
                ))}
              </div>
              {changing && <button className="btn text small" onClick={() => { setChanging(false); setPick(''); }}>Keep {game.my_challenge_word}</button>}
            </>
          ) : (
            <>
              <p className="eyebrow">Your word for {partner.name}</p>
              <WordTiles word={game.my_challenge_word ?? ''} size={46} />
              <button className="btn text small" onClick={() => setChanging(true)}>Change word</button>
            </>
          )}
          <p className={`pick-status${game.partner_has_set ? ' done' : ''}`}>
            {game.partner_has_set ? (
              <>✅ {partner.name} has picked your word</>
            ) : (
              <><span className="loader small" aria-hidden="true" /> Waiting for {partner.name} to pick a word for you</>
            )}
          </p>
          {!picking && (
            <div className="stack">
              <button className="btn soft" onClick={nudge}><Icon name="share" size={18} /> Send {partner.name} a nudge</button>
              <button className="btn text" onClick={cancel} disabled={busy}>Call off this challenge</button>
            </div>
          )}
        </div>
        {picking && <Keyboard states={{}} onKey={onKey} disabled={submitting} />}
      </div>
    );
  }



  if (!game) return null;



  if ((finishedNow || holdingSpectate) && watch && slot) {
    const theirs = watch === 'partner';
    const pg = game.partner.guesses ?? [];
    const notStarted = game.partner.status === 'waiting' || game.partner.status === 'ready';
    const theirWord = game.mode === 'challenge' ? game.partner_answer : game.answer;
    // Live typing: the newer of the live message and the server's copy.
    const fromLive = partnerTyping && partnerTyping.game === game.id && partnerTyping.row === pg.length
      && Date.now() - partnerTyping.at < 20000 ? { text: partnerTyping.text, at: partnerTyping.at + (serverNow() - Date.now()) } : null;
    const fromServer = game.partner.draft != null && game.partner.draft_at ? { text: game.partner.draft, at: Date.parse(game.partner.draft_at) || 0 } : null;
    const newest = fromLive && fromServer ? (fromLive.at >= fromServer.at - 300 ? fromLive : fromServer) : fromLive ?? fromServer;
    const live = game.partner.status === 'playing' && newest ? newest.text : null;
    return (
      <div className="screen game spectate">
        <header className="topbar">
          <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">
            👀 Watching {partner.name}
            {/* v1.9: their clock, ticking live, while you watch. */}
            {game.partner.started_at && (
              <span className="topbar-clock spectate-clock" aria-label={`${partner.name}'s time`}>
                {' '}· <RoundElapsed r={game.partner} />{game.partner.paused && game.partner.status === 'playing' ? ' ⏸' : ''}
              </span>
            )}
          </h1>
          <div className="topbar-right" />
        </header>
        {/* v1.9: spectating is back to the score cards, with the full chat dock at the bottom. */}
        <div className="vs-strip">
          <SideCard player={me} view={game.me} isMe align="left" endlessMode={endless} />
          <span className="vs-chip">VS</span>
          <SideCard player={partner} isMe={false} align="right" endlessMode={endless}
            view={partnerReveal !== null && theirs
              ? { ...game.partner, patterns: game.partner.patterns.slice(0, partnerReveal), guess_count: partnerReveal, status: 'playing', duration_ms: null, gave_up: false }
              : game.partner} />
        </div>
        <>
        <div className="segmented small spectate-tabs" role="tablist">
          <button role="tab" aria-selected={theirs} className={theirs ? 'on' : ''} onClick={() => setWatch('partner')}>{partner.name}'s board</button>
          <button role="tab" aria-selected={!theirs} className={!theirs ? 'on' : ''} onClick={() => setWatch('mine')}>Your board</button>
        </div>
        <div className="spectate-line">
          {theirs ? (
            notStarted ? <span>{partner.name} hasn't started yet. Warm up the trash talk.</span> : (
              <>
                <span>{game.mode === 'challenge' ? 'Hunting for your word' : 'Hunting for'}</span>
                {/* v1.13: face down until tapped, except the word I picked for them myself. */}
                {theirWord && (game.mode === 'challenge'
                  ? <WordTiles word={theirWord} size={22} />
                  : <HiddenWord word={theirWord} shown={showWord} onToggle={() => setShowWord((x) => !x)} />)}
              </>
            )
          ) : (
            <>
              <span>{game.me.status === 'solved' ? `You solved it in ${game.me.guess_count}` : game.me.gave_up ? 'You gave up' : 'Out of guesses'} · <RoundElapsed r={game.me} /></span>
              {game.answer && <HiddenWord word={game.answer} shown={showWord} onToggle={() => setShowWord((x) => !x)} />}
            </>
          )}
        </div>
        {theirs ? (
          <Board key="partner" guesses={pg} current={live ?? ''} revealRow={partnerReveal} shake={false} bounceRow={null} endless={endless}
            active={live !== null && partnerReveal === null} label={`${partner.name}'s guesses`} />
        ) : (
          <Board key="mine" guesses={game.me.guesses} current="" revealRow={null} shake={false} bounceRow={null} active={false} endless={endless} />
        )}
        <TrashTalk game={game} slot={slot} players={players} onGame={apply} variant="dock" />
        </>
      </div>
    );
  }

  const guesses = game.me.guesses;
  const finishedView = phase === 'finished' && !revealing;
  const live = phase === 'playing';
  const hit = (p: Parameters<typeof incoming.has>[0]) => (live ? incoming.has(p) : null);
  const keyStates = hit('amnesia') ? {} : keyboardStates(revealing ? guesses.slice(0, revealRow!) : guesses);
  const shuffle = hit('shuffle');
  const freeze = hit('freeze');
  const sabClass = sabotage ? ['fog', 'quake', 'mirror'].filter((p) => hit(p as 'fog')).map((p) => ` sab-${p}`).join('') : '';

  return (
    <div className={`screen game${sabotage ? ' sabotage' : ''}${sabClass}`}>
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">
          {game.mode === 'challenge' ? 'Challenge ⚔️' : endless ? `Endless ♾️` : sabotage ? 'Sabotage 😈' : `Game #${game.number}`}
          {game.me.started_at && <span className="topbar-clock"> · <RoundElapsed r={game.me} /></span>}
          {partnerWatching && <WatchingEye name={partner.name} />}
        </h1>
        <div className="topbar-right">
          {phase === 'playing' && (
            <button className="iconbtn" onClick={() => setConfirmGiveUp(true)} aria-label="Give up"><Icon name="flag" size={20} /></button>
          )}
        </div>
      </header>

      {/* v1.7 experiment: chat on the left (my own card just repeated my board), partner on the right. */}
      {/* v1.9: while you're playing, the box above the board is an emoji soundboard. */}
      <div className="vs-strip chat-strip">
        {slot && (sabotage ? <PowerBar game={game} slot={slot} partner={partner} onGame={apply} /> : <Soundboard game={game} slot={slot} />)}
        <PartnerMini player={partner} view={game.partner} endless={endless} badge={sabotage && slot ? partnerHitEmoji(game.sab?.events, slot) : null} />
      </div>
      {sabotage && live && <SabBanner incoming={incoming} partner={partner} />}
      <>
      {game.partner.status === 'solved' && game.me.status !== 'solved' && game.me.status !== 'failed' && (
        <p className="partner-news">{game.mode === 'challenge' ? `🏆 ${partner.name} has solved the word you picked.` : "🏆 Your partner has solved today's word."}</p>
      )}

      <Board guesses={guesses} current={typed} revealRow={revealRow} shake={shake} bounceRow={bounceRow} endless={endless}
        active={phase === 'playing' || phase === 'countdown'} locked={sabotage ? 6 - (game.me.max_guesses ?? 6) : 0} />

      {finishedView ? (
        <div className="finished-panel">
          <div className="finished-head">
            <div>
              <p className="eyebrow">{game.me.status === 'solved' ? `Solved in ${game.me.guess_count}` : game.me.gave_up ? 'You gave up' : 'Out of guesses'}</p>
              <p className="finished-time">Your time <b><RoundElapsed r={game.me} /></b></p>
            </div>
            {game.answer && (
              <div className="finished-word">
                <WordTiles word={game.answer} size={30} />
                {game.mode === 'challenge' && <span className="muted small">picked by {partner.name}</span>}
              </div>
            )}
          </div>
          <BadgeChips round={{ status: game.me.status, duration_ms: game.me.duration_ms, patterns: game.me.guesses.map((g) => g.pattern), guesses: game.me.guesses }} />
          <p className="finished-wait">
            <span className="loader small" aria-hidden="true" />
            {game.partner.status === 'playing'
              ? `${partner.name} is on guess ${endless ? game.partner.guess_count + 1 : Math.min(game.partner.guess_count + 1, 6)}. Results appear the moment ${partner.name} finishes.`
              : `Waiting for ${partner.name} to play. Results appear the moment ${partner.name} finishes.`}
          </p>
          <button className="btn ghost" onClick={() => go('/', true)}>Back home</button>
        </div>
      ) : (
        <Keyboard states={keyStates} onKey={onKey} disabled={phase !== 'playing' || submitting || !!freeze}
          layout={shuffle ? shuffledRows(shuffle.id * 7919) : undefined} banned={hit('ban')?.letter ?? null} />
      )}
      </>
      {hit('dark') && <DarkOverlay />}
      {freeze?.expires_at && <FreezeOverlay until={Date.parse(freeze.expires_at)} />}

      {phase === 'countdown' && cdTarget && (
        <Countdown target={cdTarget} onGo={begin}
          label={cdTarget === Date.parse(game.starts_at ?? '') ? `${me.name} vs ${partner.name}` : `${partner.name} is already playing. Your clock starts on GO.`} />
      )}

      {confirmGiveUp && (
        <div className="modal-backdrop" onClick={() => setConfirmGiveUp(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Give up this round?</h3>
            <p className="muted">It counts as a failed round, and you'll see the word. {partner.name} keeps playing.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmGiveUp(false)}>Keep playing</button>
              <button className="btn danger" onClick={giveUp}>Give up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
