import { useEffect, useState } from 'react';
import { renderResultImage } from '../lib/shareImage';
import { fmtDate, fmtDuration } from '../lib/clock';
import type { GameMode, GameResult, GameView, GuessRow, HistoryGame, Player, PlayerStatus, Slot } from '../lib/types';
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
  mode: GameMode;
  /** Classic: the shared word. Challenge: unused (see words). */
  word: string;
  /** The word each player solved. Same word twice in classic. */
  words: Record<Slot, string>;
  wordAddedBy: Slot | null;
  winner: Slot | null;
  result: GameResult | null;
  date: string;
  sides: Record<Slot, ResultSide>;
}

export function fromGameView(g: GameView): ResultData {
  const mine: ResultSide = { ...g.me, patterns: g.me.guesses.map((x) => x.pattern), guesses: g.me.guesses };
  const theirs: ResultSide = { ...g.partner, guesses: g.partner.guesses };
  const mineW = g.answer ?? '?????';
  const theirW = g.partner_answer ?? mineW;
  return {
    id: g.id, number: g.number, mode: g.mode ?? 'classic', word: mineW,
    words: g.me.slot === 1 ? { 1: mineW, 2: theirW } : { 1: theirW, 2: mineW },
    wordAddedBy: g.word_added_by, winner: g.winner,
    result: g.result, date: g.completed_at ?? g.created_at,
    sides: g.me.slot === 1 ? { 1: mine, 2: theirs } : { 1: theirs, 2: mine },
  };
}

export function fromHistory(h: HistoryGame): ResultData {
  const side = (slot: Slot): ResultSide => {
    const p = h.players.find((x) => x.slot === slot)!;
    return { ...p, patterns: p.guesses.map((x) => x.pattern) };
  };
  const w1 = h.word_for_1 ?? h.word ?? '?????';
  const w2 = h.word_for_2 ?? h.word ?? '?????';
  return { id: h.id, number: h.number, mode: h.mode ?? 'classic', word: h.word ?? w1, words: { 1: w1, 2: w2 },
    wordAddedBy: h.word_added_by, winner: h.winner, result: h.result,
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
  const title = d.mode === 'challenge' ? `Wordle for two #${d.number} · Challenge ⚔️` : `Wordle for two #${d.number}`;
  return [title, head, line(1), line(2), '', board(1), '', board(2)].filter((x, i) => x || i > 1).join('\n');
}

export function ResultsView({ data, title, isToday }: { data: ResultData; title?: string; isToday?: boolean }) {
  const { players, toast } = useStore();
  const [showWords, setShowWords] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
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
      <p className="eyebrow">{title ?? (data.mode === 'challenge'
        ? `Challenge ⚔️ · ${isToday ? "today's words" : `game #${data.number} · ${fmtDate(data.date, { day: 'numeric', month: 'long' })}`}`
        : isToday ? "Today's word" : `Game #${data.number} · ${fmtDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' })}`)}</p>
      {data.mode === 'challenge' ? (
        <div className="challenge-words">
          {slots.map((s) => (
            <div key={s} className="challenge-word">
              <p className="challenge-word-label"><Avatar player={players[s]} size={20} /> {players[s].name}'s word</p>
              <WordTiles word={data.words[s]} size={38} animate />
              <p className="added-by">picked by {players[(3 - s) as Slot].name}</p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="results-word">
            <WordTiles word={data.word} size={46} animate />
          </div>
          {data.wordAddedBy && <p className="added-by">Word added by {players[data.wordAddedBy].name}</p>}
        </>
      )}

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
      <div className="results-actions three">
        <button className="btn ghost" onClick={() => setShowWords((x) => !x)}>
          <Icon name="eye" size={18} /> {showWords ? 'Hide guesses' : 'Show guesses'}
        </button>
        <button className="btn ghost" onClick={share}>
          <Icon name="text" size={18} /> Share as text
        </button>
        <button className="btn ghost" onClick={() => setImageOpen(true)}>
          <Icon name="image" size={18} /> Share as image
        </button>
      </div>
      {imageOpen && <ShareImageModal data={data} players={players} onClose={() => setImageOpen(false)} />}
    </div>
  );
}

/** Builds the picture first, then shares it on a second tap (iPhones only allow sharing straight from a tap). */
function ShareImageModal({ data, players, onClose }: { data: ResultData; players: Record<Slot, Player>; onClose: () => void }) {
  const { toast } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const name = `wordle-for-two-${data.number}.png`;
  // Freeze what we draw when the sheet opens (the parent re-renders on every sync).
  const [snap] = useState(() => ({ data, players }));

  useEffect(() => {
    let gone = false;
    let made: string | null = null;
    renderResultImage(snap.data, snap.players)
      .then((blob) => {
        if (gone) return;
        made = URL.createObjectURL(blob);
        setFile(new File([blob], name, { type: 'image/png' }));
        setUrl(made);
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [snap, name]);

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  async function shareIt() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `Wordle for Two #${data.number}` });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('Sharing didn\'t work here. Save the image instead.', 'error');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" role="dialog" aria-modal="true" aria-label="Share as image" onClick={(e) => e.stopPropagation()}>
        <h3>Share as image</h3>
        {url ? <img className="share-preview" src={url} alt={`Game #${data.number}: both boards`} /> : failed ? (
          <p className="muted">Couldn't draw the picture on this device.</p>
        ) : <div className="loader" aria-label="Drawing the picture" />}
        {url && <p className="muted small">Tip: you can also press and hold the picture to save or copy it.</p>}
        <div className="modal-actions">
          {canShare ? (
            <button className="btn primary" onClick={shareIt}><Icon name="share" size={18} /> Share</button>
          ) : url ? (
            <a className="btn primary" href={url} download={name}><Icon name="download" size={18} /> Save image</a>
          ) : null}
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
