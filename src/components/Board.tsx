import { useEffect, useRef, useState } from 'react';
import { MAX_GUESSES, markToClass, type Pattern } from '../lib/wordle';

export const FLIP_MS = 300; // per-tile stagger
export const REVEAL_MS = FLIP_MS * 4 + 520;

interface Props {
  guesses: { word: string; pattern: Pattern }[];
  current: string;
  /** Index of the row currently flipping (just submitted). */
  revealRow: number | null;
  shake: boolean;
  bounceRow: number | null;
  /** Show the current typing row. */
  active: boolean;
  label?: string;
}

export function Board({ guesses, current, revealRow, shake, bounceRow, active, label = 'Your guesses' }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState(56);

  // Size tiles to the space available, so the board never needs scrolling.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const gap = 6;
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const size = Math.floor(Math.min((w - gap * 4) / 5, (h - gap * 5) / 6, 66));
      setTile(Math.max(30, size));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => {
    if (r < guesses.length) return { kind: 'done' as const, ...guesses[r] };
    if (r === guesses.length && active) return { kind: 'typing' as const, word: current, pattern: '' };
    return { kind: 'empty' as const, word: '', pattern: '' };
  });

  return (
    <div className="board-wrap" ref={wrap}>
      <div className="board" style={{ ['--tile' as string]: `${tile}px` }} role="grid" aria-label={label}>
        {rows.map((row, r) => (
          <div key={r} role="row"
            className={`row${row.kind === 'typing' && shake ? ' shake' : ''}${bounceRow === r ? ' bounce' : ''}`}>
            {[0, 1, 2, 3, 4].map((i) => {
              const letter = row.word[i] ?? '';
              if (row.kind === 'done') {
                const cls = markToClass(row.pattern[i]);
                const revealing = revealRow === r;
                return (
                  <div key={i} role="gridcell" aria-label={`${letter} ${cls}`}
                    className={`tile ${revealing ? 'reveal' : 'shown'} ${cls}`}
                    style={revealing ? { animationDelay: `${i * FLIP_MS}ms` } : bounceRow === r ? { animationDelay: `${i * 90}ms` } : undefined}>
                    {letter}
                  </div>
                );
              }
              return (
                <div key={i} role="gridcell" className={`tile ${letter ? 'filled' : ''}`}>
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
