import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { fromHistory, ResultsView } from '../components/Results';
import { WordTiles } from '../components/Tiles';
import { TopBar } from '../components/TopBar';
import { fmtDate } from '../lib/clock';
import { go } from '../router';
import { useStore } from '../store';
import { historyLine } from './Home';

export function HistoryScreen() {
  const { history, players, refreshHistory } = useStore();
  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // Group by month for easy scanning.
  const groups: { label: string; items: NonNullable<typeof history> }[] = [];
  for (const g of history ?? []) {
    const label = fmtDate(g.completed_at, { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(g);
    else groups.push({ label, items: [g] });
  }

  return (
    <div className="screen scroll">
      <TopBar title="History" />
      {history === null ? (
        <div className="pad"><div className="skeleton" style={{ height: 200 }} /></div>
      ) : history.length === 0 ? (
        <div className="empty">
          <p className="empty-emoji" aria-hidden="true">📜</p>
          <h2>No games yet</h2>
          <p className="muted">Every finished battle is kept here for good.</p>
        </div>
      ) : (
        groups.map((grp) => (
          <section key={grp.label} className="section">
            <h3 className="month">{grp.label}</h3>
            <ul className="history-list">
              {grp.items.map((g) => {
                const line = historyLine(g, players);
                return (
                  <li key={g.id}>
                    <button className="history-row" onClick={() => go(`/history/${g.id}`)}>
                      <span className="history-date">
                        <b>{fmtDate(g.completed_at, { day: 'numeric' })}</b>
                        <small>{fmtDate(g.completed_at, { weekday: 'short' })}</small>
                      </span>
                      <span className="history-main">
                        <WordTiles word={g.word} size={24} />
                        <span className="history-lines">
                          <span className="history-top">{line.top}</span>
                          {line.bottom && <span className="history-bottom">{line.bottom}</span>}
                        </span>
                      </span>
                      <Icon name="chevron" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function HistoryDetail({ id }: { id: string }) {
  const { history, refreshHistory } = useStore();
  useEffect(() => {
    if (!history) void refreshHistory();
  }, [history, refreshHistory]);
  const g = history?.find((x) => x.id === id);
  return (
    <div className="screen scroll">
      <TopBar title={g ? `Game #${g.number}` : 'Game'} />
      {!history ? (
        <div className="pad"><div className="skeleton" style={{ height: 300 }} /></div>
      ) : !g ? (
        <div className="empty"><h2>Game not found</h2></div>
      ) : (
        <ResultsView data={fromHistory(g)} />
      )}
    </div>
  );
}
