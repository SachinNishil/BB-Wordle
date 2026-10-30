// v1.21 Sabotage mode: picking powers in the waiting room, the power bar while you play,
// and what the powers do to your screen when they hit you.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { serverNow } from '../lib/clock';
import { BUDGET, costOf, FIRST_LETTERS, isDefence, POWERS, powerById } from '../lib/powers';
import type { GameView, Player, PowerId, SabEvent, Slot } from '../lib/types';
import { useStore } from '../store';

/** Waiting room: three at random, or pick any three. Can be changed until the countdown. */
export function PowerPicker({ game, slot, partner, onGame }: { game: GameView; slot: Slot; partner: Player; onGame: (g: GameView) => void }) {
  const { reportError, ping } = useStore();
  const mine = game.sab?.powers ?? null;
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<PowerId[]>([]);
  const [busy, setBusy] = useState(false);
  async function save(powers: PowerId[] | null) {
    setBusy(true);
    try {
      const r = await api.sabotageLoadout(slot, game.id, powers);
      if (r.game) onGame(r.game);
      ping('game', 'joined');
      setPicking(false);
      setSel([]);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }
  // v1.23: budget, costs and allowed powers come from Settings › Sabotage mode.
  const set = game.sab?.settings;
  const budget = set?.budget ?? BUDGET;
  const costs = set?.costs;
  const cost = (id: PowerId) => costs?.[id] ?? powerById(id).cost;
  const allowed = POWERS.filter((p) => !set?.allowed || set.allowed.includes(p.id));
  const spent = costOf(sel, costs);
  const fits = (id: PowerId) => sel.length < 3 && spent + cost(id) <= budget;
  const toggle = (id: PowerId) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : fits(id) ? [...s, id] : s));
  const partnerLine = <p className={`pick-status${game.sab?.partner_ready ? ' done' : ''}`}>{game.sab?.partner_ready ? `✅ ${partner.name} has picked` : `${partner.name} is picking…`}</p>;

  if (mine && !picking) {
    return (
      <div className="power-pick done">
        <p className="eyebrow">Your powers</p>
        <div className="power-hand">{mine.map((id) => <PowerCard key={id} id={id} cost={cost(id)} />)}</div>
        <p className="muted small">🪙 {costOf(mine, costs)} of {budget} coins</p>
        <button className="btn text small" onClick={() => { setSel(mine); setPicking(true); }}>Change</button>
        {partnerLine}
      </div>
    );
  }
  if (!picking) {
    return (
      <div className="power-pick">
        <p className="eyebrow">Your powers</p>
        <div className="power-choice">
          <button className="btn primary" onClick={() => save(null)} disabled={busy}>🎲 At random</button>
          <button className="btn ghost" onClick={() => setPicking(true)} disabled={busy}>Pick my own</button>
        </div>
        {partnerLine}
      </div>
    );
  }
  return (
    <div className="power-pick picking">
      <div className="power-pick-head">
        <p className="eyebrow">Up to 3 · {sel.length}/3 · <span className={`coins${spent === budget ? ' full' : ''}`}>🪙 {budget - spent} left</span></p>
        <button className="btn text small" onClick={() => { setPicking(false); setSel([]); }}>Back</button>
      </div>
      <div className="power-grid" role="group" aria-label="Powers">
        {allowed.map((p) => (
          <button key={p.id} className={`power-option${sel.includes(p.id) ? ' on' : ''}${p.group === 'Defence' ? ' defence' : ''}`}
            aria-pressed={sel.includes(p.id)} onClick={() => toggle(p.id)} disabled={!sel.includes(p.id) && !fits(p.id)}>
            <span className="power-cost" aria-label={`${cost(p.id)} coins`}>{cost(p.id) ? '🪙'.repeat(cost(p.id)) : 'free'}</span>
            <span className="power-emoji">{p.emoji}</span>
            <span className="power-name">{p.name}</span>
            <span className="power-what">{p.what}</span>
          </button>
        ))}
      </div>
      <button className="btn primary big power-go" onClick={() => save(sel)} disabled={busy || sel.length === 0}>
        {sel.length === 0 ? 'PICK UP TO 3' : sel.length === 1 ? 'USE THIS ONE' : sel.length === 2 ? 'USE THESE TWO' : 'USE THESE THREE'}
      </button>
    </div>
  );
}

