import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { InstallHint } from '../components/InstallHint';
import { Elapsed } from '../components/Live';
import { GameWords } from '../components/Tiles';
import { api } from '../lib/api';
import { APP_VERSION } from '../lib/versions';
import { fmtDate, fmtDuration } from '../lib/clock';
import type { GameMode, GameView, HistoryGame, Player, Slot } from '../lib/types';
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
  if (onTime(g)) {
    return { top: `🏆 ${players[w].name} · ${score(w)} · ${fmtDuration(p(w).duration_ms)}`, bottom: `${players[l].name} · ${score(l)} · ${fmtDuration(p(l).duration_ms)}` };
  }
  return { top: `🏆 ${players[w].name} · ${score(w)}`, bottom: `${players[l].name} · ${score(l)}` };
}

function GameCard() {
  const { slot, players, active, activeLoaded, setActive, ping, reportError, partnerPresence } = useStore();
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
      go('/game');
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
          <p className="mode-note">Classic: a random word from the dictionary, the same for both of you.</p>
        </div>
        <div className="mode-or" aria-hidden="true"><span>or</span></div>
        <div className="mode-choice">
          <button className="btn ghost big challenge-btn" onClick={() => start('challenge')} disabled={!!starting}>
            {starting === 'challenge' ? 'Starting…' : <>⚔️ CHALLENGE {partner.name.toUpperCase()}</>}
          </button>
          <p className="mode-note">You pick a word for {partner.name}, {partner.name} picks one for you.</p>
        </div>
      </section>
    );
  }

  return <ActiveCard game={active} me={me} partner={partner} partnerHere={partnerPresence.length > 0} />;
}

function ActiveCard({ game, me, partner, partnerHere }: { game: GameView; me: Player; partner: Player; partnerHere: boolean }) {
  const mineDone = game.me.status === 'solved' || game.me.status === 'failed';
  const challenge = game.mode === 'challenge';
  const invitedMe = !challenge && !game.me.joined_at && game.created_by !== me.slot;
  let eyebrow = 'Game live';
  let title = 'Game live';
  let note: string | null = null;
  let cta = 'CONTINUE';
  if (challenge && game.status === 'setting') {
    eyebrow = 'Challenge ⚔️';
    if (!game.i_have_set) {
      title = game.created_by === me.slot ? `Pick a word for ${partner.name}` : `${partner.name} challenged you!`;
      note = `Choose the word ${partner.name} has to solve.${game.partner_has_set ? ` ${partner.name} has already picked yours.` : ''}`;
      cta = 'PICK A WORD';
    } else {
      title = `Waiting for ${partner.name} to pick your word`;
      cta = 'VIEW';
    }
  } else if (challenge && game.status === 'waiting') {
    eyebrow = 'Challenge ⚔️';
    title = game.me.joined_at ? `Waiting for ${partner.name} to get ready` : 'Both words are in!';
    cta = game.me.joined_at ? 'VIEW' : "I'M READY";
  } else if (invitedMe) {
    eyebrow = 'Your turn to join';
    title = `${partner.name} started a game!`;
    cta = 'JOIN GAME';
  } else if (game.status === 'waiting') {
    eyebrow = 'Waiting for player';
    title = `Waiting for ${partner.name}`;
    note = partnerHere ? `${partner.name} has the app open.` : `${partner.name} will see it on opening the app.`;
  } else {
    if (challenge) eyebrow = 'Challenge ⚔️ · live';
    if (mineDone) {
      title = game.me.status === 'solved' ? `You solved it in ${game.me.guess_count}` : 'Your round is over';
      cta = 'VIEW';
    }
  }
  const showScores = game.status !== 'setting' && !(challenge && game.status === 'waiting');
  const side = (p: Player, v: GameView['me'] | GameView['partner'], label: string) => (
    <div className="mini-side">
      <Avatar player={p} size={34} />
      <div>
        <p className="mini-name">{label}</p>
        <p className="mini-score">{v.status === 'solved' ? '✓ ' : ''}{v.guess_count}/6</p>
      </div>
    </div>
  );
  return (
    <section className={`card game-card live${challenge ? ' challenge' : ''}`}>
      <p className="eyebrow live-eyebrow"><i className="dot" /> {eyebrow}</p>
      <h2 className="game-card-title">{title}</h2>
      {game.me.started_at && (
        <p className="live-clock"><Elapsed startedAt={game.me.started_at} durationMs={game.me.duration_ms} /></p>
      )}
      {showScores && (
        <div className="mini-vs">
          {side(me, game.me, 'You')}
          <span className="vs-chip small">VS</span>
          {side(partner, game.partner, partner.name)}
        </div>
      )}
      {note && <p className="muted small">{note}</p>}
      <button className="btn primary big" onClick={() => go('/game')}>{cta}</button>
    </section>
  );
}

export function Home() {
  const { me, partner, players, history, online } = useStore();
  if (!me || !partner) return null;
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
            <span key={i} className={`logo-tile ${i === 1 || i === 4 ? 'present' : i === 3 ? 'absent' : 'correct'}`} style={{ animationDelay: `${i * 80}ms` }}>{l}</span>
          ))}
        </h1>
        <p className="logo-sub">for two</p>
      </div>

      <div className="couple">
        <div className="couple-side"><Avatar player={me} size={58} ring /><span>{me.name}</span></div>
        <span className="couple-vs"><span aria-hidden="true">❤️</span> VS <span aria-hidden="true">❤️</span></span>
        <div className="couple-side"><Avatar player={partner} size={58} ring /><span>{partner.name}</span></div>
      </div>

      <GameCard />

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
