import { useState } from 'react';
import { fmtDate, fmtDuration } from '../lib/clock';
import type { GameResult, GameView, GuessRow, HistoryGame, Player, PlayerStatus, Slot } from '../lib/types';
import { patternToEmoji } from '../lib/wordle';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { MiniGrid, WordTiles } from './Tiles';

export interface ResultSide {
  status: PlayerStatus;
  guess_count: number;
  duration_ms: number | null;
  gave_up: boolean;
  patterns: string[];
  guesses: GuessRow[] | null;
}
export interface ResultData {
  id: string;
  number: number;
  word: string;
  wordAddedBy: Slot | null;
  winner: Slot | null;
  result: GameResult | null;
  date: string;
  sides: Record<Slot, ResultSide>;
}

export function fromGameView(g: GameView): ResultData {
  const mine: ResultSide = { ...g.me, patterns: g.me.guesses.map((x) => x.pattern), guesses: g.me.guesses };
  const theirs: ResultSide = { ...g.partner, guesses: g.partner.guesses };
  return {
    id: g.id, number: g.number, word: g.answer ?? '?????', wordAddedBy: g.word_added_by, winner: g.winner,
    result: g.result, date: g.completed_at ?? g.created_at,
    sides: g.me.slot === 1 ? { 1: mine, 2: theirs } : { 1: theirs, 2: mine },
  };
}

export function fromHistory(h: HistoryGame): ResultData {
  const side = (slot: Slot): ResultSide => {
    const p = h.players.find((x) => x.slot === slot)!;
    return { ...p, patterns: p.guesses.map((x) => x.pattern) };
  };
  return { id: h.id, number: h.number, word: h.word, wordAddedBy: h.word_added_by, winner: h.winner, result: h.result,
    date: h.completed_at, sides: { 1: side(1), 2: side(2) } };
}

function resultText(s: ResultSide) {
  if (s.status === 'solved') return 'Solved';
  return s.gave_up ? 'Gave up' : 'Failed';
}

export function shareText(d: ResultData, players: Record<Slot, Player>) {
  const line = (slot: Slot) => {
    const s = d.sides[slot];
    return `${d.winner === slot ? '🏆 ' : ''}${players[slot].name} ${s.status === 'solved' ? s.guess_count : 'X'}/6 · ${fmtDuration(s.duration_ms)}`;
  };
  const board = (slot: Slot) => `${players[slot].name}\n${d.sides[slot].patterns.map((p) => patternToEmoji(p)).join('\n')}`;
  const head = d.result === 'draw' ? 'Draw!' : d.result === 'both_failed' ? 'The word won 😅' : '';
  return [`Wordle for two #${d.number}`, head, line(1), line(2), '', board(1), '', board(2)].filter((x, i) => x || i > 1).join('\n');
}

export function ResultsView({ data, title, isToday }: { data: ResultData; title?: string; isToday?: boolean }) {
  const { players, toast } = useStore();
  const [showWords, setShowWords] = useState(false);
  const winner = data.winner ? players[data.winner] : null;
  const slots: Slot[] = [1, 2];
  const solvedMs = (x: ResultSide) => (x.status === 'solved' ? x.duration_ms : null);
  const fa = solvedMs(data.sides[1]);
  const fb = solvedMs(data.sides[2]);
  const faster: Slot | null = fa == null && fb == null ? null : fa == null ? 2 : fb == null ? 1 : fa === fb ? null : fa < fb ? 1 : 2;
  const wonOnTime = !!data.winner && data.sides[1].status === 'solved' && data.sides[2].status === 'solved'
    && data.sides[1].guess_count === data.sides[2].guess_count;
  const fewer: Slot | null = (() => {
    const s = (x: ResultSide) => (x.status === 'solved' ? x.guess_count : 99);
    const a = s(data.sides[1]);
    const b = s(data.sides[2]);
    return a === b ? null : a < b ? 1 : 2;
  })();

  async function share() {
    const text = shareText(data, players);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied to clipboard');
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="results">
      <p className="eyebrow">{title ?? (isToday ? "Today's word" : `Game #${data.number} · ${fmtDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' })}`)}</p>
      <div className="results-word">
        <WordTiles word={data.word} size={46} animate />
      </div>
      {data.wordAddedBy && <p className="added-by">Word added by {players[data.wordAddedBy].name}</p>}

      <div className={`winner-card ${data.result ?? ''}`}>
        {winner ? (
          <>
            <div className="crown-wrap">
              <span className="crown" aria-hidden="true">👑</span>
              <Avatar player={winner} size={64} ring />
            </div>
            <p className="eyebrow">Winner</p>
            <p className="winner-name">{winner.name}</p>
            {wonOnTime && (
              <p className="muted">Both solved in {data.sides[1].guess_count}, so the clock decided it ⏱️</p>
            )}
          </>
        ) : data.result === 'draw' ? (
          <>
            <div className="draw-avatars"><Avatar player={players[1]} size={52} /><Avatar player={players[2]} size={52} /></div>
            <p className="winner-name">It's a draw!</p>
            <p className="muted">Same guesses, same time. Unbelievable.</p>
          </>
        ) : (
          <>
            <p className="winner-emoji" aria-hidden="true">😵‍💫</p>
            <p className="winner-name">The word won</p>
            <p className="muted">Nobody cracked it this time</p>
          </>
        )}
      </div>

      <table className="compare">
        <thead>
          <tr>
            <th />
            {slots.map((s) => (
              <th key={s} className={data.winner === s ? 'won' : ''}>
                <span className="th-player"><Avatar player={players[s]} size={22} />{players[s].name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Result</td>
            {slots.map((s) => <td key={s} className={data.sides[s].status === 'solved' ? 'good' : 'bad'}>{resultText(data.sides[s])}</td>)}
          </tr>
          <tr>
            <td>Attempts</td>
            {slots.map((s) => <td key={s} className={fewer === s ? 'best' : ''}>{data.sides[s].status === 'solved' ? data.sides[s].guess_count : 'X'}/6</td>)}
          </tr>
          <tr>
            <td>Time</td>
            {slots.map((s) => <td key={s} className={faster === s ? 'best' : ''}>{fmtDuration(data.sides[s].duration_ms)}</td>)}
          </tr>
        </tbody>
      </table>

      <div className="boards">
        {slots.map((s) => (
          <div className="board-card" key={s}>
            <p className="board-card-name"><Avatar player={players[s]} size={22} />{players[s].name}</p>
            {showWords && data.sides[s].guesses ? (
              <div className="board-words">
                {data.sides[s].guesses!.map((g, i) => <WordTiles key={i} word={g.word} pattern={g.pattern} size={22} />)}
              </div>
            ) : (
              <MiniGrid patterns={data.sides[s].patterns} cell={20} gap={4} showEmpty={false} />
            )}
          </div>
        ))}
      </div>
      <div className="results-actions">
        <button className="btn ghost" onClick={() => setShowWords((x) => !x)}>
          <Icon name="eye" size={18} /> {showWords ? 'Hide guesses' : 'Show guesses'}
        </button>
        <button className="btn ghost" onClick={share}>
          <Icon name="share" size={18} /> Share
        </button>
      </div>
    </div>
  );
}
