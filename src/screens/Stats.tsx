import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { TopBar } from '../components/TopBar';
import { fmtDuration } from '../lib/clock';
import { awards, headToHead, playerStats, type PlayerStats } from '../lib/stats';
import { api } from '../lib/api';
import type { GameMode, HistoryGame, Slot, SoloStats } from '../lib/types';
import { load, save } from '../lib/storage';
import { useStore } from '../store';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number | null, d = 2) => (x == null ? '–' : x.toFixed(d));

function Distribution({ s, color, plus = false }: { s: PlayerStats; color: string; plus?: boolean }) {
  const max = Math.max(1, ...s.distribution, s.failed);
  const rows = [...s.distribution.map((c, i) => ({ label: plus && i === 5 ? '6+' : String(i + 1), c })), { label: 'X', c: s.failed }];
  return (
    <div className="dist" role="img" aria-label={`Guess distribution: ${rows.map((r) => `${r.label}: ${r.c}`).join(', ')}`}>
      {rows.map((r) => (
        <div className="dist-row" key={r.label}>
          <span className="dist-label">{r.label}</span>
          <span className="dist-track">
            <span className={`dist-bar ${color}${r.c === 0 ? ' zero' : ''}`} style={{ width: `${Math.max(r.c / max, 0) * 100}%` }} />
          </span>
          <span className="dist-count">{r.c}</span>
        </div>
      ))}
    </div>
  );
}

type Mode = 'classic' | 'challenge' | 'endless' | 'sabotage' | 'solo';
const MODES: { id: Mode; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'challenge', label: 'Challenge ⚔️' },
  { id: 'endless', label: 'Endless ♾️' },
  { id: 'sabotage', label: 'Sabotage 😈' },
  { id: 'solo', label: 'Solo' },
];
type Row = { label: string; v: [string, string]; best: Slot | null };

const better = (a: number | null, b: number | null, lowerIsBetter: boolean): Slot | null => {
  if (a == null || b == null || a === b) return null;
  return (lowerIsBetter ? a < b : a > b) ? 1 : 2;
};

function battleRows(s: Record<Slot, PlayerStats>): Row[] {
  return [
    { label: 'Games played', v: [String(s[1].played), String(s[2].played)], best: null },
    { label: 'Win rate', v: [pct(s[1].battleWinRate), pct(s[2].battleWinRate)], best: better(s[1].battleWinRate, s[2].battleWinRate, false) },
    { label: 'Solve rate', v: [pct(s[1].solveRate), pct(s[2].solveRate)], best: better(s[1].solveRate, s[2].solveRate, false) },
    { label: 'Average guesses', v: [num(s[1].avgGuesses), num(s[2].avgGuesses)], best: better(s[1].avgGuesses, s[2].avgGuesses, true) },
    { label: 'Average solve time', v: [fmtDuration(s[1].avgSolveMs), fmtDuration(s[2].avgSolveMs)], best: better(s[1].avgSolveMs, s[2].avgSolveMs, true) },
    { label: 'Fastest solve', v: [fmtDuration(s[1].fastestSolveMs), fmtDuration(s[2].fastestSolveMs)], best: better(s[1].fastestSolveMs, s[2].fastestSolveMs, true) },
    // v1.11: streaks are battles won in a row (they used to count rounds solved).
    { label: 'Current win streak', v: [String(s[1].currentWinStreak), String(s[2].currentWinStreak)], best: better(s[1].currentWinStreak, s[2].currentWinStreak, false) },
    { label: 'Longest win streak', v: [String(s[1].longestWinStreak), String(s[2].longestWinStreak)], best: better(s[1].longestWinStreak, s[2].longestWinStreak, false) },
    { label: 'Most common score', v: [s[1].mostCommonScore ? String(s[1].mostCommonScore) : '–', s[2].mostCommonScore ? String(s[2].mostCommonScore) : '–'], best: null },
  ];
}

const emptySolo = (x: Slot): SoloStats => ({ slot: x, played: 0, solved: 0, avg_guesses: null, best_ms: null, avg_ms: null, dist: [0, 0, 0, 0, 0, 0], streak: 0 });

