import { useEffect, useState } from 'react';
import { fmtDuration, serverNow } from '../lib/clock';
import type { MeView, PartnerView, Player } from '../lib/types';
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

export function statusLabel(p: MeView | PartnerView, isMe: boolean, onBoard?: boolean): { text: string; tone: string } {
  switch (p.status) {
    case 'solved':
      return { text: `Solved in ${p.guess_count}!`, tone: 'win' };
    case 'failed':
      return { text: p.gave_up ? 'Gave up' : 'Out of guesses', tone: 'lose' };
    case 'playing':
      return { text: isMe ? 'Playing' : onBoard === false ? 'Away' : 'Playing', tone: 'live' };
    case 'ready':
      return { text: 'Getting ready', tone: 'idle' };
    default:
      return { text: isMe ? 'Joining' : 'Not here yet', tone: 'idle' };
  }
}

/** One side of the VS strip at the top of the game. */
export function SideCard({ player, view, isMe, onBoard, align }: {
  player: Player;
  view: MeView | PartnerView;
  isMe: boolean;
  onBoard?: boolean;
  align: 'left' | 'right';
}) {
  const patterns = 'patterns' in view ? view.patterns : view.guesses.map((g) => g.pattern);
  const st = statusLabel(view, isMe, onBoard);
  const attempt = view.status === 'playing' ? Math.min(view.guess_count + 1, 6) : view.guess_count;
  return (
    <div className={`side ${align} ${st.tone}`}>
      <div className="side-top">
        <Avatar player={player} size={28} />
        <span className="side-name">{isMe ? 'You' : player.name}</span>
      </div>
      <div className="side-body">
        <MiniGrid patterns={patterns} cell={7} gap={2} />
        <div className="side-stats">
          <span className="side-guess">
            {view.status === 'playing' ? 'Guess ' : ''}
            <b>{attempt}</b>/6
          </span>
          <span className="side-time"><Elapsed startedAt={view.started_at} durationMs={view.duration_ms} /></span>
          <span className={`side-status ${st.tone}`}>
            {st.tone === 'live' && <i className="dot" />}
            {st.text}
          </span>
        </div>
      </div>
    </div>
  );
}
