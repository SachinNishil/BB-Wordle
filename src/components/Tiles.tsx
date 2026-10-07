import { markToClass } from '../lib/wordle';

/** A word drawn as Wordle tiles (results, history). */
export function WordTiles({ word, pattern, size = 34, animate = false }: { word: string; pattern?: string; size?: number; animate?: boolean }) {
  return (
    <span className="wordtiles" aria-label={word}>
      {[...word].map((l, i) => (
        <span key={i} className={`mtile ${pattern ? markToClass(pattern[i]) : 'correct'}${animate ? ' flip-in' : ''}`}
          style={{ width: size, height: size, fontSize: size * 0.55, animationDelay: animate ? `${i * 110}ms` : undefined }}>
          {l}
        </span>
      ))}
    </span>
  );
}

/** Colour-only grid: for a partner's progress (no letters) and result boards. */
export function MiniGrid({ patterns, rows = 6, cell = 9, gap = 2, showEmpty = true }: {
  patterns: string[]; rows?: number; cell?: number; gap?: number; showEmpty?: boolean;
}) {
  const all = showEmpty ? [...patterns, ...Array(Math.max(0, rows - patterns.length)).fill('')] : patterns;
  return (
    <span className="minigrid" style={{ gap }} aria-label={`${patterns.length} guesses`}>
      {all.map((p, r) => (
        <span key={r} className="minirow" style={{ gap }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`minicell ${p ? markToClass(p[i]) : 'blank'}`} style={{ width: cell, height: cell }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The word(s) of a finished game: one word for classic, both for a challenge. */
export function GameWords({ game, size = 22 }: { game: { mode?: string; word: string | null; word_for_1: string; word_for_2: string }; size?: number }) {
  if (game.mode !== 'challenge') return <WordTiles word={game.word ?? game.word_for_1} size={size} />;
  const small = Math.round(size * 0.78);
  return (
    <span className="game-words" aria-label={`Challenge: ${game.word_for_1} and ${game.word_for_2}`}>
      <span className="mode-badge" aria-hidden="true">⚔️</span>
      <span className="game-words-stack">
        <WordTiles word={game.word_for_1} size={small} />
        <WordTiles word={game.word_for_2} size={small} />
      </span>
    </span>
  );
}
