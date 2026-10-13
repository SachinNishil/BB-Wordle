// Badges (v1.15): chips for what one round earned, the shelf in Stats, and a
// "New badge" notice when a milestone is reached.
import { useEffect, useMemo, useState } from 'react';
import { badgeById, badgeSummary, MILESTONES, ROUND_BADGES, roundBadges, roundsFor, type RoundLike } from '../lib/badges';
import { load, save } from '../lib/storage';
import type { Slot } from '../lib/types';
import { go } from '../router';
import { useStore } from '../store';

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

/** Every badge for one player: counts for the round badges, steps for the milestones. */
export function BadgeShelf() {
  const { history, soloHistory, players } = useStore();
  const [who, setWho] = useState<Slot>(1);
  const sum = useMemo(() => badgeSummary(roundsFor(who, history ?? [], soloHistory ?? [])), [who, history, soloHistory]);
  const earnedKinds = ROUND_BADGES.filter((b) => sum.counts[b.id] > 0).length + sum.earnedSteps.length;
  const total = ROUND_BADGES.length + MILESTONES.reduce((n, m) => n + m.steps.length, 0);
  return (
    <section className="section badges" aria-label="Badges">
      <div className="section-head">
        <h3>Badges <span className="muted small">· {earnedKinds} of {total}</span></h3>
        <div className="segmented small">
          {([1, 2] as Slot[]).map((x) => (
            <button key={x} className={who === x ? 'on' : ''} onClick={() => setWho(x)} aria-pressed={who === x}>{players[x].name}</button>
          ))}
        </div>
      </div>
      <div className="badge-grid">
        {ROUND_BADGES.map((b) => {
          const n = sum.counts[b.id];
          return (
            <div key={b.id} className={`badge${n ? ' got' : ''}`}>
              <span className="badge-emoji" aria-hidden="true">{b.emoji}</span>
              <p className="badge-name">{b.name}{n > 1 && <span className="badge-count">×{n}</span>}</p>
              <p className="badge-how">{b.how}</p>
            </div>
          );
        })}
      </div>
      <div className="milestones">
        {sum.milestones.map((m) => {
          const top = m.earned[m.earned.length - 1];
          const prev = top ?? 0;
          const pct = m.next ? Math.min(100, Math.round(((m.value - prev) / (m.next - prev)) * 100)) : 100;
          return (
            <div key={m.def.id} className={`milestone${top ? ' got' : ''}`}>
              <span className="badge-emoji" aria-hidden="true">{m.def.emoji}</span>
              <div className="milestone-main">
                <p className="badge-name">{top ? m.def.name(top) : m.def.name(m.def.steps[0])}</p>
                <p className="badge-how">Best so far: {m.value}{m.next ? ` · next ${m.next}` : ' · all done!'} <span className="muted">({m.def.unit})</span></p>
                <span className="milestone-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                <span className="milestone-steps" aria-label={`Steps: ${m.def.steps.join(', ')}`}>
                  {m.def.steps.map((s) => <i key={s} className={m.value >= s ? 'on' : ''}>{s}</i>)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A one-time "New badge" notice when a milestone step is reached (quiet the first time). */
export function useMilestoneToasts() {
  const { slot, history, soloHistory, toast } = useStore();
  useEffect(() => {
    if (!slot || !history || !soloHistory) return;
    const key = `bbw.badgesSeen.${slot}`;
    const steps = badgeSummary(roundsFor(slot, history, soloHistory)).earnedSteps;
    const seen = load<string[] | null>(key, null);
    save(key, steps);
    if (!seen) return; // first look on this phone: nothing is "new"
    const fresh = steps.filter((s) => !seen.includes(s));
    for (const id of fresh.slice(-2)) {
      const [m, n] = id.split('-');
      const def = MILESTONES.find((x) => x.id === m);
      if (def) toast(`🏅 New badge: ${def.emoji} ${def.name(Number(n))}`, 'win', { label: 'See', run: () => go('/stats') });
    }
  }, [slot, history, soloHistory, toast]);
}

export function MilestoneToasts() {
  useMilestoneToasts();
  return null;
}
