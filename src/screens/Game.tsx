import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Board, REVEAL_MS } from '../components/Board';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { Keyboard } from '../components/Keyboard';
import { Elapsed, PartnerMini } from '../components/Live';
import { fromGameView, ResultsView } from '../components/Results';
import { WordTiles } from '../components/Tiles';
import { ChatBox, ChatPanel, TAUNT_MAX, TrashTalk, chatCase, useFeedTaunts, useSendTaunt } from '../components/TrashTalk';
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
  const { slot, players, active, activeLoaded, pulse, ping, toast, reportError, setActive, sendTyping, partnerTyping, setQuietInvites } = store;
  const [rematching, setRematching] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
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
  const [partnerReveal, setPartnerReveal] = useState<number | null>(null);
  const sawPlaying = useRef(false);
  const prevPartnerCount = useRef<number | null>(null);

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
    return () => clearTimeout(t);
  }, [partnerCount]);

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

  const picking = phase === 'setting' && !!game && (!game.i_have_set || changing);

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

  const { send: sendTaunt } = useSendTaunt(game, slot, apply);
  useEffect(() => {
    if (phase === 'results') setChatOpen(false);
  }, [phase]);
  // v1.8.1: while the chat is open, the Wordle keyboard types the message.
  const onChatKey = useCallback(
    (k: string) => {
      if (k === 'Escape') return setChatOpen(false);
      if (k === 'Enter') {
        const body = chatCase(chatText);
        if (body.trim()) void sendTaunt(body).then((ok) => ok && setChatText(''));
        return;
      }
      if (k === 'Backspace') return setChatText((t) => t.slice(0, -1));
      if (k === ' ') return setChatText((t) => (t && !t.endsWith(' ') && t.length < TAUNT_MAX ? t + ' ' : t));
      if ([...k].length === 1 || /\p{Extended_Pictographic}/u.test(k)) setChatText((t) => (t.length + k.length <= TAUNT_MAX ? t + k : t));
    },
    [chatText, sendTaunt],
  );

  const onKey = useCallback(
    (k: string) => {
      if (chatOpen) return onChatKey(k);
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
    [phase, submitting, revealing, submit, picking, submitPick, chatOpen, onChatKey],
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
      const chatting = chatOpenRef.current && (e.key.length === 1 || e.key === 'Escape');
      if (chatting || e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
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
            <Avatar player={partner} size={76} ring />
          </div>
          <p className="eyebrow">{game.mode === 'challenge' ? "You're ready" : 'Waiting for player'}</p>
          <h2 className="waiting-title">Waiting for {partner.name}</h2>
          <p className="muted">
            {game.mode === 'challenge'
              ? `The countdown starts the moment ${partner.name} taps Ready.`
              : `The countdown starts the moment ${partner.name} joins. Not in the app? Send a nudge.`}
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

  // The chat (v1.8.1) takes the board's place and uses the Wordle keyboard, so nothing overlaps.
  const closeChat = () => setChatOpen(false);
  const chatPanel = chatOpen && slot ? (
    <ChatPanel game={game} slot={slot} players={players} draft={chatText}
      sendNow={sendTaunt} onSent={() => setChatText('')} onClose={closeChat} />
  ) : null;
  const chatKeyboard = <Keyboard states={{}} onKey={onKey} chat />;

  if (finishedNow && watch && slot) {
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
          <h1 className="topbar-title">👀 Watching {partner.name}</h1>
          <div className="topbar-right" />
        </header>
        {!chatPanel && <div className="vs-strip chat-strip">
          <ChatBox game={game} slot={slot} players={players} onOpen={() => setChatOpen(true)} />
          <PartnerMini player={partner}
            patterns={partnerReveal !== null && theirs ? game.partner.patterns.slice(0, partnerReveal) : game.partner.patterns}
            status={partnerReveal !== null && theirs ? 'playing' : game.partner.status} />
        </div>}
        {chatPanel ? <>{chatPanel}{chatKeyboard}</> : <>
        <div className="segmented small spectate-tabs" role="tablist">
          <button role="tab" aria-selected={theirs} className={theirs ? 'on' : ''} onClick={() => setWatch('partner')}>{partner.name}'s board</button>
          <button role="tab" aria-selected={!theirs} className={!theirs ? 'on' : ''} onClick={() => setWatch('mine')}>Your board</button>
        </div>
        <div className="spectate-line">
          {theirs ? (
            notStarted ? <span>{partner.name} hasn't started yet. Warm up the trash talk.</span> : (
              <>
                <span>{game.mode === 'challenge' ? 'Hunting for your word' : 'Hunting for'}</span>
                {theirWord && <WordTiles word={theirWord} size={22} />}
              </>
            )
          ) : (
            <>
              <span>{game.me.status === 'solved' ? `You solved it in ${game.me.guess_count}` : game.me.gave_up ? 'You gave up' : 'Out of guesses'} · <Elapsed startedAt={game.me.started_at} durationMs={game.me.duration_ms} /></span>
              {game.answer && <WordTiles word={game.answer} size={22} />}
            </>
          )}
        </div>
        {theirs ? (
          <Board key="partner" guesses={pg} current={live ?? ''} revealRow={partnerReveal} shake={false} bounceRow={null}
            active={live !== null && partnerReveal === null} label={`${partner.name}'s guesses`} />
        ) : (
          <Board key="mine" guesses={game.me.guesses} current="" revealRow={null} shake={false} bounceRow={null} active={false} />
        )}
        <TrashTalk game={game} slot={slot} players={players} onGame={apply} variant="dock" />
        </>}
      </div>
    );
  }

  const guesses = game.me.guesses;
  const keyStates = keyboardStates(revealing ? guesses.slice(0, revealRow!) : guesses);
  const finishedView = phase === 'finished' && !revealing;

  return (
    <div className="screen game">
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">
          {game.mode === 'challenge' ? 'Challenge ⚔️' : `Game #${game.number}`}
          {game.me.started_at && <span className="topbar-clock"> · <Elapsed startedAt={game.me.started_at} durationMs={game.me.duration_ms} /></span>}
        </h1>
        <div className="topbar-right">
          {phase === 'playing' && (
            <button className="iconbtn" onClick={() => setConfirmGiveUp(true)} aria-label="Give up"><Icon name="flag" size={20} /></button>
          )}
        </div>
      </header>

      {/* v1.7 experiment: chat on the left (my own card just repeated my board), partner on the right. */}
      {!chatPanel && <div className="vs-strip chat-strip">
        {slot && <ChatBox game={game} slot={slot} players={players} onOpen={() => setChatOpen(true)} />}
        <PartnerMini player={partner} patterns={game.partner.patterns} status={game.partner.status} />
      </div>}
      {chatPanel ? <>{chatPanel}{chatKeyboard}</> : <>
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
      </>}

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
