// Watching your partner's solo game (v1.10): their board with every guess and
// what they're typing, their clock, the word, and the same trash talk dock as
// spectating a battle (emojis burst over their board, messages pop up).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board, REVEAL_MS } from '../components/Board';
import { Icon } from '../components/Icon';
import { Elapsed } from '../components/Live';
import { WordTiles } from '../components/Tiles';
import { TrashTalk, useFeedTaunts } from '../components/TrashTalk';
import { api } from '../lib/api';
import { serverNow } from '../lib/clock';
import type { SoloView } from '../lib/types';
import { back, go } from '../router';
import { useStore } from '../store';

export function SoloWatchScreen({ id }: { id: string }) {
  const { slot, players, pulse, ping, partnerTyping, setSoloState, solo: liveSolo } = useStore();
  const [solo, setSolo] = useState<SoloView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reveal, setReveal] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!slot) return;
    try {
      const st = await api.soloState(slot, id);
      setSoloState(st);
      setSolo(st.solo);
      setLoaded(true);
    } catch {
      /* offline: keep what we have */
    }
  }, [slot, id, setSoloState]);
  useEffect(() => { void reload(); }, [reload, pulse]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, 2000);
    return () => clearInterval(t);
  }, [reload]);
  useFeedTaunts(solo, slot);

  // Flip in each new row they play.
  const count = solo?.guesses.length ?? null;
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = count;
    if (p === null || count === null || count !== p + 1) return;
    setReveal(count - 1);
    const t = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [count]);

  // Read receipts for the player's messages.
  const unseenTop = (solo?.taunts ?? []).filter((t) => slot && t.from !== slot && !t.seen).reduce((m, t) => Math.max(m, t.id), 0);
  useEffect(() => {
    if (!unseenTop || !slot || document.visibilityState !== 'visible') return;
    api.markTauntsSeen(slot, id, unseenTop).then(() => ping('game', 'seen')).catch(() => {});
  }, [unseenTop, slot, id, ping]);

  if (!slot) return null;
  if (loaded && (!solo || solo.slot === slot)) {
    return (
      <div className="screen game spectate">
        <header className="topbar">
          <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
          <h1 className="topbar-title">Solo</h1>
          <div className="topbar-right" />
        </header>
        <div className="empty">
          <h2>Nothing to watch</h2>
          <p className="muted">That solo game isn't around any more.</p>
          <button className="btn primary" onClick={() => go('/', true)}>Home</button>
        </div>
      </div>
    );
  }
  if (!solo) {
    return (
      <div className="screen game spectate">
        <div className="solo-loading"><span className="loader" aria-label="Loading" /></div>
      </div>
    );
  }

  const player = players[solo.slot];
  const playing = solo.status === 'playing';
  const counting = playing && Date.parse(solo.started_at) > serverNow();
  // Live typing: the newer of the live message and the server's copy.
  const row = solo.guesses.length;
  const fromLive = partnerTyping && partnerTyping.game === solo.id && partnerTyping.row === row && Date.now() - partnerTyping.at < 20000
    ? { text: partnerTyping.text, at: partnerTyping.at + (serverNow() - Date.now()) } : null;
  const fromServer = solo.draft != null && solo.draft_at ? { text: solo.draft, at: Date.parse(solo.draft_at) || 0 } : null;
  const newest = fromLive && fromServer ? (fromLive.at >= fromServer.at - 300 ? fromLive : fromServer) : fromLive ?? fromServer;
  const live = playing && newest ? newest.text : null;
  const done = !playing && reveal === null;
  const next = liveSolo.partner && liveSolo.partner.id !== solo.id ? liveSolo.partner : null;
  const verdict = solo.status === 'solved' ? `${player.name} solved it in ${solo.guesses.length}` : solo.gave_up ? `${player.name} gave up` : `${player.name} ran out of guesses`;

  return (
    <div className="screen game spectate solo-watch">
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">
          👀 Watching {player.name}
          <span className="topbar-clock spectate-clock" aria-label={`${player.name}'s time`}>
            {' '}· <Elapsed startedAt={solo.started_at} durationMs={solo.duration_ms} />
          </span>
        </h1>
        <div className="topbar-right" />
      </header>
      <div className="spectate-line">
        {done ? (
          <span>{verdict}</span>
        ) : counting ? (
          <span>{player.name} is about to start a solo game…</span>
        ) : (
          <span>Solo · guess {Math.min(row + 1, 6)}/6 · hunting for</span>
        )}
        {solo.word && <WordTiles word={solo.word} size={22} />}
      </div>
      <Board guesses={solo.guesses} current={live ?? ''} revealRow={reveal} shake={false} bounceRow={null}
        active={live !== null && reveal === null} label={`${player.name}'s guesses`} />
      <TrashTalk game={solo} slot={slot} players={players} onGame={setSolo} variant="dock" solo />
      {done && (
        <div className="solo-watch-done">
          <button className="btn ghost" onClick={() => go('/', true)}>Back home</button>
          {next && <button className="btn primary" onClick={() => go(`/solo/watch/${next.id}`, true)}>Watch the next one</button>}
        </div>
      )}
    </div>
  );
}
