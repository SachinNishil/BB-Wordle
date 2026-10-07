import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Board, REVEAL_MS } from '../components/Board';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { Keyboard } from '../components/Keyboard';
import { Elapsed, SideCard } from '../components/Live';
import { fromGameView, ResultsView } from '../components/Results';
import { WordTiles } from '../components/Tiles';
import { api, ApiError } from '../lib/api';
import { serverNow } from '../lib/clock';
import { loadDictionary } from '../lib/dictionary';
import type { GameView } from '../lib/types';
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
  const { slot, players, active, activeLoaded, pulse, words, ping, toast, reportError, setActive, partnerPresence } = store;
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

  const me = slot ? players[slot] : null;
  const partner = slot ? players[(3 - slot) as 1 | 2] : null;
  const partnerOnBoard = partnerPresence.some((p) => p.screen === 'game');
  const partnerHere = partnerPresence.length > 0;

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

  // Opening the game screen means "I'm here".
  useEffect(() => {
    if (!game || !slot || joining.current) return;
    if (game.status === 'completed' || game.me.joined_at) return;
    if (game.mode === 'challenge') return; // challenge: joining is the Ready button
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

  const allowed = useMemo(() => new Set((words ?? []).map((w) => w.word)), [words]);
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
    if (dict.size > 0 && !dict.has(word) && !allowed.has(word)) return doShake('Not in word list');
    setSubmitting(true);
    const row = game.me.guess_count;
    try {
      const r = await api.submitGuess(slot, game.id, word, row + 1);
      setTyped('');
      setRevealRow(row);
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
  }, [game, slot, typed, allowed, apply, ping, toast, doShake, reportError, reload]);

  const picking = phase === 'setting' && !!game && (!game.i_have_set || changing);

  const submitPick = useCallback(async () => {
    if (!game || !slot) return;
    if (pick.length < 5) return doShake('Not enough letters');
    const dict = await loadDictionary();
    if (dict.size > 0 && !dict.has(pick) && !allowed.has(pick)) return doShake('Not in word list');
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
  }, [game, slot, pick, allowed, apply, ping, toast, doShake, reportError, reload, partner]);

  async function ready() {
    if (!game || !slot) return;
    setBusy(true);
    try {
      const s = await api.joinGame(slot, game.id);
      apply(s.game);
      ping('game', 'joined');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  const onKey = useCallback(
    (k: string) => {
      if (picking && !submitting) {
        if (k === 'Enter') void submitPick();
        else if (k === 'Backspace') setPick((t) => t.slice(0, -1));
        else if (/^[a-z]$/i.test(k)) setPick((t) => (t.length < 5 ? t + k.toUpperCase() : t));
        return;
      }
      if (phase !== 'playing' || submitting || revealing) return;
      if (k === 'Enter') void submit();
      else if (k === 'Backspace') setTyped((t) => t.slice(0, -1));
      else if (/^[a-z]$/i.test(k)) setTyped((t) => (t.length < 5 ? t + k.toUpperCase() : t));
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

  async function playNow() {
    if (!game || !slot) return;
    setBusy(true);
    try {
      const s = await api.joinGame(slot, game.id, true);
      apply(s.game);
      ping('game', 'began');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

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

  if (phase === 'results' && game) {
    return (
      <div className="screen scroll">
        <header className="topbar">
          <button className="iconbtn" onClick={() => go('/', true)} aria-label="Home"><Icon name="back" /></button>
          <h1 className="topbar-title">Game #{game.number}</h1>
          <div className="topbar-right" />
        </header>
        <ResultsView data={fromGameView(game)} isToday />
        <div className="stack pad">
          <button className="btn primary" onClick={() => go('/', true)}>Back home</button>
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
              <><span className="loader small" aria-hidden="true" /> {partner.name} is {partnerHere ? 'picking' : 'yet to pick'} a word for you</>
            )}
          </p>
          {!picking && (
            <div className="stack">
              {!partnerHere && <button className="btn soft" onClick={nudge}><Icon name="share" size={18} /> Send {partner.name} a nudge</button>}
              <button className="btn text" onClick={cancel} disabled={busy}>Call off this challenge</button>
            </div>
          )}
        </div>
        {picking && <Keyboard states={{}} onKey={onKey} disabled={submitting} />}
      </div>
    );
  }

  if (phase === 'readycheck' && game) {
    return (
      <div className="screen waiting">
        <header className="topbar">
          <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">Challenge ⚔️</h1>
          <div className="topbar-right" />
        </header>
        <div className="waiting-body">
          <div className="waiting-couple">
            <Avatar player={me} size={76} ring />
            <span className="beat" aria-hidden="true">⚔️</span>
            <Avatar player={partner} size={76} ring />
          </div>
          <p className="eyebrow">Both words are in</p>
          <h2 className="waiting-title">Ready?</h2>
          <p className="muted">You gave {partner.name} <b>{game.my_challenge_word}</b>. {partner.name} picked yours. The countdown starts when you're both ready.</p>
          <div className="stack">
            <button className="btn primary big" onClick={ready} disabled={busy}>I'M READY</button>
            <button className="btn text" onClick={cancel} disabled={busy}>Call off this challenge</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'waiting' && game) {
    return (
      <div className="screen waiting">
        <header className="topbar">
          <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">Game #{game.number}</h1>
          <div className="topbar-right" />
        </header>
        <div className="waiting-body">
          <div className="waiting-couple">
            <Avatar player={me} size={76} ring />
            <span className="beat" aria-hidden="true">❤️</span>
            <span className={`waiting-partner${partnerHere ? ' here' : ''}`}><Avatar player={partner} size={76} /></span>
          </div>
          <p className="eyebrow">{game.mode === 'challenge' ? "You're ready" : 'Waiting for player'}</p>
          <h2 className="waiting-title">Waiting for {partner.name}</h2>
          <p className="muted">
            {game.mode === 'challenge'
              ? `The countdown starts the moment ${partner.name} taps Ready.`
              : partnerHere ? `${partner.name} has the app open. The countdown starts the moment ${partner.name} joins.` : `${partner.name} isn't in the app right now, and will see this game on opening it.`}
          </p>
          <div className="stack">
            <button className="btn soft" onClick={nudge}><Icon name="share" size={18} /> Send {partner.name} a nudge</button>
            <button className="btn ghost" onClick={playNow} disabled={busy}>Play now, {partner.name} can join later</button>
            <button className="btn text" onClick={cancel} disabled={busy}>Cancel this game</button>
          </div>
        </div>
      </div>
    );
  }

  if (!game) return null;
  const guesses = game.me.guesses;
  const keyStates = keyboardStates(revealing ? guesses.slice(0, revealRow!) : guesses);
  const finishedView = phase === 'finished' && !revealing;

  return (
    <div className="screen game">
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">
          <span className="live-pill"><i className="dot" /> Live</span> {game.mode === 'challenge' ? 'Challenge ⚔️' : `Game #${game.number}`}
        </h1>
        <div className="topbar-right">
          {phase === 'playing' && (
            <button className="iconbtn" onClick={() => setConfirmGiveUp(true)} aria-label="Give up"><Icon name="flag" size={20} /></button>
          )}
        </div>
      </header>

      <div className="vs-strip">
        <SideCard player={me} view={game.me} isMe align="left" />
        <span className="vs-chip">VS</span>
        <SideCard player={partner} view={game.partner} isMe={false} onBoard={partnerOnBoard} align="right" />
      </div>
      {game.partner.status === 'solved' && game.me.status !== 'solved' && game.me.status !== 'failed' && (
        <p className="partner-news">{game.mode === 'challenge' ? `🏆 ${partner.name} has solved the word you picked.` : "🏆 Your partner has solved today's word."}</p>
      )}

      <Board guesses={guesses} current={typed} revealRow={revealRow} shake={shake} bounceRow={bounceRow}
        active={phase === 'playing' || phase === 'countdown'} />

      {finishedView ? (
        <div className="finished-panel">
          <div className="finished-head">
            <div>
              <p className="eyebrow">{game.me.status === 'solved' ? `Solved in ${game.me.guess_count}` : game.me.gave_up ? 'You gave up' : 'Out of guesses'}</p>
              <p className="finished-time">Your time <b><Elapsed startedAt={game.me.started_at} durationMs={game.me.duration_ms} /></b></p>
            </div>
            {game.answer && (
              <div className="finished-word">
                <WordTiles word={game.answer} size={30} />
                {game.mode === 'challenge' && <span className="muted small">picked by {partner.name}</span>}
              </div>
            )}
          </div>
          <p className="finished-wait">
            <span className="loader small" aria-hidden="true" />
            {game.partner.status === 'playing'
              ? `${partner.name} is on guess ${Math.min(game.partner.guess_count + 1, 6)}. Results appear the moment ${partner.name} finishes.`
              : `Waiting for ${partner.name} to play. Results appear the moment ${partner.name} finishes.`}
          </p>
          <button className="btn ghost" onClick={() => go('/', true)}>Back home</button>
        </div>
      ) : (
        <Keyboard states={keyStates} onKey={onKey} disabled={phase !== 'playing' || submitting} />
      )}

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
