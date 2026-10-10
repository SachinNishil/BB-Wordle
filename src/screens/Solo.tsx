// Solo (v1.8, server-backed since v1.10): plain Wordle on your own, with the
// same 3, 2, 1 and clock as a battle. Solo games have their own table in Stats
// and never touch the battle numbers. Your partner can watch from Home, and
// trash talk you while they do (the soundboard works both ways).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Board, REVEAL_MS } from '../components/Board';
import { Countdown } from '../components/Countdown';
import { Icon } from '../components/Icon';
import { Keyboard } from '../components/Keyboard';
import { Elapsed } from '../components/Live';
import { WordTiles } from '../components/Tiles';
import { Soundboard, TrashTalk, useFeedTaunts } from '../components/TrashTalk';
import { api, ApiError } from '../lib/api';
import { serverNow } from '../lib/clock';
import { loadDictionary } from '../lib/dictionary';
import type { Slot, SoloView } from '../lib/types';
import { keyboardStates } from '../lib/wordle';
import { back, go } from '../router';
import { useStore } from '../store';

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];

export function SoloScreen() {
  const { slot, players, toast, reportError, ping, pulse, sendTyping, setSoloState, partnerPresence } = useStore();
  const [solo, setSolo] = useState<SoloView | null>(null);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState('');
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [bounceRow, setBounceRow] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [counting, setCounting] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [starting, setStarting] = useState(false);
  const partner = slot ? players[(3 - slot) as Slot] : null;
  const watched = partnerPresence.some((p) => p.screen === 'watch');

  const start = useCallback(async () => {
    if (!slot) return;
    setStarting(true);
    try {
      const r = await api.soloStart(slot);
      setSolo(r.solo);
      setTyped('');
      setFailed(false);
      const fresh = Date.parse(r.solo.started_at) > serverNow();
      setCounting(fresh);
      if (fresh) ping('game', 'solo-start');
    } catch (e) {
      setFailed(true);
      reportError(e);
    } finally {
      setStarting(false);
    }
  }, [slot, ping, reportError]);

  // Opening Solo starts a game, or picks up the one you left.
  useEffect(() => { void start(); }, [start]);

  const id = solo?.id;
  const revealing = revealRow !== null;
  const reload = useCallback(async () => {
    if (!slot || !id) return;
    try {
      const st = await api.soloState(slot, id);
      setSoloState(st);
      // Don't let a slow refresh undo a guess that's still flipping in.
      if (st.solo) setSolo((cur) => (cur && st.solo!.guesses.length < cur.guesses.length ? cur : st.solo));
    } catch {
      /* offline: keep what we have */
    }
  }, [slot, id, setSoloState]);
  // Messages from whoever is watching: on every nudge, and every few seconds.
  useEffect(() => { void reload(); }, [pulse]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, watched ? 3000 : 10000);
    return () => clearInterval(t);
  }, [reload, watched]);
  useFeedTaunts(solo, slot);

  const playing = solo?.status === 'playing';
  const row = solo?.guesses.length ?? 0;

  // Live typing for the watcher: over the live channel, plus a saved copy.
  useEffect(() => {
    if (!playing || !id || !watched || counting) return;
    sendTyping(id, row, typed);
    const t = setInterval(() => sendTyping(id, row, typed), 3000);
    return () => clearInterval(t);
  }, [playing, id, row, typed, watched, counting, sendTyping]);
  const draftSent = useRef('');
  useEffect(() => {
    if (!playing || !id || !slot || counting) return;
    const key = `${id}|${row}|${typed}`;
    if (draftSent.current === key) return;
    const t = setTimeout(() => {
      draftSent.current = key;
      api.soloDraft(slot, id, typed).catch(() => { draftSent.current = ''; });
    }, typed ? 300 : 0);
    return () => clearTimeout(t);
  }, [playing, id, slot, row, typed, counting]);

  // Read receipts for the watcher's messages.
  const unseenTop = (solo?.taunts ?? []).filter((t) => slot && t.from !== slot && !t.seen).reduce((m, t) => Math.max(m, t.id), 0);
  useEffect(() => {
    if (!unseenTop || !slot || !id || document.visibilityState !== 'visible') return;
    api.markTauntsSeen(slot, id, unseenTop).then(() => ping('game', 'seen')).catch(() => {});
  }, [unseenTop, slot, id, ping]);

  const doShake = useCallback((msg: string) => {
    setShake(true);
    navigator.vibrate?.(60);
    toast(msg);
    setTimeout(() => setShake(false), 600);
  }, [toast]);

  const submit = useCallback(async () => {
    if (!slot || !solo || submitting) return;
    if (typed.length < 5) return doShake('Not enough letters');
    const dict = await loadDictionary();
    if (dict.size > 0 && !dict.has(typed)) return doShake('Not in word list');
    setSubmitting(true);
    try {
      const r = await api.soloGuess(slot, solo.id, typed, solo.guesses.length + 1);
      const at = solo.guesses.length;
      setSolo(r.solo);
      setTyped('');
      setRevealRow(at);
      ping('game', r.solo.status === 'playing' ? 'solo-guess' : 'solo-finished');
      setTimeout(() => {
        setRevealRow(null);
        if (r.pattern === 'GGGGG') {
          setBounceRow(at);
          toast(PRAISE[at] ?? 'Solved!', 'win');
          setTimeout(() => setBounceRow(null), 1200);
        } else if (r.solo.status === 'failed' && r.solo.word) {
          toast(r.solo.word, 'info');
        }
      }, REVEAL_MS);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_a_word') doShake('Not in word list');
      else {
        reportError(e);
        void reload();
      }
    } finally {
      setSubmitting(false);
    }
  }, [slot, solo, typed, submitting, doShake, toast, ping, reportError, reload]);

  const canType = playing && !revealing && !counting && !submitting;
  const onKey = useCallback((k: string) => {
    if (!canType) return;
    if (k === 'Enter') void submit();
    else if (k === 'Backspace') setTyped((t) => t.slice(0, -1));
    else if (/^[a-z]$/i.test(k)) setTyped((t) => (t.length < 5 ? t + k.toUpperCase() : t));
  }, [canType, submit]);

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

  async function giveUp() {
    if (!slot || !solo) return;
    setConfirmGiveUp(false);
    try {
      const r = await api.soloGiveUp(slot, solo.id);
      setSolo(r.solo);
      ping('game', 'solo-finished');
    } catch (e) {
      reportError(e);
      void reload();
    }
  }

  const guesses = solo?.guesses ?? [];
  const shown = revealing ? guesses.slice(0, revealRow!) : guesses;
  const finished = !!solo && !playing && !revealing;
  const solved = solo?.status === 'solved';
  const showTalk = finished && slot && partner && (watched || (solo?.taunts?.length ?? 0) > 0);

  return (
    <div className="screen game solo">
      <header className="topbar">
        <button className="iconbtn" onClick={() => back('/')} aria-label="Back"><Icon name="back" /></button>
        <h1 className="topbar-title">
          Solo
          {solo && (
            <span className="topbar-clock solo-clock" aria-label="Your time">
              {' '}· <Elapsed startedAt={solo.started_at} durationMs={solo.duration_ms} />
            </span>
          )}
        </h1>
        <div className="topbar-right">
          {playing && !counting && (
            <button className="iconbtn" onClick={() => setConfirmGiveUp(true)} aria-label="Give up"><Icon name="flag" size={20} /></button>
          )}
        </div>
      </header>

      {watched && playing && partner && slot && solo && (
        <div className="vs-strip chat-strip solo-strip">
          <Soundboard game={solo} slot={slot} solo />
          <span className="watching-chip" role="status">👀 {partner.name} is watching</span>
        </div>
      )}

      {!solo ? (
        <div className="solo-loading">
          {failed ? (
            <button className="btn primary" onClick={() => void start()} disabled={starting}>Try again</button>
          ) : <span className="loader" aria-label="Starting" />}
        </div>
      ) : (
        <Board guesses={guesses} current={typed} revealRow={revealRow} shake={shake} bounceRow={bounceRow} active={playing} />
      )}

      {finished ? (
        <div className="finished-panel solo-done">
          <div className="finished-head">
            <div>
              <p className="eyebrow">{solved ? `Solved in ${guesses.length}` : solo!.gave_up ? 'You gave up' : 'Out of guesses'}</p>
              <p className="finished-time">Your time <b><Elapsed startedAt={solo!.started_at} durationMs={solo!.duration_ms} /></b></p>
            </div>
            {solo!.word && <div className="finished-word"><WordTiles word={solo!.word} size={30} /></div>}
          </div>
          {showTalk ? (
            <TrashTalk game={solo!} slot={slot!} players={players} onGame={setSolo} variant="dock" solo />
          ) : (
            <p className="muted small">Counts towards your Solo table in Stats, never the battle numbers.</p>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => go('/', true)}>Home</button>
            <button className="btn primary" onClick={() => void start()} disabled={starting}>{starting ? 'Picking…' : 'Play again'}</button>
          </div>
        </div>
      ) : solo ? (
        <Keyboard states={keyboardStates(shown)} onKey={onKey} disabled={!canType} />
      ) : null}

      {counting && solo && (
        <Countdown target={Date.parse(solo.started_at)} onGo={() => setCounting(false)} label="Solo" />
      )}

      {confirmGiveUp && (
        <div className="modal-backdrop" onClick={() => setConfirmGiveUp(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Give up this one?</h3>
            <p className="muted">It counts as a miss in your Solo stats, and you'll see the word.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmGiveUp(false)}>Keep playing</button>
              <button className="btn danger" onClick={giveUp}>Give up</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

