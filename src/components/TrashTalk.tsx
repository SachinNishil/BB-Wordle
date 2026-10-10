// Trash talk / chat. v1.4: once your round was over you could send your partner
// emojis and messages. v1.7 (experiment): chat any time during a game from the
// small box at the top left of the board. Emoji-only messages still burst over
// the board; text only shows in the chat box.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { feedTaunts, onNewTaunts } from '../lib/tauntFeed';
import type { GameView, Player, Slot } from '../lib/types';
import { go } from '../router';
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

/** Composer + messages. `dock` sits under the board while spectating (no log: the chat box shows it);
 *  `card` lives on the results screen; `sheet` is the chat opened from the chat box. */
export function TrashTalk({ game, slot, players, onGame, variant, onClose }: {
  game: GameView;
  slot: Slot;
  players: Record<Slot, Player>;
  onGame: (g: GameView) => void;
  variant: 'dock' | 'card' | 'sheet';
  onClose?: () => void;
}) {
  const { ping, pushTaunt, reportError } = useStore();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showLines, setShowLines] = useState(false);
  const partner = players[(3 - slot) as Slot];
  const taunts = game.taunts ?? [];
  const recent = variant === 'dock' ? [] : taunts;
  const last = taunts[taunts.length - 1];
  const lastMine = last && last.from === slot ? last : null;
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
      if (r.game) {
        onGame(r.game);
        // Straight to their phone over the live channel, and a nudge to refresh
        // in case that message gets lost (it's in the database either way).
        const mine = [...(r.game.taunts ?? [])].reverse().find((t) => t.from === slot);
        if (mine) pushTaunt(game.id, mine);
      }
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
      {variant === 'sheet' && (
        <div className="chat-head">
          <span className="chat-title"><Avatar player={partner} size={22} /> Chat with {partner.name}</span>
          <button type="button" className="btn text small" onClick={onClose}>Done</button>
        </div>
      )}
      {variant === 'dock' && lastMine && (
        <span className={`trash-seen${lastMine.seen ? ' yes' : ''}`}>Last message {lastMine.seen ? `seen by ${partner.name} ✓` : 'sent'}</span>
      )}
      {recent.length > 0 && (
        <div className="trash-log" ref={logRef}>
          {recent.map((t) => (
            <p key={t.id} className={`trash-msg ${t.from === slot ? 'mine' : 'theirs'}${isEmojiOnly(t.body) ? ' emoji' : ''}`}>
              {t.from !== slot && <Avatar player={players[t.from]} size={18} />}
              <span>{t.body}</span>
            </p>
          ))}
          {lastMine && (
            <span className={`trash-seen${lastMine.seen ? ' yes' : ''}`}>{lastMine.seen ? `Seen by ${partner.name} ✓` : 'Sent'}</span>
          )}
        </div>
      )}
      {variant !== 'dock' && recent.length === 0 && <p className="muted small">No trash talk this game. Yet.</p>}
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

