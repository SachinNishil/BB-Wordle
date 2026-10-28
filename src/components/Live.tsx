import { useEffect, useState } from 'react';
import { fmtDuration, serverNow } from '../lib/clock';
import type { MeView, PartnerView, Player, SoloView } from '../lib/types';
import { Avatar } from './Avatar';
import { MiniGrid } from './Tiles';

/** A ticking m:ss clock from a server timestamp, or a fixed duration once finished. */
export function Elapsed({ startedAt, durationMs }: { startedAt: string | null; durationMs: number | null }) {
  const [, tick] = useState(0);
  const running = startedAt && durationMs == null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [running]);
  if (durationMs != null) return <>{fmtDuration(durationMs)}</>;
  if (!startedAt) return <>0:00</>;
  return <>{fmtDuration(Math.max(0, serverNow() - Date.parse(startedAt)))}</>;
}

interface Clocked { started_at: string | null; duration_ms: number | null; paused?: boolean; paused_ms?: number; elapsed_ms?: number }

/** A round's clock (v1.19, battles and solo): stands still while paused, skips the time away. */
export function RoundElapsed({ r }: { r: Clocked }) {
  if (r.duration_ms != null) return <Elapsed startedAt={r.started_at} durationMs={r.duration_ms} />;
  if (!r.started_at) return <>0:00</>;
  if (r.paused) return <Elapsed startedAt={r.started_at} durationMs={r.elapsed_ms ?? 0} />;
  const from = new Date(Date.parse(r.started_at) + (r.paused_ms ?? 0)).toISOString();
  return <Elapsed startedAt={from} durationMs={null} />;
}

/** A solo game's clock (v1.11). */
export function SoloElapsed({ solo }: { solo: SoloView }) {
  return <RoundElapsed r={solo} />;
}

/** v1.11: a lasting sign that your partner is watching your board. */
export function WatchingEye({ name }: { name: string }) {
  return (
    <span className="watching-eye" role="status" aria-label={`${name} is watching`} title={`${name} is watching`}>
      <span aria-hidden="true">👀</span>
      <span className="watching-eye-text">{name}</span>
    </span>
  );
}

// No presence-based statuses ("Away", "Live") since v1.5: they were sometimes
// wrong, and once a round has started the player is simply playing.
export function statusLabel(p: MeView | PartnerView, isMe: boolean): { text: string; tone: string } {
  switch (p.status) {
    case 'solved':
      return { text: `Solved in ${p.guess_count}!`, tone: 'win' };
    case 'failed':
      return { text: p.gave_up ? 'Gave up' : 'Out of guesses', tone: 'lose' };
    case 'playing':
      return { text: 'Playing', tone: 'live' };
    case 'ready':
      return { text: 'Getting ready', tone: 'idle' };
    default:
      return { text: isMe ? 'Joining' : 'Yet to start', tone: 'idle' };
  }
}

/** One side of the VS strip at the top of the game. */
export function SideCard({ player, view, isMe, align, endlessMode }: {
  player: Player;
  view: MeView | PartnerView;
  isMe: boolean;
  align: 'left' | 'right';
  endlessMode?: boolean;
}) {
  const patterns = 'patterns' in view ? view.patterns : view.guesses.map((g) => g.pattern);
  const st = statusLabel(view, isMe);
  const endless = !!endlessMode;
  const attempt = view.status === 'playing' ? (endless ? view.guess_count + 1 : Math.min(view.guess_count + 1, 6)) : view.guess_count;
  return (
    <div className={`side ${align} ${st.tone}`}>
      <div className="side-top">
        <Avatar player={player} size={28} />
        <span className="side-name">{isMe ? 'You' : player.name}</span>
      </div>
      <div className="side-body">
        <MiniGrid patterns={patterns.slice(-6)} cell={7} gap={2} />
        <div className="side-stats">
          <span className="side-guess">
            {view.status === 'playing' ? 'Guess ' : ''}
            <b>{attempt}</b>{endless ? '' : '/6'}
          </span>
          <span className="side-time"><RoundElapsed r={view} />{view.paused && view.status === 'playing' ? ' ⏸' : ''}</span>
          <span className={`side-status ${st.tone}`}>
            {st.text}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * v1.7: the partner's name over their colours-only mini board. v1.19: plus their
 * clock, which stands still (⏸) while they've left the game.
 */
export function PartnerMini({ player, view, endless = false, badge = null }: { player: Player; view: PartnerView; endless?: boolean; badge?: string | null }) {
  const { patterns, status } = view;
  const done = status === 'solved' ? ' win' : status === 'failed' ? ' lose' : '';
  const away = view.paused && status === 'playing';
  return (
    <div className={`partner-mini${done}`} aria-label={`${player.name}: ${patterns.length} guesses`}>
      <span className="partner-mini-name">{player.name}{status === 'solved' ? ' ✓' : ''}</span>
      {badge && <span className="partner-mini-badge" aria-label="Sabotaged">{badge}</span>}
      <MiniGrid patterns={patterns.slice(-6)} cell={10} gap={2} />
      <span className={`partner-mini-clock${away ? ' paused' : ''}`} aria-label={`${player.name}'s time${away ? ', paused' : ''}`}>
        {away ? '⏸ ' : ''}{view.started_at ? <RoundElapsed r={view} /> : '0:00'}
        {endless && patterns.length > 6 ? ` · ${patterns.length}` : ''}
      </span>
    </div>
  );
}
