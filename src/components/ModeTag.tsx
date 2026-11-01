// v1.25: a small tag saying which mode a past round was (History and Home's recent games).
import type { GameMode } from '../lib/types';

const TAG: Record<GameMode, { label: string; emoji: string }> = {
  classic: { label: 'Classic', emoji: '🟩' },
  challenge: { label: 'Challenge', emoji: '⚔️' },
  endless: { label: 'Endless', emoji: '♾️' },
  sabotage: { label: 'Sabotage', emoji: '😈' },
};

export function ModeTag({ mode }: { mode?: GameMode | null }) {
  const t = TAG[mode ?? 'classic'];
  return <span className={`mode-tag ${mode ?? 'classic'}`}><span aria-hidden="true">{t.emoji}</span> {t.label}</span>;
}