function soloRows(a: SoloStats, b: SoloStats): Row[] {
  const n = (v: number | string | null) => (v == null ? null : Number(v));
  const rate = (r: SoloStats) => (r.played ? r.solved / r.played : null);
  const top = (r: SoloStats) => { const m = Math.max(...r.dist); return m ? r.dist.indexOf(m) + 1 : null; };
  return [
    { label: 'Games played', v: [String(a.played), String(b.played)], best: null },
    { label: 'Solved', v: [String(a.solved), String(b.solved)], best: null },
    { label: 'Solve rate', v: [pct(rate(a)), pct(rate(b))], best: better(rate(a), rate(b), false) },
    { label: 'Average guesses', v: [num(n(a.avg_guesses)), num(n(b.avg_guesses))], best: better(n(a.avg_guesses), n(b.avg_guesses), true) },
    { label: 'Average solve time', v: [fmtDuration(n(a.avg_ms)), fmtDuration(n(b.avg_ms))], best: better(n(a.avg_ms), n(b.avg_ms), true) },
    { label: 'Fastest solve', v: [fmtDuration(a.best_ms), fmtDuration(b.best_ms)], best: better(a.best_ms, b.best_ms, true) },
    { label: 'Solved in a row', v: [String(a.streak), String(b.streak)], best: better(a.streak, b.streak, false) },
    { label: 'Most common score', v: [top(a) ? String(top(a)) : '–', top(b) ? String(top(b)) : '–'], best: null },
  ];
}

/** Solo numbers in the same shape as a battle player's, for the distribution chart. */
function soloAsPlayer(r: SoloStats): PlayerStats {
  return { ...playerStats([], r.slot), played: r.played, solved: r.solved, failed: r.played - r.solved, distribution: r.dist.map(Number) };
}

const NOTES: Record<Mode, string> = {
  classic: 'Classic battles only: one random word, the same for both of you.',
  challenge: 'Challenge battles only: each of you solves the word the other picked.',
  endless: 'Endless races only: no limit on guesses, the first to find the word wins. Guess averages run higher here.',
  sabotage: 'Sabotage battles only: Classic rules, plus three powers each.',
  solo: "Solo games only. They're kept apart from the battles.",
};

