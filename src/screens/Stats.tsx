import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { TopBar } from '../components/TopBar';
import { fmtDuration } from '../lib/clock';
import { awards, headToHead, playerStats, type PlayerStats } from '../lib/stats';
import type { Slot } from '../lib/types';
import { useStore } from '../store';

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number | null, d = 2) => (x == null ? '–' : x.toFixed(d));

function Distribution({ s, color }: { s: PlayerStats; color: string }) {
  const max = Math.max(1, ...s.distribution, s.failed);
  const rows = [...s.distribution.map((c, i) => ({ label: String(i + 1), c })), { label: 'X', c: s.failed }];
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

export function StatsScreen() {
  const { history, words, players, refreshHistory } = useStore();
  const [distFor, setDistFor] = useState<Slot>(1);
  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const games = history ?? [];
  const s = useMemo(() => ({ 1: playerStats(games, 1), 2: playerStats(games, 2) }), [games]);
  const h = useMemo(() => headToHead(games), [games]);
  const names = { 1: players[1].name, 2: players[2].name };
  const fun = useMemo(() => awards(games, words ?? [], names, fmtDuration), [games, words, names[1], names[2]]); // eslint-disable-line

  if (history === null) {
    return (
      <div className="screen scroll">
        <TopBar title="Stats" />
        <div className="pad"><div className="skeleton" style={{ height: 300 }} /></div>
      </div>
    );
  }
  if (games.length === 0) {
    return (
      <div className="screen scroll">
        <TopBar title="Stats" />
        <div className="empty">
          <p className="empty-emoji" aria-hidden="true">📊</p>
          <h2>No stats yet</h2>
          <p className="muted">Finish your first battle and the scoreboard comes alive.</p>
        </div>
      </div>
    );
  }

  const total = h.wins[1] + h.wins[2] + h.draws + h.bothFailed;
  const better = (a: number | null, b: number | null, lowerIsBetter: boolean): Slot | null => {
    if (a == null || b == null || a === b) return null;
    return (lowerIsBetter ? a < b : a > b) ? 1 : 2;
  };
  const rows: { label: string; v: [string, string]; best: Slot | null }[] = [
    { label: 'Games played', v: [String(s[1].played), String(s[2].played)], best: null },
    { label: 'Win rate', v: [pct(s[1].battleWinRate), pct(s[2].battleWinRate)], best: better(s[1].battleWinRate, s[2].battleWinRate, false) },
    { label: 'Solve rate', v: [pct(s[1].solveRate), pct(s[2].solveRate)], best: better(s[1].solveRate, s[2].solveRate, false) },
    { label: 'Average guesses', v: [num(s[1].avgGuesses), num(s[2].avgGuesses)], best: better(s[1].avgGuesses, s[2].avgGuesses, true) },
    { label: 'Average solve time', v: [fmtDuration(s[1].avgSolveMs), fmtDuration(s[2].avgSolveMs)], best: better(s[1].avgSolveMs, s[2].avgSolveMs, true) },
    { label: 'Fastest solve', v: [fmtDuration(s[1].fastestSolveMs), fmtDuration(s[2].fastestSolveMs)], best: better(s[1].fastestSolveMs, s[2].fastestSolveMs, true) },
    { label: 'Current streak', v: [String(s[1].currentStreak), String(s[2].currentStreak)], best: better(s[1].currentStreak, s[2].currentStreak, false) },
    { label: 'Longest streak', v: [String(s[1].longestStreak), String(s[2].longestStreak)], best: better(s[1].longestStreak, s[2].longestStreak, false) },
    { label: 'Most common score', v: [s[1].mostCommonScore ? String(s[1].mostCommonScore) : '–', s[2].mostCommonScore ? String(s[2].mostCommonScore) : '–'], best: null },
  ];

  return (
    <div className="screen scroll">
      <TopBar title="Stats" />

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
      </section>

      <section className="card">
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
        <p className="muted small">Win rate counts battles won. Solve rate counts rounds solved. Averages use solved rounds.</p>
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Guess distribution</h3>
          <div className="segmented small">
            {([1, 2] as Slot[]).map((x) => (
              <button key={x} className={distFor === x ? 'on' : ''} onClick={() => setDistFor(x)} aria-pressed={distFor === x}>{names[x]}</button>
            ))}
          </div>
        </div>
        <Distribution s={s[distFor]} color={`p${distFor}`} />
      </section>

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
