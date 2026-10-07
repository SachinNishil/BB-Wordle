import type { Player } from '../lib/types';

export function Avatar({ player, size = 44, ring = false }: { player: Player; size?: number; ring?: boolean }) {
  return (
    <span className={`avatar p${player.slot}${ring ? ' ring' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true">
      {player.photo ? <img src={player.photo} alt="" /> : player.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
