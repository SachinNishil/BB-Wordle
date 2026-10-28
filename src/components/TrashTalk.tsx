// Trash talk / chat. v1.4: once your round was over you could send your partner
// emojis and messages. v1.7 (experiment): chat any time during a game from the
// small box at the top left of the board. Emoji-only messages still burst over
// the board; text only shows in the chat box.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../lib/api';
import { feedTaunts, onNewTaunts } from '../lib/tauntFeed';
import type { GameView, Player, Slot, Taunt } from '../lib/types';
import { go } from '../router';
import { onKeyboard } from '../lib/keyboard';
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

/** Sentence case for text typed on the Wordle keyboard (which only has capitals). */
export function chatCase(raw: string) {
  const lower = raw.toLowerCase().replace(/\bi\b/g, 'I');
  return lower.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

/** Anything you can trash talk on (v1.10): a battle, or a solo game being watched. */
export interface Talk { id: string; taunts?: Taunt[]; booms?: Taunt[] }

async function sendTalk<T extends Talk>(slot: Slot, target: T, solo: boolean, body: string, kind: 'chat' | 'boom'): Promise<T | null> {
  if (solo) return (await api.soloTaunt(slot, target.id, body, kind)).solo as unknown as T;
  return (await api.sendTaunt(slot, target.id, body, kind)).game as unknown as T | null;
}

/** Sending a message: saves it, pushes it to the partner's phone, nudges a refresh. */
export function useSendTaunt(game: GameView | null, slot: Slot | null, onGame: (g: GameView) => void) {
  const { ping, pushTaunt, reportError } = useStore();
  const [sending, setSending] = useState(false);
  async function send(body: string): Promise<boolean> {
    const b = body.trim();
    if (!b || sending || !game || !slot) return false;
    setSending(true);
    try {
      const r = await api.sendTaunt(slot, game.id, b.slice(0, TAUNT_MAX));
      if (r.game) {
        onGame(r.game);
        const mine = [...(r.game.taunts ?? [])].reverse().find((t) => t.from === slot);
        if (mine) pushTaunt(game.id, mine);
      }
      ping('game', 'taunt');
      navigator.vibrate?.(12);
      return true;
    } catch (e) {
      reportError(e);
      return false;
    } finally {
      setSending(false);
    }
  }
  return { send, sending };
}

/**
 * The chat while playing or spectating (v1.8.1). It takes the board's place and is typed on
 * the Wordle keyboard below it (no phone keyboard on top), so nothing overlaps on any screen
 * size: the log fills whatever room there is and scrolls to the newest message.
 */
export function ChatPanel({ game, slot, players, draft, onSent, sendNow, onClose }: {
  game: GameView;
  slot: Slot;
  players: Record<Slot, Player>;
  draft: string;
  /** Called after a message went out (clear the draft). */
  onSent: () => void;
  sendNow: (body: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const partner = players[(3 - slot) as Slot];
  const taunts = game.taunts ?? [];
  const last = taunts[taunts.length - 1];
  const lastMine = last && last.from === slot ? last : null;
  const [showLines, setShowLines] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [taunts.length, lastMine?.seen]);
  // Keep the newest message in view when the space changes (rotation, smaller screen, emoji row swap).
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { el.scrollTop = el.scrollHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const text = chatCase(draft);
  async function quick(body: string) {
    if (await sendNow(body)) setShowLines(false);
  }
  return (
    <div className="chat-panel" role="region" aria-label={`Chat with ${partner.name}`}>
      <div className="chat-head">
        <span className="chat-title"><Avatar player={partner} size={22} /> Chat with {partner.name}</span>
        <button type="button" className="btn text small" onClick={onClose}>Done</button>
      </div>
      <div className="trash-log" ref={logRef}>
        {taunts.length === 0 && <p className="muted small chat-empty">Say something. Type on the keyboard below.</p>}
        {taunts.map((t) => (
          <p key={t.id} className={`trash-msg ${t.from === slot ? 'mine' : 'theirs'}${isEmojiOnly(t.body) ? ' emoji' : ''}`}>
            {t.from !== slot && <Avatar player={players[t.from]} size={18} />}
            <span>{t.body}</span>
          </p>
        ))}
        {lastMine && <span className={`trash-seen${lastMine.seen ? ' yes' : ''}`}>{lastMine.seen ? `Seen by ${partner.name} ✓` : 'Sent'}</span>}
      </div>
      {showLines ? (
        <div className="trash-lines" role="group" aria-label="Quick lines">
          {TAUNT_LINES.map((l) => <button key={l} className="trash-line" onClick={() => quick(l)}>{l}</button>)}
        </div>
      ) : (
        <div className="trash-emojis" role="group" aria-label="Send an emoji">
          {TAUNT_EMOJIS.map((e) => <button key={e} className="trash-emoji" onClick={() => quick(e)} aria-label={`Send ${e}`}>{e}</button>)}
        </div>
      )}
      <div className="trash-compose">
        <button type="button" className={`trash-more${showLines ? ' on' : ''}`} onClick={() => setShowLines((x) => !x)}
          aria-label="Quick lines" aria-expanded={showLines}>💬</button>
        <div className={`chat-draft${text ? '' : ' empty'}`} aria-label="Your message" role="textbox" aria-readonly="true">
          {text}<i className="caret" aria-hidden="true" />{!text && <span className="chat-placeholder">Message {partner.name}…</span>}
        </div>
        <button type="button" className="trash-send" disabled={!text.trim()} aria-label="Send"
          onClick={async () => { if (await sendNow(text)) onSent(); }}>
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

/**
 * v1.20: the chat that pops up right on top of the phone keyboard while you type: the last
 * few messages, the emojis and the box you type in, all in view. Nothing in it takes the
 * focus off the box, so the keyboard stays up between messages. v1.20.1: it only lives while
 * the keyboard is up; when the keyboard goes down (or you tap away) it closes and the screen
 * underneath is just as it was, with whatever you'd typed still in the box.
 */
export function TypeSheet({ taunts, slot, players, sending, send, onClose, inputRef, text, setText, loading = false }: {
  taunts: Taunt[];
  slot: Slot;
  players: Record<Slot, Player>;
  sending: boolean;
  /** Resolves true once it went out. */
  send: (body: string) => Promise<boolean>;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  text: string;
  setText: (t: string) => void;
  loading?: boolean;
}) {
  const [showLines, setShowLines] = useState(false);
  const partner = players[(3 - slot) as Slot];
  const shown = taunts.slice(-6);
  const last = taunts[taunts.length - 1];
  const lastMine = last && last.from === slot ? last : null;
  const logRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [taunts.length, lastMine?.seen]);
  // Their messages land in the open chat, so no pop-up bubbles on top of it.
  useEffect(() => {
    document.documentElement.classList.add('typing-open');
    return () => document.documentElement.classList.remove('typing-open');
  }, []);
  // Keyboard down = back to the normal screen.
  useEffect(() => {
    let up = false;
    return onKeyboard((px) => {
      if (px > 80) up = true;
      else if (up && px < 40) closeRef.current();
    });
  }, []);
  function close() {
    inputRef.current?.blur();
    onClose();
  }
  function blurred() {
    setTimeout(() => {
      if (!sheetRef.current?.contains(document.activeElement)) closeRef.current();
    }, 150);
  }
  async function go(body: string, typed = false) {
    const b = body.trim();
    if (!b || sending) return;
    const ok = await send(b);
    if (ok) {
      if (typed) setText('');
      setShowLines(false);
    }
    inputRef.current?.focus();
  }
  return createPortal(
    <div className="type-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); close(); } }}>
      <div className="type-sheet" ref={sheetRef} role="dialog" aria-label={`Chat with ${partner.name}`}>
        <div className="chat-head">
          <span className="chat-title"><Avatar player={partner} size={22} /> {partner.name}</span>
          <button type="button" className="btn text small" onMouseDown={keepFocus} onClick={close}>Done</button>
        </div>
        {shown.length ? (
          <div className="trash-log" ref={logRef}>
            {shown.map((t) => (
              <p key={t.id} className={`trash-msg ${t.from === slot ? 'mine' : 'theirs'}${isEmojiOnly(t.body) ? ' emoji' : ''}`}>
                {t.from !== slot && <Avatar player={players[t.from]} size={18} />}
                <span>{t.body}</span>
              </p>
            ))}
            {lastMine && <span className={`trash-seen${lastMine.seen ? ' yes' : ''}`}>{lastMine.seen ? `Seen by ${partner.name} ✓` : 'Sent'}</span>}
          </div>
        ) : loading ? <span className="loader small chat-empty" aria-label="Loading" /> : <p className="muted small chat-empty">No messages yet. Say hi 👋</p>}
        {showLines ? (
          <div className="trash-lines" role="group" aria-label="Quick lines">
            {TAUNT_LINES.map((l) => (
              <button key={l} type="button" className="trash-line" onMouseDown={keepFocus} onClick={() => go(l)} disabled={sending}>{l}</button>
            ))}
          </div>
        ) : (
          <div className="trash-emojis" role="group" aria-label="Send an emoji">
            {TAUNT_EMOJIS.map((e) => (
              <button key={e} type="button" className="trash-emoji" onMouseDown={keepFocus} onClick={() => go(e)} disabled={sending} aria-label={`Send ${e}`}>{e}</button>
            ))}
          </div>
        )}
        <div className="trash-compose">
          <button type="button" className={`trash-more${showLines ? ' on' : ''}`} onMouseDown={keepFocus} onClick={() => setShowLines((x) => !x)}
            aria-label="Quick lines" aria-expanded={showLines}>💬</button>
          {/* Enter is handled here, not as a form submit: on iPhones a submit closes the keyboard. */}
          <input ref={inputRef} className="text-input trash-input" value={text} maxLength={TAUNT_MAX} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(text, true); } if (e.key === 'Escape') close(); }}
            onBlur={blurred} placeholder={`Message ${partner.name}…`} aria-label="Chat message" enterKeyHint="send" autoComplete="off" />
          <button type="button" className="trash-send" onMouseDown={keepFocus} onClick={() => go(text, true)} disabled={sending || !text.trim()} aria-label="Send">
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Sending on a battle or a solo game: saves it, pushes it to the partner's phone, nudges a refresh. */
export function useTalkSender<T extends Talk>(slot: Slot | null, solo: boolean, onGame: (g: T) => void) {
  const { ping, pushTaunt, reportError } = useStore();
  const [sending, setSending] = useState(false);
  async function send(target: T | null, body: string): Promise<boolean> {
    const b = body.trim();
    if (!b || sending || !target || !slot) return false;
    setSending(true);
    try {
      const r = await sendTalk(slot, target, solo, b.slice(0, TAUNT_MAX), 'chat');
      if (r) {
        onGame(r);
        // Straight to their phone over the live channel, and a nudge to refresh
        // in case that message gets lost (it's in the database either way).
        const mine = [...(r.taunts ?? [])].reverse().find((t) => t.from === slot);
        if (mine) pushTaunt(target.id, mine);
      }
      ping('game', solo ? 'solo-taunt' : 'taunt');
      navigator.vibrate?.(12);
      return true;
    } catch (e) {
      reportError(e);
      return false;
    } finally {
      setSending(false);
    }
  }
  return { send, sending };
}

/** Composer + messages. `dock` sits under the board while spectating (just the latest message);
 *  `card` lives on the results screen; `sheet` is the chat opened from the chat box. Tapping the
 *  box to type opens the TypeSheet over the keyboard (v1.20). */
export function TrashTalk<T extends Talk>({ game, slot, players, onGame, variant, onClose, solo = false }: {
  game: T;
  slot: Slot;
  players: Record<Slot, Player>;
  onGame: (g: T) => void;
  variant: 'dock' | 'card' | 'sheet';
  onClose?: () => void;
  /** v1.10: talking on a solo game (the player and whoever is watching). */
  solo?: boolean;
}) {
  const { send: sendTo, sending } = useTalkSender<T>(slot, solo, onGame);
  const [text, setText] = useState('');
  const [showLines, setShowLines] = useState(false);
  const [typing, setTyping] = useState(false);
  const partner = players[(3 - slot) as Slot];
  const taunts = game.taunts ?? [];
  const recent = variant === 'dock' ? taunts.slice(-1) : taunts;
  const last = taunts[taunts.length - 1];
  const lastMine = last && last.from === slot ? last : null;
  const logRef = useRef<HTMLDivElement>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const send = (b: string) => sendTo(game, b);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [taunts.length]);

  /** v1.20.1: tapping the box (the same box as always) brings up the chat over the keyboard,
   *  focused in the same tap (iPhones only raise the keyboard then). */
  function openTyping() {
    if (typing) return;
    flushSync(() => setTyping(true));
    sheetInput.current?.focus();
  }
  async function sendHere(body: string) {
    if (await send(body)) { if (body === text) setText(''); setShowLines(false); }
  }

  return (
    <div className={`trash ${variant}`}>
      {variant === 'card' && <p className="eyebrow">Chat</p>}
      {variant === 'sheet' && (
        <div className="chat-head">
          <span className="chat-title"><Avatar player={partner} size={22} /> Chat with {partner.name}</span>
          <button type="button" className="btn text small" onClick={onClose}>Done</button>
        </div>
      )}
      {recent.length > 0 && (
        <div className="trash-log" ref={logRef}>
          {recent.map((t) => (
            <p key={t.id} className={`trash-msg ${t.from === slot ? 'mine' : 'theirs'}${isEmojiOnly(t.body) ? ' emoji' : ''}`}>
              {t.from !== slot && <Avatar player={players[t.from]} size={18} />}
              <span>{t.body}</span>
            </p>
          ))}
          {lastMine && <span className={`trash-seen${lastMine.seen ? ' yes' : ''}`}>{lastMine.seen ? `Seen by ${partner.name} ✓` : 'Sent'}</span>}
        </div>
      )}
      {variant !== 'dock' && recent.length === 0 && <p className="muted small">No chat this game. Yet.</p>}
      {/* v1.13: emojis and quick lines from here never bring the keyboard up. */}
      <div className="trash-emojis" role="group" aria-label="Send an emoji">
        {TAUNT_EMOJIS.map((e) => (
          <button key={e} type="button" className="trash-emoji" onClick={() => sendHere(e)} disabled={sending} aria-label={`Send ${e}`}>{e}</button>
        ))}
      </div>
      {showLines && (
        <div className="trash-lines" role="group" aria-label="Quick lines">
          {TAUNT_LINES.map((l) => (
            <button key={l} type="button" className="trash-line" onClick={() => sendHere(l)} disabled={sending}>{l}</button>
          ))}
        </div>
      )}
      <form className="trash-compose" onSubmit={(e) => { e.preventDefault(); void sendHere(text); }}>
        <button type="button" className={`trash-more${showLines ? ' on' : ''}`} onClick={() => setShowLines((x) => !x)}
          aria-label="Quick lines" aria-expanded={showLines}>💬</button>
        <input className="text-input trash-input" value={text} maxLength={TAUNT_MAX} onChange={(e) => setText(e.target.value)}
          onFocus={openTyping} placeholder={`Say something to ${partner.name}…`} aria-label="Type a message" enterKeyHint="send" />
        <button type="submit" className="trash-send" disabled={sending || !text.trim()} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
      {typing && <TypeSheet taunts={taunts} slot={slot} players={players} sending={sending} send={send} inputRef={sheetInput}
        text={text} setText={setText} onClose={() => setTyping(false)} />}
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

interface Bubble { id: number; body: string; emoji: boolean; x: number; leaving?: boolean; game: string; notice?: boolean }

/** v1.20: reply to a message that popped up, from wherever you are (Home included). */
function ReplySheet({ id, inputRef, onClose }: { id: string; inputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const { slot, players } = useStore();
  const [talk, setTalk] = useState<{ solo: boolean; t: Talk } | null>(null);
  const [text, setText] = useState('');
  const { send, sending } = useTalkSender<Talk>(slot, talk?.solo ?? false, (t) => setTalk((x) => (x ? { ...x, t } : x)));
  useEffect(() => {
    if (!slot) return;
    let alive = true;
    const load = async () => {
      try {
        const g = await api.getGameState(slot, id);
        if (g.game) { if (alive) setTalk({ solo: false, t: g.game }); return; }
        const st = await api.soloState(slot, id);
        if (alive && st.solo) setTalk({ solo: true, t: st.solo });
      } catch { /* offline: try again in a moment */ }
    };
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [slot, id]);
  if (!slot) return null;
  return (
    <TypeSheet taunts={talk?.t.taunts ?? []} slot={slot} players={players} sending={sending} loading={!talk} text={text} setText={setText}
      send={(b) => send(talk?.t ?? null, b)} inputRef={inputRef} onClose={onClose} />
  );
}

/**
 * Pops your partner's new messages (and, v1.20, status updates) up over whatever screen
 * you're on (one instance, in App). Tap a message to reply right there. Emojis never
 * catch taps. Fed by lib/tauntFeed.
 */
export function TauntLayer() {
  const { slot, players, ping } = useStore();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const replyInput = useRef<HTMLInputElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  // v1.14: no clipping any more (it cut emojis in half). Instead the space above the
  // board's first row decides how many messages fit: two if there's room, else one.
  const [room, setRoom] = useState(260);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    const row = document.querySelector('.board .row');
    setRoom(row ? row.getBoundingClientRect().bottom - el.getBoundingClientRect().top : 260);
  }, [bubbles.length]);
  const partner = slot ? players[(3 - slot) as Slot] : null;
  const slotRef = useRef(slot);
  slotRef.current = slot;

  useEffect(
    () =>
      onNewTaunts((gameId, all) => {
        // v1.9: soundboard booms make the screen jump (and vibrate where the phone allows it).
        const booms = all.filter((t) => t.kind === 'boom');
        const chats = all.filter((t) => t.kind !== 'boom' && t.kind !== 'notice');
        if (booms.length) {
          navigator.vibrate?.([40, 30, 40]);
          const root = document.documentElement;
          root.classList.remove('boom-shake');
          void root.offsetWidth; // restart the animation on every boom
          root.classList.add('boom-shake');
          setTimeout(() => root.classList.remove('boom-shake'), 450);
        } else {
          navigator.vibrate?.(25);
        }
        const add = all.map((t, i) => ({ id: t.id, body: t.body, emoji: isEmojiOnly(t.body) && t.kind !== 'notice', x: Math.round(Math.random() * 60 - 30) + i * 4, game: gameId, notice: t.kind === 'notice' }));
        // At most two messages and four emojis at a time, never lower than the board's first row.
        setBubbles((b) => {
          const next = [...b.filter((x) => !add.some((a) => a.id === x.id)), ...add];
          const texts = next.filter((x) => !x.emoji).slice(-2);
          const emojis = next.filter((x) => x.emoji).slice(-4);
          return next.filter((x) => texts.includes(x) || emojis.includes(x));
        });
        for (const a of add) {
          const life = a.emoji ? 2200 : 6500;
          setTimeout(() => setBubbles((b) => b.map((x) => (x.id === a.id ? { ...x, leaving: true } : x))), life - 400);
          setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== a.id)), life);
        }
        // Tell the sender a message landed ("Seen" under it).
        const s = slotRef.current;
        if (s && chats.length && document.visibilityState === 'visible') {
          api.markTauntsSeen(s, gameId, Math.max(...chats.map((t) => t.id)))
            .then(() => ping('game', 'seen'))
            .catch(() => {});
        }
      }),
    [ping],
  );

  function open(b: Bubble) {
    setBubbles((x) => x.filter((y) => y.id !== b.id));
    if (b.notice) { go('/'); return; }
    flushSync(() => setReplyTo(b.game));
    replyInput.current?.focus();
  }

  const reply = replyTo && <ReplySheet id={replyTo} inputRef={replyInput} onClose={() => setReplyTo(null)} />;
  if (!bubbles.length || !partner) return reply || null;
  const emojis = bubbles.filter((b) => b.emoji);
  const texts = bubbles.filter((b) => !b.emoji).slice(emojis.length ? (room < 190 ? -1 : -2) : room < 120 ? -1 : -2);
  return (
    <>
      <div className="taunt-layer" aria-live="polite" ref={layer}>
        {texts.map((b) => (
          <button key={b.id} type="button" className={`taunt-bubble${b.leaving ? ' leaving' : ''}${b.notice ? ' notice' : ''}`} onClick={() => open(b)}
            aria-label={b.notice ? `${partner.name}'s new status: ${b.body}` : `${partner.name}: ${b.body}. Tap to reply`}>
            <Avatar player={partner} size={22} />
            <span>{b.notice ? <><b>{partner.name}</b> <span className="taunt-tag">new status</span> {b.body}</> : <><b>{partner.name}:</b> {b.body}</>}</span>
          </button>
        ))}
        {/* Emojis side by side in one row, so the whole of each one always shows. */}
        {emojis.length > 0 && (
          <span className="taunt-emoji-row">
            {emojis.map((b) => (
              <span key={b.id} className="taunt-emoji-wrap" style={{ transform: `translateY(${Math.round(b.x / 4)}px)` }}>
                <span className={`taunt-emoji${b.leaving ? ' leaving' : ''}`}>{b.body}</span>
              </span>
            ))}
          </span>
        )}
      </div>
      {reply}
    </>
  );
}

/** Lets a screen hand its latest copy of the game's trash talk to the feed. */
export function useFeedTaunts(game: Talk | null, slot: Slot | null) {
  const all = [...(game?.taunts ?? []), ...(game?.booms ?? [])];
  const ids = all.map((t) => t.id).join(',');
  useEffect(() => {
    if (game) feedTaunts(game.id, all, slot);
  }, [game?.id, ids, slot]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const SOUNDBOARD = ['😂', '🔥', '💀', '🐢', '😏', '👀', '🤡', '😱', '💩', '😘'];

/**
 * The soundboard (v1.9) above the board while you're still playing: tap an emoji
 * as often as you like; each one bursts over your partner's board and makes
 * their screen jump. No messages here; those open up once you've finished.
 */
export function Soundboard({ game, slot, solo = false }: { game: Talk; slot: Slot; solo?: boolean }) {
  const { pushTaunt } = useStore();
  const [pops, setPops] = useState<{ id: number; e: string }[]>([]);
  const n = useRef(0);
  function boom(e: string) {
    navigator.vibrate?.(8);
    const id = ++n.current;
    setPops((p) => [...p.slice(-5), { id, e }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
    sendTalk(slot, game, solo, e, 'boom')
      .then((r) => {
        const mine = [...(r?.booms ?? [])].reverse().find((t) => t.from === slot && t.body === e);
        if (mine) pushTaunt(game.id, { ...mine, kind: 'boom' });
      })
      .catch(() => { /* too fast or offline: a lost boom doesn't matter */ });
  }
  return (
    <div className="soundboard" role="group" aria-label="Soundboard">
      {SOUNDBOARD.map((e) => (
        <button key={e} className="sb-key" onClick={() => boom(e)} aria-label={`Boom ${e}`}>
          {e}
          {pops.filter((p) => p.e === e).map((p) => <span key={p.id} className="sb-pop" aria-hidden="true">{e}</span>)}
        </button>
      ))}
    </div>
  );
}
