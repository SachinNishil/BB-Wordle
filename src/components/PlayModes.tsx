// v1.20 Home: picking a game. A big chunky Classic tile, Challenge and Endless side by
// side under it, and Solo tucked below. No captions.
// While a game is waiting for someone, the tile for that mode wears the round photo of
// whoever is in the waiting room, so the other one knows which game to tap.
import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { SoloElapsed } from './Live';
import type { GameMode, Player, SoloView } from '../lib/types';
import { go } from '../router';

export interface Pending {
  mode: GameMode;
  /** Who's in the waiting room (shown on the tile). */
  inRoom: Player[];
}

interface Props {
  partner: Player;
  starting: GameMode | null;
  start: (m: GameMode) => void;
  pending: Pending | null;
  /** Tapping the tile of the game that's waiting. */
  enter: () => void;
}

function Faces({ people }: { people: Player[] }) {
  if (!people.length) return null;
  return (
    <span className="mode-faces" aria-hidden="true">
      {people.map((p) => <Avatar key={p.slot} player={p} size={30} ring />)}
    </span>
  );
}

export function PlayModes({ partner, starting, start, pending, enter }: Props) {
  const tap = (m: GameMode) => (pending ? (pending.mode === m ? enter() : undefined) : start(m));
  const state = (m: GameMode) => (pending ? (pending.mode === m ? ' waiting' : ' dim') : '');
  const off = (m: GameMode) => !!starting || (!!pending && pending.mode !== m);
  const faces = (m: GameMode): ReactNode => (pending?.mode === m ? <Faces people={pending.inRoom} /> : null);
  const label = (m: GameMode) => {
    const who = pending?.inRoom.map((p) => p.name).join(' and ');
    return pending?.mode === m && who ? `, ${who} waiting` : '';
  };
  return (
    <section className="play-a">
      <button className={`ca2${state('classic')}`} onClick={() => tap('classic')} disabled={off('classic')} aria-label={`Classic game${label('classic')}`}>
        <span className="ca2-label">{starting === 'classic' ? 'PICKING…' : 'CLASSIC'}</span>
        <span className="ca2-play" aria-hidden="true">▶</span>
        {faces('classic')}
      </button>
      <div className="pa-duo">
        <button className={`pa-mini${state('challenge')}`} onClick={() => tap('challenge')} disabled={off('challenge')} aria-label={`Challenge ${partner.name}${label('challenge')}`}>
          <span className="pa-emoji">⚔️</span><span>{starting === 'challenge' ? 'Starting…' : 'Challenge'}</span>
          {faces('challenge')}
        </button>
        <button className={`pa-mini${state('endless')}`} onClick={() => tap('endless')} disabled={off('endless')} aria-label={`Endless race${label('endless')}`}>
          <span className="pa-emoji">♾️</span><span>{starting === 'endless' ? 'Picking…' : 'Endless'}</span>
          {faces('endless')}
        </button>
      </div>
    </section>
  );
}

/** Solo, tucked under the game picker. */
export function SoloRow({ mine }: { mine: SoloView | null }) {
  return (
    <button className="solo-row" onClick={() => go('/solo')}>
      <span className="solo-row-icon" aria-hidden="true">🎯</span>
      <span className="solo-row-label">
        Solo{mine && <span className="solo-row-sub"> · <SoloElapsed solo={mine} />{mine.paused ? ' ⏸' : ''}</span>}
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}
