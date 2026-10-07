// Trash talk (v1.4). Once your own round is over you can send your partner
// emojis, ready-made lines or anything you type (up to 60 characters). They
// pop up on your partner's screen while they play.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { GameView, Player, Slot, Taunt } from '../lib/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export const TAUNT_EMOJIS = ['😂', '😏', '🥱', '🐢', '👀', '🔥', '💀', '🤡', '🙈', '💅', '🫠', '😘'];
export const TAUNT_LINES = [
  'Tick tock ⏰',
  'Still thinking? 🤔',
  "I'm waiting 😴",
  'Easy one, no? 😏',
  'Ooh, bold choice 👀',
  'Need a hint? 🙊',
  'So close! Not really 😂',
  'Take your time. Or not.',
  'GG coming soon 🏆',
];
export const TAUNT_MAX = 60;

/** True for messages made only of emojis (shown big, without a bubble). */
export function isEmojiOnly(text: string) {
  return /\p{Extended_Pictographic}/u.test(text) && !/[\p{L}\p{N}]/u.test(text.replace(/\p{Extended_Pictographic}/gu, ''));
}

/** Composer + recent messages. `dock` sits under the board while spectating; `card` lives on the results screen. */
export function TrashTalk({ game, slot, players, onGame, variant }: {
  game: GameView;
  slot: Slot;
  players: Record<Slot, Player>;
  onGame: (g: GameView) => void;
  variant: 'dock' | 'card';
}) {
  const { ping, reportError } = useStore();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const partner = players[(3 - slot) as Slot];
  const taunts = game.taunts ?? [];
  const recent = variant === 'dock' ? taunts.slice(-1) : taunts;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [taunts.length]);

  async function send(body: string) {
    const b = body.trim();
    if (!b || sending) return;
    setSending(true);
    try {
      const r = await api.sendTaunt(slot, game.id, b.slice(0, TAUNT_MAX));
      if (r.game) onGame(r.game);
      ping('game', 'taunt');
      navigator.vibrate?.(12);
      if (b === text.trim()) setText('');
      setShowLines(false);
    } catch (e) {
      reportError(e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`trash ${variant}`}>
      {variant === 'card' && <p className="eyebrow">Trash talk</p>}
      {recent.length > 0 && (
        <div className="trash-log" ref={logRef}>
          {recent.map((t) => (
            <p key={t.id} className={`trash-msg ${t.from === slot ? 'mine' : 'theirs'}${isEmojiOnly(t.body) ? ' emoji' : ''}`}>
              {t.from !== slot && <Avatar player={players[t.from]} size={18} />}
              <span>{t.body}</span>
            </p>
          ))}
        </div>
      )}
      {variant === 'card' && recent.length === 0 && <p className="muted small">No trash talk this game. Yet.</p>}
      <div className="trash-emojis" role="group" aria-label="Send an emoji">
        {TAUNT_EMOJIS.map((e) => (
          <button key={e} className="trash-emoji" onClick={() => send(e)} disabled={sending} aria-label={`Send ${e}`}>{e}</button>
        ))}
      </div>
      {showLines && (
        <div className="trash-lines" role="group" aria-label="Quick lines">
          {TAUNT_LINES.map((l) => (
            <button key={l} className="trash-line" onClick={() => send(l)} disabled={sending}>{l}</button>
          ))}
        </div>
      )}
      <form className="trash-compose" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <button type="button" className={`trash-more${showLines ? ' on' : ''}`} onClick={() => setShowLines((x) => !x)}
          aria-label="Quick lines" aria-expanded={showLines}>💬</button>
        <input className="text-input trash-input" value={text} maxLength={TAUNT_MAX} onChange={(e) => setText(e.target.value)}
          placeholder={`Say something to ${partner.name}…`} aria-label="Trash talk message" enterKeyHint="send" />
        <button type="submit" className="trash-send" disabled={sending || !text.trim()} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
    </div>
  );
}

interface Bubble { id: number; body: string; emoji: boolean; x: number }

/** Pops your partner's new messages up over the screen. Never blocks taps or typing. */
export function TauntLayer({ taunts, slot, partner }: { taunts: Taunt[] | undefined; slot: Slot; partner: Player }) {
  const seen = useRef<number | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    if (!taunts) return;
    const top = taunts.reduce((m, t) => Math.max(m, t.id), 0);
    if (seen.current === null) {
      seen.current = top; // don't replay old messages when the screen opens
      return;
    }
    const fresh = taunts.filter((t) => t.id > seen.current! && t.from !== slot);
    seen.current = Math.max(seen.current, top);
    if (!fresh.length) return;
    navigator.vibrate?.(25);
    const add = fresh.slice(-4).map((t) => ({ id: t.id, body: t.body, emoji: isEmojiOnly(t.body), x: Math.round(Math.random() * 50 - 25) }));
    setBubbles((b) => [...b, ...add].slice(-5));
    for (const a of add) setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== a.id)), a.emoji ? 2600 : 4200);
  }, [taunts, slot]);

  if (!bubbles.length) return null;
  return (
    <div className="taunt-layer" aria-live="polite">
      {bubbles.map((b) => (
        b.emoji ? (
          <span key={b.id} className="taunt-emoji" style={{ ['--x' as string]: `${b.x}vw` }}>{b.body}</span>
        ) : (
          <span key={b.id} className="taunt-bubble">
            <Avatar player={partner} size={22} />
            <span><b>{partner.name}:</b> {b.body}</span>
          </span>
        )
      ))}
    </div>
  );
}
