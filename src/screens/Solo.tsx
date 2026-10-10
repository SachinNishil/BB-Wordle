// Solo (v1.8): plain Wordle on your own phone. No score, no stats, no history,
// nothing sent to your partner. The word is picked on the phone from the
// everyday words, and the game is kept on the phone so a reload resumes it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board, REVEAL_MS } from '../components/Board';
import { Icon } from '../components/Icon';
import { Keyboard } from '../components/Keyboard';
import { WordTiles } from '../components/Tiles';
import { loadDictionary } from '../lib/dictionary';
import { SOLO_WORDS } from '../lib/soloWords';
import { load, save } from '../lib/storage';
import { evaluate, keyboardStates, MAX_GUESSES } from '../lib/wordle';
import { back, go } from '../router';
import { useStore } from '../store';

interface SoloGame { answer: string; guesses: { word: string; pattern: string }[] }
const KEY = 'bbw.solo';
const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

function newGame(prev?: string): SoloGame {
  let answer = prev ?? '';
  while (!answer || answer === prev) answer = SOLO_WORDS[Math.floor(Math.random() * SOLO_WORDS.length)];
  return { answer, guesses: [] };
}

export function SoloScreen() {
  const { toast } = useStore();
  const [game, setGame] = useState<SoloGame>(() => load<SoloGame | null>(KEY, null) ?? newGame());
  const [typed, setTyped] = useState('');
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [bounceRow, setBounceRow] = useState<number | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => save(KEY, game), [game]);

  const solved = game.guesses.some((g) => g.pattern === 'GGGGG');
  const over = solved || game.guesses.length >= MAX_GUESSES;
  const revealing = revealRow !== null;

  const doShake = useCallback((msg: string) => {
    setShake(true);
    navigator.vibrate?.(60);
    toast(msg);
    setTimeout(() => setShake(false), 600);
  }, [toast]);

  const submit = useCallback(async () => {
    if (typed.length < 5) return doShake('Not enough letters');
    const dict = await loadDictionary();
    if (dict.size > 0 && !dict.has(typed)) return doShake('Not in word list');
    const pattern = evaluate(typed, game.answer);
    const row = game.guesses.length;
    setGame((g) => ({ ...g, guesses: [...g.guesses, { word: typed, pattern }] }));
    setTyped('');
    setRevealRow(row);
    setTimeout(() => {
      setRevealRow(null);
      if (pattern === 'GGGGG') {
        setBounceRow(row);
        toast(PRAISE[row] ?? 'Solved!', 'win');
        setTimeout(() => setBounceRow(null), 1200);
      } else if (row + 1 >= MAX_GUESSES) {
        toast(game.answer, 'info');
      }
    }, REVEAL_MS);
  }, [typed, game, doShake, toast]);

  const onKey = useCallback((k: string) => {
    if (over || revealing) return;
    if (k === 'Enter') void submit();
    else if (k === 'Backspace') setTyped((t) => t.slice(0, -1));
    else if (/^[a-z]$/i.test(k)) setTyped((t) => (t.length < 5 ? t + k.toUpperCase() : t));
  }, [over, revealing, submit]);

  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
        e.preventDefault();
        keyRef.current(e.key);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const shown = revealing ? game.guesses.slice(0, revealRow!) : game.guesses;
  const finished = over && !revealing;

  return (
    <div className="screen game solo">
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">Solo <span className="topbar-clock">· just for fun</span></h1>
        <div className="topbar-right" />
      </header>
      <Board guesses={game.guesses} current={typed} revealRow={revealRow} shake={shake} bounceRow={bounceRow} active={!over} />
      {finished ? (
        <div className="finished-panel solo-done">
          <div className="finished-head">
            <p className="eyebrow">{solved ? `Solved in ${game.guesses.length}` : 'Out of guesses'}</p>
            <WordTiles word={game.answer} size={30} />
          </div>
          <p className="muted small">Solo games don't count anywhere. Nobody else sees them.</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => go('/', true)}>Home</button>
            <button className="btn primary" onClick={() => { setGame(newGame(game.answer)); setTyped(''); }}>Play again</button>
          </div>
        </div>
      ) : (
        <Keyboard states={keyboardStates(shown)} onKey={onKey} disabled={revealing} />
      )}
    </div>
  );
}