export function StatsScreen() {
  const { history, soloHistory, players, refreshHistory } = useStore();
  const [distFor, setDistFor] = useState<Slot>(1);
  const [solo, setSolo] = useState<SoloStats[] | null>(null);
  // v1.12: one table for all three modes, switched with the toggle (remembered on this phone).
  const [mode, setModeState] = useState<Mode>(() => load<Mode>('bbw.statsMode', 'classic'));
  const setMode = (m: Mode) => { setModeState(m); save('bbw.statsMode', m); };
  useEffect(() => {
    void refreshHistory();
    api.soloStats().then(setSolo).catch(() => setSolo([]));
  }, [refreshHistory]);

  const games = history ?? [];
  const h = useMemo(() => headToHead(games), [games]);
  const byMode = useMemo(() => {
    const of = (m: GameMode) => games.filter((g) => (g.mode ?? 'classic') === m);
    const st = (gs: HistoryGame[]) => ({ 1: playerStats(gs, 1), 2: playerStats(gs, 2) }) as Record<Slot, PlayerStats>;
    return { classic: st(of('classic')), challenge: st(of('challenge')), endless: st(of('endless')), sabotage: st(of('sabotage')) };
  }, [games]);
  const names = { 1: players[1].name, 2: players[2].name };
  const fun = useMemo(() => awards(games, names, fmtDuration, solo ?? [], soloHistory ?? []), [games, solo, soloHistory, names[1], names[2]]); // eslint-disable-line

  if (history === null) {
    return (
      <div className="screen scroll">
        <TopBar title="Stats" />
        <div className="pad"><div className="skeleton" style={{ height: 300 }} /></div>
      </div>
    );
  }
  const soloA = solo?.find((r) => r.slot === 1) ?? emptySolo(1);
  const soloB = solo?.find((r) => r.slot === 2) ?? emptySolo(2);
  const soloPlayed = soloA.played + soloB.played;
  if (games.length === 0 && soloPlayed === 0) {
    return (
      <div className="screen scroll">
        <TopBar title="Stats" />
        <div className="empty">
          <p className="empty-emoji" aria-hidden="true">📊</p>
          <h2>No stats yet</h2>
          <p className="muted">Finish your first battle (or a solo game) and the scoreboard comes alive.</p>
        </div>
      </div>
    );
  }

  const total = h.wins[1] + h.wins[2] + h.draws + h.bothFailed;
  const modeGames = mode === 'solo' ? soloPlayed : byMode[mode][1].played;
  const rows = mode === 'solo' ? soloRows(soloA, soloB) : battleRows(byMode[mode]);
  const dist: Record<Slot, PlayerStats> = mode === 'solo' ? { 1: soloAsPlayer(soloA), 2: soloAsPlayer(soloB) } : byMode[mode];
  const modeName = MODES.find((m) => m.id === mode)!.label;

  return (
    <div className="screen scroll">
      <TopBar title="Stats" />

      {games.length > 0 && (
        <section className="card h2h">
          <p className="eyebrow">Head to head</p>
          <div className="h2h-score">
            <div className="h2h-side"><Avatar player={players[1]} size={52} ring={h.wins[1] > h.wins[2]} /><b>{h.wins[1]}</b><span>{names[1]}</span></div>
            <div className="h2h-mid"><b>{h.draws}</b><span>draws</span></div>
            <div className="h2h-side"><Avatar player={players[2]} size={52} ring={h.wins[2] > h.wins[1]} /><b>{h.wins[2]}</b><span>{names[2]}</span></div>
          </div>
          <div className="h2h-bar" aria-hidden="true">
            <span className="p1" style={{ flex: h.wins[1] || 0.0001 }} />
            <span className="draw" style={{ flex: h.draws + h.bothFailed || 0.0001 }} />
            <span className="p2" style={{ flex: h.wins[2] || 0.0001 }} />
          </div>
          <p className="muted small center-text">
            {total} game{total === 1 ? '' : 's'}
            {h.bothFailed ? ` · the word won ${h.bothFailed}` : ''}
            {h.winStreak.slot && h.winStreak.length > 1 ? ` · ${names[h.winStreak.slot]} has won ${h.winStreak.length} in a row 🔥` : ''}
          </p>
          <div className="mode-split">
            {(['classic', 'challenge', 'endless', 'sabotage'] as const).filter((m) => (m !== 'endless' && m !== 'sabotage') || h.byMode[m].games > 0).map((m) => (
              <div key={m} className="mode-split-item">
                <span className="mode-split-label">{m === 'classic' ? 'Classic' : m === 'challenge' ? 'Challenge ⚔️' : m === 'endless' ? 'Endless ♾️' : 'Sabotage 😈'}</span>
                <span className="mode-split-score">
                  {names[1]} <b>{h.byMode[m].wins[1]}</b> · <b>{h.byMode[m].wins[2]}</b> {names[2]}
                </span>
                <span className="mode-split-games">{h.byMode[m].games} game{h.byMode[m].games === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card mode-stats" aria-label={`${modeName} stats`}>
        <div className="segmented mode-toggle" role="tablist" aria-label="Mode">
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {modeGames === 0 ? (
          <p className="muted small mode-empty">No {mode === 'solo' ? 'solo' : mode} games yet.</p>
        ) : (
          <table className="stats-table">
            <thead>
              <tr>
                <th />
                <th><span className="th-player"><Avatar player={players[1]} size={22} />{names[1]}</span></th>
                <th><span className="th-player"><Avatar player={players[2]} size={22} />{names[2]}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className={r.best === 1 ? 'best p1' : ''}>{r.v[0]}</td>
                  <td className={r.best === 2 ? 'best p2' : ''}>{r.v[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">
          {NOTES[mode]}
          {mode !== 'solo' ? ' Win rate and win streaks count battles won (a draw or a loss ends a streak). Averages use solved rounds.' : ' Averages use solved games.'}
        </p>
      </section>

      {modeGames > 0 && (
        <section className="card">
          <div className="section-head">
            <h3>Guess distribution <span className="muted small">· {modeName}</span></h3>
            <div className="segmented small">
              {([1, 2] as Slot[]).map((x) => (
                <button key={x} className={distFor === x ? 'on' : ''} onClick={() => setDistFor(x)} aria-pressed={distFor === x}>{names[x]}</button>
              ))}
            </div>
          </div>
          <Distribution s={dist[distFor]} color={`p${distFor}`} plus={mode === 'endless'} />
        </section>
      )}

      {fun.length > 0 && (
        <section className="section">
          <h3>Hall of fame</h3>
          <div className="awards">
            {fun.map((a) => (
              <div key={a.id} className={`award${a.holder ? ` p${a.holder}` : ''}`}>
                <span className="award-emoji" aria-hidden="true">{a.emoji}</span>
                <p className="award-title">{a.title}</p>
                <p className="award-value">{a.value}</p>
                <p className="award-detail">{a.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
