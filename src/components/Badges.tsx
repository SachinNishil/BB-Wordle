// Badges: chips for what one round earned (v1.15). Since v1.16 that's all: the
// totals live in the Hall of fame instead of a separate badge shelf.
import { badgeById, roundBadges, type RoundLike } from '../lib/badges';

/** The badges one round earned, as small chips (finished panels, results, history). */
export function BadgeChips({ round, label }: { round: RoundLike; label?: string }) {
  const ids = roundBadges(round);
  if (!ids.length) return null;
  return (
    <div className="badge-chips" aria-label={label ?? 'Badges earned'}>
      {ids.map((id) => {
        const b = badgeById(id)!;
        return <span key={id} className="badge-chip" title={b.how}><span aria-hidden="true">{b.emoji}</span> {b.name}</span>;
      })}
    </div>
  );
}