/** The small chat box at the top left of the board (v1.7): the latest messages; tap to chat. */
export function ChatBox({ game, slot, players, onOpen }: {
  game: GameView;
  slot: Slot;
  players: Record<Slot, Player>;
  onOpen: () => void;
}) {
  const partner = players[(3 - slot) as Slot];
  const taunts = game.taunts ?? [];
  const last = taunts.slice(-3);
  const newest = taunts[taunts.length - 1];
  const [flash, setFlash] = useState(false);
  const firstId = useRef<number | null>(null);
  useEffect(() => {
    if (!newest) return;
    if (firstId.current === null) { firstId.current = newest.id; return; }
    if (newest.id === firstId.current || newest.from === slot) return;
    firstId.current = newest.id;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 2500);
    return () => clearTimeout(t);
  }, [newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button className={`chat-box${flash ? ' flash' : ''}`} onClick={onOpen} aria-label={`Chat with ${partner.name}`}>
      <span className="chat-box-head">💬 Chat</span>
      {last.length === 0 ? (
        <span className="chat-box-empty">Tap to say something to {partner.name}</span>
      ) : (
        <span className="chat-box-lines">
          {last.map((t) => (
            <span key={t.id} className={`chat-line ${t.from === slot ? 'mine' : 'theirs'}`}>
              <b>{t.from === slot ? 'You' : players[t.from].name}:</b> {t.body}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

interface Bubble { id: number; body: string; emoji: boolean; x: number; leaving?: boolean }

/**
 * Pops your partner's new messages up over whatever screen you're on (one
 * instance, in App). Never blocks taps or typing. Fed by lib/tauntFeed.
 */
export function TauntLayer() {
  const { slot, players, ping, toast } = useStore();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  // Never lower than the bottom of the board's first row (on the game screen).
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const row = document.querySelector('.board .row');
    const room = row ? row.getBoundingClientRect().bottom - el.getBoundingClientRect().top : 260;
    el.style.maxHeight = `${Math.max(70, Math.round(room))}px`;
  }, [bubbles]);
  const partner = slot ? players[(3 - slot) as Slot] : null;
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(
    () =>
      onNewTaunts((gameId, all) => {
        navigator.vibrate?.(25);
        // v1.7: text lives in the chat box on the game screen; elsewhere, a quiet note.
        const onGame = location.hash.startsWith('#/game');
        const texts = all.filter((t) => !isEmojiOnly(t.body));
        const p = slotRef.current ? playersRef.current[(3 - slotRef.current) as Slot] : null;
        if (!onGame && p) for (const t of texts.slice(-1)) toast(`💬 ${p.name}: ${t.body}`, 'info', { label: 'Open', run: () => go('/game') });
        const fresh = all.filter((t) => isEmojiOnly(t.body));
        if (!fresh.length) return;
        const add = fresh.map((t, i) => ({ id: t.id, body: t.body, emoji: isEmojiOnly(t.body), x: Math.round(Math.random() * 50 - 25) + i * 4 }));
        // At most two at a time, and never lower than the board's first row.
        setBubbles((b) => [...b.filter((x) => !add.some((a) => a.id === x.id)), ...add].slice(-2));
        for (const a of add) {
          const life = a.emoji ? 2800 : 4800;
          setTimeout(() => setBubbles((b) => b.map((x) => (x.id === a.id ? { ...x, leaving: true } : x))), life - 400);
          setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== a.id)), life);
        }
        // Tell the sender it landed ("Seen" under their message).
        const s = slotRef.current;
        if (s && document.visibilityState === 'visible') {
          api.markTauntsSeen(s, gameId, Math.max(...fresh.map((t) => t.id)))
            .then(() => ping('game', 'seen'))
            .catch(() => {});
        }
      }),
    [ping, toast],
  );

  if (!bubbles.length || !partner) return null;
  return (
    <div className="taunt-layer" aria-live="polite" ref={layer}>
      {bubbles.map((b) =>
        b.emoji ? (
          <span key={b.id} className="taunt-emoji-wrap" style={{ transform: `translateX(${b.x}vw)` }}>
            <span className={`taunt-emoji${b.leaving ? ' leaving' : ''}`}>{b.body}</span>
          </span>
        ) : (
          <span key={b.id} className={`taunt-bubble${b.leaving ? ' leaving' : ''}`}>
            <Avatar player={partner} size={22} />
            <span><b>{partner.name}:</b> {b.body}</span>
          </span>
        ),
      )}
    </div>
  );
}

/** Lets a screen hand its latest copy of the game's trash talk to the feed. */
export function useFeedTaunts(game: GameView | null, slot: Slot | null) {
  const ids = (game?.taunts ?? []).map((t) => t.id).join(',');
  useEffect(() => {
    if (game) feedTaunts(game.id, game.taunts, slot);
  }, [game?.id, ids, slot]); // eslint-disable-line react-hooks/exhaustive-deps
}
