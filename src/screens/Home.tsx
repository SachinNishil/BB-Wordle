import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { InstallHint } from '../components/InstallHint';
import { RoundElapsed, SoloElapsed } from '../components/Live';
import { GameWords } from '../components/Tiles';
import { api } from '../lib/api';
import { APP_VERSION } from '../lib/versions';
import { fmtDate, fmtDuration, serverNow } from '../lib/clock';
import type { GameMode, GameView, HistoryGame, Player, Slot, SoloView, WordSettings } from '../lib/types';
import { go } from '../router';
import { useStore } from '../store';

/** Both solved in the same number of guesses, so the clock decided it. */
export function onTime(g: { players: { status: string; guess_count: number }[]; winner: Slot | null }) {
  const [a, b] = g.players;
  return !!g.winner && a?.status === 'solved' && b?.status === 'solved' && a.guess_count === b.guess_count;
}

export function historyLine(g: HistoryGame, players: Record<Slot, Player>) {
  const p = (s: Slot) => g.players.find((x) => x.slot === s)!;
  const score = (s: Slot) => (p(s).status === 'solved' ? `${p(s).guess_count} guess${p(s).guess_count === 1 ? '' : 'es'}` : p(s).gave_up ? 'gave up' : 'failed');
  if (g.result === 'draw') return { top: `Draw · both solved in ${p(1).guess_count}`, bottom: '' };
  if (g.result === 'both_failed') return { top: 'The word won', bottom: 'Nobody solved it' };
  const w = g.winner!;
  const l = (3 - w) as Slot;
  // Endless (v1.19): the clock decides, so show the times.
  if (g.mode === 'endless' && g.result === 'win') {
    return { top: `🏆 ${players[w].name} · ${fmtDuration(p(w).duration_ms)} · ${score(w)}`, bottom: `${players[l].name} · ${p(l).status === 'solved' ? fmtDuration(p(l).duration_ms) : score(l)}` };
  }
  if (onTime(g)) {
    return { top: `🏆 ${players[w].name} · ${score(w)} · ${fmtDuration(p(w).duration_ms)}`, bottom: `${players[l].name} · ${score(l)} · ${fmtDuration(p(l).duration_ms)}` };
  }
  return { top: `🏆 ${players[w].name} · ${score(w)}`, bottom: `${players[l].name} · ${score(l)}` };
}

/** "everyday word", "everyday word, plurals included", "word from the whole dictionary"... */
function classicPool(w: WordSettings | null) {
  if (!w) return 'everyday word';
  if (w.ed && w.plural && w.uncommon) return 'word from the whole dictionary';
  const extra = [w.plural && 'plurals', w.ed && '-ed words', w.uncommon && 'tricky ones'].filter(Boolean) as string[];
  return extra.length ? `everyday word (${extra.join(' and ')} too)` : 'everyday word';
}

function GameCard() {
  const { slot, players, active, activeLoaded, setActive, ping, reportError, wordSettings } = useStore();
  const [starting, setStarting] = useState<GameMode | null>(null);
  if (!slot) return null;
  const me = players[slot];
  const partner = players[(3 - slot) as Slot];

  async function start(mode: GameMode) {
    if (!slot) return;
    setStarting(mode);
    try {
      const s = await api.startGame(slot, mode);
      setActive(s.game);
      ping('game', s.already_active ? 'joined' : mode === 'challenge' ? 'challenged' : 'started');
      // v1.19: classic and endless wait right here on Home; a challenge needs its word picked first.
      if (s.game?.status === 'setting') go('/game');
    } catch (e) {
      reportError(e);
    } finally {
      setStarting(null);
    }
  }

  if (!activeLoaded) {
    return (
      <section className="card game-card">
        <div className="skeleton" style={{ height: 120 }} />
      </section>
    );
  }

  if (!active) {
    return (
      <section className="card game-card idle">
        <p className="eyebrow">Today's game</p>
        <h2 className="game-card-title">Ready for a battle?</h2>
        <div className="mode-choice">
          <button className="btn primary big" onClick={() => start('classic')} disabled={!!starting}>
            {starting === 'classic' ? 'Picking a word…' : 'START GAME'}
          </button>
          <p className="mode-note">Classic: a random {classicPool(wordSettings)}, the same for both of you.</p>
        </div>
        <div className="mode-or" aria-hidden="true"><span>or</span></div>
        <div className="mode-choice">
          <button className="btn ghost big challenge-btn" onClick={() => start('challenge')} disabled={!!starting}>
            {starting === 'challenge' ? 'Starting…' : <>⚔️ CHALLENGE {partner.name.toUpperCase()}</>}
          </button>
          <p className="mode-note">You pick a word for {partner.name}, {partner.name} picks one for you.</p>
        </div>
        <div className="mode-choice">
          <button className="btn ghost big endless-btn" onClick={() => start('endless')} disabled={!!starting}>
            {starting === 'endless' ? 'Picking a word…' : <>♾️ ENDLESS RACE</>}
          </button>
          <p className="mode-note">No limit on guesses. Whoever finds the word first wins.</p>
        </div>
      </section>
    );
  }

  return <ActiveCard game={active} me={me} partner={partner} />;
}