function PowerCard({ id, used, cost }: { id: PowerId; used?: boolean; cost: number }) {
  const p = powerById(id);
  return (
    <span className={`power-card${used ? ' used' : ''}`} title={p.what}>
      <span className="power-emoji">{p.emoji}</span>
      <span className="power-name">{p.name}</span>
      <span className="power-cost">{cost ? '🪙'.repeat(cost) : 'free'}</span>
    </span>
  );
}

/** Ticks once a second while something time-based is on screen. */
function useNow(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [on]);
  return serverNow();
}

/** The three powers while you play: tap to throw one (Forced first asks for a letter). */
export function PowerBar({ game, slot, partner, onGame }: { game: GameView; slot: Slot; partner: Player; onGame: (g: GameView) => void }) {
  const { reportError, toast, ping } = useStore();
  const sab = game.sab;
  const [busy, setBusy] = useState(false);
  const [askLetter, setAskLetter] = useState(false);
  const cd = sab?.cooldown_until ? Date.parse(sab.cooldown_until) : 0;
  const now = useNow(cd > serverNow());
  if (!sab?.powers) return null;
  const left = Math.max(0, Math.ceil((cd - now) / 1000));
  const partnerHit = sab.events.some((e) => e.to !== slot && e.from !== e.to && e.active);
  const partnerDone = game.partner.status !== 'playing';
  const armed = sab.events.find((e) => e.from === slot && e.to === slot && e.active);
  // v1.22: still yours to use while you watch, until their round is over too.
  const playing = game.status !== 'completed' && ['playing', 'solved', 'failed'].includes(game.me.status);

  async function fire(id: PowerId, letter: string | null = null) {
    setBusy(true);
    try {
      const r = await api.sabotageSend(slot, game.id, id, letter);
      if (r.game) onGame(r.game);
      ping('game', 'sabotage');
      navigator.vibrate?.(30);
      const p = powerById(id);
      if (isDefence(id)) toast(`${p.emoji} ${p.name} is armed`, 'info');
      else if (r.blocked) toast(`🛡️ ${partner.name}'s shield blocked your ${p.name}`, 'info');
      else if (r.bounced) toast(`🪃 ${partner.name} bounced your ${p.name} back at you!`, 'error');
      else toast(`${p.emoji} ${p.name} hit ${partner.name}`, 'win');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="power-bar" role="group" aria-label="Your powers">
      {sab.powers.map((id) => {
        const p = powerById(id);
        const used = sab.used.includes(id);
        const def = isDefence(id);
        const why = used ? (armed?.power === id ? 'armed' : 'used') : !playing ? 'done' : left > 0 ? `${left}s`
          : def ? (armed ? 'armed' : '') : partnerDone ? 'done' : partnerHit ? 'busy' : '';
        return (
          <button key={id} className={`power-btn${used ? ' used' : ''}${why === 'armed' ? ' armed' : ''}`} disabled={busy || !!why}
            onClick={() => (id === 'first' ? setAskLetter(true) : fire(id))} aria-label={`${p.name}${why ? ` (${why})` : ''}`}>
            <span className="power-emoji">{p.emoji}</span>
            <span className="power-name">{p.name}</span>
            {why && <span className="power-why">{why === 'armed' ? `${p.emoji} on` : why === 'busy' ? 'wait' : why}</span>}
          </button>
        );
      })}
      {askLetter && (
        <div className="modal-backdrop" onClick={() => setAskLetter(false)}>
          <div className="modal letter-pick" onClick={(e) => e.stopPropagation()}>
            <h3>🔤 {partner.name}'s next guess starts with…</h3>
            <div className="letter-grid">
              {FIRST_LETTERS.map((l) => (
                <button key={l} className="key" onClick={() => { setAskLetter(false); void fire('first', l); }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** What's hitting me right now, worked out from the game's events. */
export function useIncoming(game: GameView | null, slot: Slot | null) {
  const ev = game?.sab?.events ?? [];
  const now = useNow(ev.some((e) => e.active && e.expires_at));
  const active = ev.filter((e) => e.to === slot && e.from !== e.to && e.active && !e.blocked
    && (!e.expires_at || Date.parse(e.expires_at) > now));
  const has = (p: PowerId) => active.find((e) => e.power === p) ?? null;
  return { active, has, now };
}

/** Pop-ups for sabotages as they happen (each one once). */
export function useSabNews(game: GameView | null, slot: Slot | null, partner: Player | null) {
  const { toast } = useStore();
  const seen = useRef<Set<number> | null>(null);
  const events = game?.sab?.events;
  useEffect(() => {
    if (!events || !slot || !partner) return;
    if (!seen.current) { seen.current = new Set(events.map((e) => e.id)); return; }
    for (const e of events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      const p = powerById(e.power);
      if (e.to === slot && e.from !== slot && !e.blocked) {
        navigator.vibrate?.([50, 40, 50]);
        toast(e.bounced ? `🪃 Bounced back! Your ${p.name} hit you` : `${p.emoji} ${partner.name} hit you with ${p.name}${e.letter && e.power !== 'sticky' ? `: ${e.letter}` : ''}`, 'error');
      } else if (e.to === slot && e.blocked) {
        toast(`🛡️ Your shield blocked ${partner.name}'s ${p.name}`, 'win');
      }
    }
  }, [events, slot, partner, toast]);
}

const UNTIL: Partial<Record<PowerId, string>> = {
  fog: 'until your next guess', mirror: 'until your next guess', ban: 'for your next guess', shuffle: 'for your next guess',
  sticky: 'for your next guess', ghost: '', blind: 'for your next two guesses', liar: 'in your next row', delay: 'on your next guess',
  amnesia: 'for your next guess', first: 'on your next guess', speed: '', steal: '',
};

/** One line under the strip: what's on me right now. */
export function SabBanner({ incoming, partner }: { incoming: ReturnType<typeof useIncoming>; partner: Player }) {
  const e = incoming.active[0];
  if (!e) return null;
  const p = powerById(e.power);
  let text = `${p.name} ${UNTIL[e.power] ?? ''}`.trim();
  if (e.power === 'ban') text = `${e.letter} is banned for your next guess`;
  if (e.power === 'sticky') text = `${e.letter} is sticky: it types twice`;
  if (e.power === 'first') text = `Your next guess must start with ${e.letter}`;
  if (e.expires_at) text += ` · ${Math.max(0, Math.ceil((Date.parse(e.expires_at) - incoming.now) / 1000))}s`;
  if (e.power === 'speed') {
    const left = Math.ceil((Date.parse(e.at) + 20000 - incoming.now) / 1000);
    text = left > 0 ? `Speed trap: ${left}s to play your next guess` : 'Too slow: this row will stay blind';
  }
  return (
    <p className={`sab-banner ${e.power}`} role="status">
      <span aria-hidden="true">{p.emoji}</span> {text} <span className="sab-from">from {partner.name}</span>
    </p>
  );
}

/** Lights out: everything dark except a torch where your finger (or mouse) is. */
export function DarkOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const at = (x: number, y: number) => {
      ref.current?.style.setProperty('--x', `${x}px`);
      ref.current?.style.setProperty('--y', `${y}px`);
    };
    // v1.23: follow the finger while it drags (touch events keep coming on phones, where
    // pointer events stop as soon as the browser thinks you're scrolling).
    const touch = (e: TouchEvent) => { const t = e.touches[0]; if (t) at(t.clientX, t.clientY); };
    const pointer = (e: PointerEvent) => at(e.clientX, e.clientY);
    const board = document.querySelector('.board')?.getBoundingClientRect();
    if (board) at(board.left + board.width / 2, board.top + board.height / 2);
    document.documentElement.classList.add('sab-dark-on');
    const opt = { passive: true, capture: true } as const;
    window.addEventListener('touchstart', touch, opt);
    window.addEventListener('touchmove', touch, opt);
    window.addEventListener('pointermove', pointer, opt);
    window.addEventListener('pointerdown', pointer, opt);
    return () => {
      document.documentElement.classList.remove('sab-dark-on');
      window.removeEventListener('touchstart', touch, opt);
      window.removeEventListener('touchmove', touch, opt);
      window.removeEventListener('pointermove', pointer, opt);
      window.removeEventListener('pointerdown', pointer, opt);
    };
  }, []);
  return <div className="sab-dark" ref={ref} aria-hidden="true" />;
}

export function FreezeOverlay({ until }: { until: number }) {
  const now = useNow(true);
  return (
    <div className="sab-freeze" aria-hidden="true">
      <span>❄️ {Math.max(0, Math.ceil((until - now) / 1000))}</span>
    </div>
  );
}

/** The emoji of whatever I've got on my partner right now (shown on their mini board). */
export function partnerHitEmoji(events: SabEvent[] | undefined, slot: Slot) {
  const e = events?.find((x) => x.to !== slot && x.from !== x.to && x.active && !x.blocked);
  return e ? powerById(e.power).emoji : null;
}