const MODE_LABEL: Record<GameMode, string> = { classic: 'Classic', challenge: 'Challenge ⚔️', endless: 'Endless ♾️' };

function ActiveCard({ game, me, partner }: { game: GameView; me: Player; partner: Player }) {
  const { slot, setActive, ping, reportError } = useStore();
  const [busy, setBusy] = useState(false);
  const mineDone = game.me.status === 'solved' || game.me.status === 'failed';
  const challenge = game.mode === 'challenge';
  const endless = game.mode === 'endless';
  const waiting = game.status === 'waiting';

  // v1.19: joining, getting ready and cancelling all happen right here on Home.
  async function join() {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await api.joinGame(slot, game.id);
      setActive(r.game);
      ping('game', 'joined');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!slot) return;
    setBusy(true);
    try {
      await api.cancelGame(slot, game.id);
      setActive(null);
      ping('game', 'cancelled');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  // The lobby: one of you is waiting for the other.
  if (waiting) {
    const iAmIn = !!game.me.joined_at;
    const theyAreIn = !!game.partner.joined_at && !!game.partner.here;
    return (
      <section className={`card game-card live lobby${challenge ? ' challenge' : ''}`}>
        <p className="eyebrow live-eyebrow"><i className="dot" /> {MODE_LABEL[game.mode ?? 'classic']}</p>
        {iAmIn ? (
          <>
            <h2 className="game-card-title">Waiting for {partner.name}</h2>
            <div className="lobby-status" role="status">
              <span className="lobby-chip on">✓ You're here</span>
              {theyAreIn && <span className="lobby-chip on">✓ {partner.name} is here</span>}
            </div>
            <button className="btn text small" onClick={cancel} disabled={busy}>Cancel</button>
          </>
        ) : (
          <>
            <h2 className="game-card-title">{challenge ? 'Both words are in!' : `${partner.name} started a game!`}</h2>
            <button className="btn primary big" onClick={join} disabled={busy}>{challenge ? "I'M READY" : 'JOIN GAME'}</button>
          </>
        )}
      </section>
    );
  }

  let title = 'Game live';
  let cta = 'CONTINUE';
  if (challenge && game.status === 'setting') {
    if (!game.i_have_set) {
      title = game.created_by === me.slot ? `Pick a word for ${partner.name}` : `${partner.name} challenged you!`;
      cta = 'PICK A WORD';
    } else {
      title = `Waiting for ${partner.name} to pick your word`;
      cta = 'VIEW';
    }
  } else if (mineDone) {
    title = game.me.status === 'solved' ? `You solved it in ${game.me.guess_count}` : 'Your round is over';
    cta = 'VIEW';
  }
  const showScores = game.status !== 'setting';
  const side = (p: Player, v: GameView['me'] | GameView['partner'], label: string) => (
    <div className="mini-side">
      <Avatar player={p} size={34} />
      <div>
        <p className="mini-name">{label}</p>
        <p className="mini-score">{v.status === 'solved' ? '✓ ' : ''}{v.guess_count}{endless ? '' : '/6'}</p>
      </div>
    </div>
  );
  return (
    <section className={`card game-card live${challenge ? ' challenge' : ''}`}>
      <p className="eyebrow live-eyebrow"><i className="dot" /> {MODE_LABEL[game.mode ?? 'classic']}</p>
      <h2 className="game-card-title">{title}</h2>
      {game.me.started_at && (
        <p className="live-clock"><RoundElapsed r={game.me} />{game.me.paused && game.me.status === 'playing' ? ' ⏸' : ''}</p>
      )}
      {showScores && (
        <div className="mini-vs">
          {side(me, game.me, 'You')}
          <span className="vs-chip small">VS</span>
          {side(partner, game.partner, partner.name)}
        </div>
      )}
      <button className="btn primary big" onClick={() => go('/game')}>{cta}</button>
    </section>
  );
}

const STATUS_MAX = 80;

function ago(iso: string) {
  const m = Math.max(0, Math.round((serverNow() - Date.parse(iso)) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** "Last seen 5m ago" under your partner's photo while they're away (v1.10). */
export function lastSeenText(at: number) {
  const m = Math.max(0, Math.round((serverNow() - at) / 60000));
  if (m < 1) return 'Last seen just now';
  if (m < 60) return `Last seen ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Last seen ${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Last seen yesterday' : d < 30 ? `Last seen ${d} days ago` : `Last seen ${fmtDate(new Date(at).toISOString(), { day: 'numeric', month: 'short' })}`;
}

/** The two of you at the top of Home (v1.6): green dot when your partner has the app open,
 *  speech bubbles from your photos, and tap your own photo to say something. */
function Couple({ me, partner }: { me: Player; partner: Player }) {
  const { slot, partnerOnline, partnerLastSeen, setPlayers, ping, reportError, toast } = useStore();
  const [open, setOpenState] = useState(false);
  // v1.14: the phone keyboard scrolls the page to reach the box; put the page back
  // where it was when the box closes (it used to end up at the bottom).
  const savedY = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setOpen = (v: boolean) => {
    if (v) savedY.current = window.scrollY;
    setOpenState(v);
    if (!v) {
      const y = savedY.current;
      const back = () => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
      requestAnimationFrame(back);
      setTimeout(back, 350); // again once the keyboard has gone
      // v1.14.1: Android keyboards can take longer to close and resize the page as they
      // go, so for the next second put it back after every resize as well.
      const vv = window.visualViewport;
      if (vv) {
        vv.addEventListener('resize', back);
        setTimeout(() => vv.removeEventListener('resize', back), 1200);
      }
      setTimeout(back, 800);
    }
  };
  // Focus in the same tap that opened it (iPhones only raise the keyboard then).
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(value: string) {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await api.setStatus(slot, value.slice(0, STATUS_MAX));
      setPlayers(r.players);
      ping('room', 'status');
      setOpen(false);
      if (value.trim()) toast(`${partner.name} will see it on their home screen`, 'win');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  const side = (p: Player, mine: boolean) => (
    <div className={`couple-side${mine ? ' mine' : ''}`}>
      {p.status_text && (mine ? (
        // Your own bubble: tap it to edit (v1.9).
        <button className="speech left speech-edit" key={p.status_at ?? ''} onClick={() => { setText(me.status_text ?? ''); setOpen(true); }}
          aria-label="Edit your message">
          <span className="speech-text">{p.status_text}</span>
          <span className="speech-time">{p.status_at ? ago(p.status_at) : ''} · tap to edit</span>
        </button>
      ) : (
        <p className="speech right" key={p.status_at ?? ''}>
          <span className="speech-text">{p.status_text}</span>
          {p.status_at && <span className="speech-time">{ago(p.status_at)}</span>}
        </p>
      ))}
      {mine ? (
        <button className="avatar-btn couple-me" onClick={() => { setText(me.status_text ?? ''); setOpen(true); }}
          aria-label="Say something to your partner">
          <Avatar player={p} size={58} ring />
          <span className="avatar-say" aria-hidden="true">💬</span>
        </button>
      ) : (
        <span className="couple-them">
          <Avatar player={p} size={58} ring />
          {partnerOnline && <span className="online-dot" role="img" aria-label={`${p.name} is in the app`} title={`${p.name} is in the app`} />}
        </span>
      )}
      <span>{p.name}</span>
      {!mine && !partnerOnline && partnerLastSeen && <span className="last-seen">{lastSeenText(partnerLastSeen)}</span>}
    </div>
  );

  return (
    <>
      <div className={`couple${me.status_text || partner.status_text ? ' talking' : ''}${!partnerOnline && partnerLastSeen ? ' has-seen' : ''}`}>
        {side(me, true)}
        <span className="couple-vs"><span aria-hidden="true">❤️</span> VS <span aria-hidden="true">❤️</span></span>
        {side(partner, false)}
      </div>
      {open && (
        // v1.19: near the top, so the phone keyboard never covers it.
        <div className="modal-backdrop top" onClick={() => setOpen(false)}>
          <form className="modal" role="dialog" aria-modal="true" aria-label={`Say something to ${partner.name}`}
            onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save(text); }}>
            <h3>{me.status_text ? 'Edit your message' : `Say something to ${partner.name}`}</h3>
            <input ref={inputRef} className="text-input" value={text} maxLength={STATUS_MAX} onChange={(e) => setText(e.target.value)}
              placeholder="Say something…" aria-label="Your message" enterKeyHint="send" />
            <div className="modal-actions">
              {me.status_text && <button type="button" className="btn ghost" onClick={() => save('')} disabled={busy}>Clear</button>}
              <button type="submit" className="btn primary" disabled={busy || !text.trim()}>{me.status_text ? 'Update' : 'Post'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/** Your partner is playing solo (v1.10): watch it live and trash talk them. */
function PartnerSolo({ game, partner }: { game: SoloView; partner: Player }) {
  const counting = Date.parse(game.started_at) > serverNow();
  return (
    <section className="card solo-live">
      <div className="solo-live-main">
        <p className="eyebrow live-eyebrow"><i className="dot" /> {partner.name} is playing solo</p>
        <p className="solo-live-line">
          {counting ? 'Just starting…' : <>Guess {Math.min(game.guesses.length + 1, 6)}/6 · <SoloElapsed solo={game} /></>}
        </p>
      </div>
      <button className="btn primary" onClick={() => go(`/solo/watch/${game.id}`)}>👀 Watch</button>
    </section>
  );
}

export function Home() {
  const { me, partner, players, history, online, solo, partnerPresence } = useStore();
  if (!me || !partner) return null;
  // A partner's solo game is worth watching while they're on it (or touched it lately).
  const ps = solo.partner;
  // v1.11: leaving the solo screen pauses it, so a paused game isn't shown as live.
  const psActive = ps && (partnerPresence.some((p) => p.screen === 'solo')
    || (!ps.paused && serverNow() - Math.max(Date.parse(ps.started_at), ps.draft_at ? Date.parse(ps.draft_at) : 0) < 10 * 60000));
  const recent = (history ?? []).slice(0, 3);
  return (
    <div className="screen scroll home">
      <header className="home-head">
        <span className={`conn${online ? '' : ' off'}`}>{online ? '' : 'Offline'}</span>
        <div className="head-actions">
          <button className="version-pill" onClick={() => go('/versions')} aria-label={`Version history, v${APP_VERSION}`}>
            <Icon name="tag" size={15} /> v{APP_VERSION}
          </button>
          <button className="iconbtn" onClick={() => go('/settings')} aria-label="Settings"><Icon name="settings" /></button>
        </div>
      </header>

      <div className="brand">
        <h1 className="logo" aria-label="Wordle">
          {['W', 'O', 'R', 'D', 'L', 'E'].map((l, i) => (
            // v1.11: every few seconds each letter in turn rolls up and the same letter rolls back in.
            <span key={i} className={`logo-tile ${i === 1 || i === 4 ? 'present' : i === 3 ? 'absent' : 'correct'}`}
              style={{ '--i': i } as CSSProperties}>
              <span className="logo-letter">{l}</span>
            </span>
          ))}
        </h1>
        <p className="logo-sub">for two</p>
      </div>

      <Couple me={me} partner={partner} />

      <GameCard />
      {psActive && ps && <PartnerSolo game={ps} partner={partner} />}
      <button className="solo-link" onClick={() => go('/solo')}>
        {solo.mine
          ? <span>Carry on with your <b>solo</b> game · <SoloElapsed solo={solo.mine} />{solo.mine.paused ? ' (paused)' : ''} ›</span>
          : <span>Or play <b>solo</b>, on your own (it has its own stats) ›</span>}
      </button>

      <InstallHint />

      <section className="section">
        <div className="section-head">
          <h3>Recent games</h3>
          {recent.length > 0 && <button className="btn text small" onClick={() => go('/history')}>See all</button>}
        </div>
        {history === null ? (
          <div className="skeleton" style={{ height: 64 }} />
        ) : recent.length === 0 ? (
          <p className="empty-line">No games yet. Your first battle will show up here.</p>
        ) : (
          <ul className="recent">
            {recent.map((g) => {
              const line = historyLine(g, players);
              return (
                <li key={g.id}>
                  <button className="recent-row" onClick={() => go(`/history/${g.id}`)}>
                    <span className="recent-date">{fmtDate(g.completed_at, { day: 'numeric', month: 'short' })}</span>
                    <span className="recent-main">
                      <GameWords game={g} size={22} />
                      <span className="recent-line">{line.top}{line.bottom ? <span className="recent-sub"> · {line.bottom}</span> : null}</span>
                    </span>
                    <Icon name="chevron" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <nav className="home-links">
        <button className="link-card" onClick={() => go('/stats')}>
          <span className="link-icon"><Icon name="chart" /></span>
          <span className="link-title">Stats</span>
          <span className="link-sub">{history ? `${history.length} game${history.length === 1 ? '' : 's'}` : ' '}</span>
        </button>
        <button className="link-card" onClick={() => go('/history')}>
          <span className="link-icon"><Icon name="history" /></span>
          <span className="link-title">History</span>
          <span className="link-sub">Every battle</span>
        </button>
      </nav>
    </div>
  );
}
