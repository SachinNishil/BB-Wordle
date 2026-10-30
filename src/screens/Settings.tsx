import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Board } from '../components/Board';
import { Icon } from '../components/Icon';
import { Keyboard } from '../components/Keyboard';
import { PartnerMini } from '../components/Live';
import { SOUNDBOARD } from '../components/TrashTalk';
import { getKbScale, KB_MAX, KB_MIN, setKbScale } from '../lib/kbSize';
import { POWERS } from '../lib/powers';
import { TopBar } from '../components/TopBar';
import { api, type TelegramStatus } from '../lib/api';
import { APP_VERSION } from '../lib/config';
import { photoToDataUrl } from '../lib/photo';
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme';
import type { PartnerView, PowerId, SabSettings, Slot, WordSettings, WordSettingsInfo } from '../lib/types';
import { go } from '../router';
import { useStore } from '../store';

export function PlayerPicker({ value, onChange }: { value: Slot | null; onChange: (s: Slot) => void }) {
  const { players } = useStore();
  return (
    <div className="picker" role="radiogroup" aria-label="Who is playing on this phone?">
      {([1, 2] as Slot[]).map((s) => (
        <label key={s} className={`pick p${s}${value === s ? ' on' : ''}`}>
          <input type="radio" name="who" checked={value === s} onChange={() => onChange(s)} />
          <Avatar player={players[s]} size={56} ring={value === s} />
          <span className="pick-name">{players[s].name}</span>
          <span className="radio" aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}

function ProfileRow({ slot }: { slot: Slot }) {
  const { players, setPlayers, ping, reportError, toast } = useStore();
  const p = players[slot];
  const [name, setName] = useState(p.name);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function save(photo: string | null, clear = false, newName: string | null = null) {
    setBusy(true);
    try {
      const r = await api.updatePlayer(slot, newName, photo, clear);
      setPlayers(r.players);
      ping('room');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      await save(await photoToDataUrl(f));
      toast('Photo updated', 'win');
    } catch {
      toast("Couldn't read that photo", 'error');
    }
  }

  return (
    <div className="profile-row">
      <button className="avatar-btn" onClick={() => file.current?.click()} aria-label={`Change ${p.name}'s photo`} disabled={busy}>
        <Avatar player={p} size={56} />
        <span className="avatar-cam"><Icon name="camera" size={14} /></span>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={onFile} />
      <div className="profile-fields">
        <input className="name-input" value={name} maxLength={24} aria-label={`Player ${slot} name`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== p.name && save(null, false, name.trim())} />
        {p.photo && <button className="btn text small" onClick={() => save(null, true)} disabled={busy}>Remove photo</button>}
      </div>
    </div>
  );
}

const WORD_OPTIONS: { key: 'ed' | 'plural' | 'uncommon'; title: string; eg: string }[] = [
  { key: 'ed', title: 'Words ending in -ed', eg: 'like BAKED, AIMED, TIRED' },
  { key: 'plural', title: 'Plurals', eg: 'like CARES, BOXES, LIONS' },
  { key: 'uncommon', title: 'Uncommon and tricky words', eg: 'like NADIR, TAPIR, XYLYL' },
];

/** How many words Classic can pick from with these settings. */
export function poolSize(info: WordSettingsInfo, w: Pick<WordSettings, 'ed' | 'plural' | 'uncommon'>) {
  const forms = ['base', ...(w.ed ? ['ed'] : []), ...(w.plural ? ['plural'] : [])];
  const kinds = ['common', ...(w.uncommon ? ['uncommon'] : [])];
  let n = 0;
  for (const f of forms) for (const k of kinds) n += info.counts[`${f}_${k}`] ?? 0;
  return n;
}

/** Settings › Classic words (v1.6). One shared setting for both phones. */
function ClassicWords() {
  const { slot, players, wordSettings, setWordSettingsLocal, ping, reportError } = useStore();
  const [info, setInfo] = useState<WordSettingsInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const partner = slot ? players[(3 - slot) as Slot] : null;
  const changedAt = wordSettings?.changed_at;

  useEffect(() => {
    api.getWordSettings().then(setInfo).catch(() => setInfo(null));
  }, [changedAt]);

  const cur = info?.settings ?? wordSettings ?? { ed: false, plural: false, uncommon: false };
  async function toggle(key: 'ed' | 'plural' | 'uncommon') {
    if (!slot || busy) return;
    const next = { ...cur, [key]: !cur[key] };
    setBusy(true);
    if (info) setInfo({ ...info, settings: next });
    try {
      const r = await api.setWordSettings(slot, next.ed, next.plural, next.uncommon);
      setInfo(r);
      setWordSettingsLocal(r.settings);
      ping('room', 'word-settings');
    } catch (e) {
      reportError(e);
      api.getWordSettings().then(setInfo).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const total = info ? poolSize(info, cur) : null;
  const everything = info ? poolSize(info, { ed: true, plural: true, uncommon: true }) : null;
  const by = cur.changed_by ? players[cur.changed_by]?.name : null;
  return (
    <section className="card classic-words">
      <h3>Classic words</h3>
      <p className="muted small">
        Everyday words are always in. Tick more to widen the pool. This is shared: changing it here changes it on {partner?.name ?? 'your partner'}'s phone too, from the next game.
      </p>
      <div className="word-options">
        {WORD_OPTIONS.map((o) => {
          const delta = info ? poolSize(info, { ...cur, [o.key]: true }) - poolSize(info, { ...cur, [o.key]: false }) : null;
          return (
            <label key={o.key} className={`word-option${cur[o.key] ? ' on' : ''}`}>
              <input type="checkbox" checked={!!cur[o.key]} disabled={busy || !info} onChange={() => toggle(o.key)} />
              <span className="check" aria-hidden="true" />
              <span className="word-option-text">
                <b>{o.title}</b>
                <span className="muted small">{o.eg}</span>
              </span>
              {delta !== null && <span className="word-option-count">+{delta.toLocaleString('en-IN')}</span>}
            </label>
          );
        })}
      </div>
      {total !== null && (
        <p className="word-pool">
          <b>{total.toLocaleString('en-IN')}</b> words in play
          {total === everything ? ' · the whole dictionary' : ` of ${everything!.toLocaleString('en-IN')}`}
          {by && <span className="muted small"> · last changed by {by}</span>}
        </p>
      )}
    </section>
  );
}

/**
 * Telegram invites (v1.17): a bot messages you when your partner starts a game,
 * since phones don't let this app send its own notifications.
 */
function TelegramInvites() {
  const { slot, partner, reportError, toast } = useStore();
  const [st, setSt] = useState<TelegramStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [opened, setOpened] = useState(false);
  const load = async () => { if (slot) setSt(await api.telegramStatus(slot).catch(() => ({ configured: false }))); };
  useEffect(() => { void load(); }, [slot]); // eslint-disable-line react-hooks/exhaustive-deps

  async function check() {
    if (!slot) return;
    setChecking(true);
    try {
      const { request_id } = await api.telegramCheck(slot);
      let status = 'pending';
      for (let i = 0; i < 8 && status === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        status = (await api.telegramCheckResult(slot, request_id)).status;
      }
      if (status === 'connected') toast('Connected! Check Telegram for a hello 👋', 'win');
      else if (status === 'not_found') toast('Not yet: open the bot, tap Start, then come back and Check.', 'info');
      else toast("Couldn't reach Telegram. Try again in a moment.", 'error');
      await load();
    } catch (e) {
      reportError(e);
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    if (!slot) return;
    try { await api.telegramDisconnect(slot); await load(); toast('Telegram invites turned off for this phone'); } catch (e) { reportError(e); }
  }

  if (!st) return null;
  return (
    <section className="card telegram">
      <h3>Telegram invites</h3>
      {!st.configured ? (
        <p className="muted small">Get a Telegram message whenever {partner?.name ?? 'your partner'} starts a game. It needs a one-time setup in Supabase first (see the README, "Telegram invites").</p>
      ) : st.me ? (
        <>
          <p className="small"><b>✓ Connected.</b> Telegram messages you whenever {partner?.name ?? 'your partner'} starts a game.</p>
          <p className="muted small">{partner?.name}: {st.partner ? 'connected ✓' : 'not connected yet'}</p>
          <button className="btn text small" onClick={disconnect}>Turn off</button>
        </>
      ) : (
        <>
          <p className="muted small">Get a Telegram message whenever {partner?.name ?? 'your partner'} starts a game.</p>
          <ol className="telegram-steps small">
            <li>
              <a className="btn ghost small" href={st.link} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>Open @{st.bot} in Telegram</a>
            </li>
            <li>Tap <b>Start</b> there, then come back here.</li>
            <li>
              <button className={`btn small ${opened ? 'primary' : 'ghost'}`} onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check'}</button>
            </li>
          </ol>
          <p className="muted small">{partner?.name}: {st.partner ? 'connected ✓' : 'not connected yet'}</p>
        </>
      )}
    </section>
  );
}

/** v1.23: Settings › Sabotage mode: coins to spend, what each power costs, which are allowed. Shared by the room. */
function SabotageSettings() {
  const { slot, players, ping, reportError } = useStore();
  const [set, setSet] = useState<SabSettings | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partner = slot ? players[(3 - slot) as Slot] : null;
  useEffect(() => { api.getSabotageSettings().then(setSet).catch(() => setSet(null)); }, []);
  function change(next: SabSettings) {
    setSet(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!slot) return;
      try {
        const allOn = next.allowed.length === POWERS.length;
        const r = await api.setSabotageSettings(slot, next.budget, next.costs, allOn ? null : next.allowed);
        setSet(r);
        ping('room', 'sabotage-settings');
      } catch (e) {
        reportError(e);
        api.getSabotageSettings().then(setSet).catch(() => {});
      }
    }, 600);
  }
  if (!set) return null;
  const budget = (d: number) => change({ ...set, budget: Math.min(30, Math.max(1, set.budget + d)) });
  const cost = (id: PowerId, d: number) => change({ ...set, costs: { ...set.costs, [id]: Math.min(10, Math.max(0, set.costs[id] + d)) } });
  const allow = (id: PowerId) => {
    const on = set.allowed.includes(id);
    if (on && set.allowed.length === 1) return;
    change({ ...set, allowed: on ? set.allowed.filter((x) => x !== id) : POWERS.map((p) => p.id).filter((x) => x === id || set.allowed.includes(x)) });
  };
  const isDefault = set.budget === 8 && set.allowed.length === POWERS.length && POWERS.every((p) => set.costs[p.id] === set.defaults[p.id]);
  const by = set.changed_by ? players[set.changed_by]?.name : null;
  return (
    <section className="card sab-settings">
      <button className="sab-settings-head" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <h3>Sabotage mode 😈</h3>
        <span className="muted small">🪙 {set.budget} · {set.allowed.length} powers {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <p className="muted small">Shared with {partner?.name ?? 'your partner'}: it applies to both of you from the next pick. Each of you picks up to three powers that fit the coins.</p>
          <div className="sab-budget">
            <span>Coins each</span>
            <div className="stepper">
              <button className="btn soft small" onClick={() => budget(-1)} aria-label="Fewer coins">−</button>
              <b aria-live="polite">🪙 {set.budget}</b>
              <button className="btn soft small" onClick={() => budget(1)} aria-label="More coins">+</button>
            </div>
          </div>
          <ul className="sab-power-list">
            {POWERS.map((p) => {
              const on = set.allowed.includes(p.id);
              return (
                <li key={p.id} className={on ? '' : 'off'}>
                  <label className="sab-power-toggle">
                    <input type="checkbox" checked={on} onChange={() => allow(p.id)} aria-label={`Allow ${p.name}`} />
                    <span className="sab-power-emoji" aria-hidden="true">{p.emoji}</span>
                    <span className="sab-power-name">{p.name}</span>
                  </label>
                  <div className="stepper small">
                    <button className="btn soft small" onClick={() => cost(p.id, -1)} disabled={!on || set.costs[p.id] <= 0} aria-label={`${p.name} cheaper`}>−</button>
                    <b>{set.costs[p.id]}</b>
                    <button className="btn soft small" onClick={() => cost(p.id, 1)} disabled={!on || set.costs[p.id] >= 10} aria-label={`${p.name} dearer`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sab-settings-foot">
            {by && set.changed_at && !isDefault && <span className="muted small">Last changed by {by}</span>}
            <button className="btn text small" disabled={isDefault} onClick={() => change({ ...set, budget: 8, allowed: POWERS.map((p) => p.id), costs: { ...set.defaults } })}>Back to the defaults</button>
          </div>
        </>
      )}
    </section>
  );
}

/** v1.20: how big the Wordle keyboard is, with a live preview of the game screen. */
const SAMPLE = [{ word: 'CRANE', pattern: 'XYXXG' }, { word: 'SOUTH', pattern: 'XXXYX' }];
const SAMPLE_KEYS: Record<string, 'correct' | 'present' | 'absent'> = { C: 'absent', R: 'present', A: 'absent', N: 'absent', E: 'correct', S: 'absent', O: 'absent', U: 'absent', T: 'present', H: 'absent' };
function KeyboardSize() {
  const { players, slot } = useStore();
  const [v, setV] = useState(getKbScale());
  const W = Math.min(window.innerWidth, 520);
  const H = window.innerHeight;
  const scale = 168 / W;
  const partner = players[(3 - (slot ?? 1)) as Slot];
  const view = { slot: 3 - (slot ?? 1), status: 'playing', patterns: ['XXYXX', 'GXXYX'], guesses: null, paused: false, paused_ms: 0,
    elapsed_ms: 83000, started_at: null, guess_count: 2 } as unknown as PartnerView;
  const pct = Math.round(v * 100);
  return (
    <section className="card kb-size">
      <h3>Keyboard size</h3>
      <div className="kb-size-row">
        <div className="kb-size-controls">
          <p className="kb-size-value">{pct}%</p>
          <input type="range" className="kb-range" min={KB_MIN} max={KB_MAX} step={0.05} value={v} aria-label="Keyboard size"
            onChange={(e) => { const x = Number(e.target.value); setV(x); setKbScale(x); }} />
          <div className="kb-size-ends"><span>Smaller</span><span>Bigger</span></div>
          {v !== 1 && <button className="btn text small" onClick={() => { setV(1); setKbScale(1); }}>Reset</button>}
        </div>
        {/* The real game screen, shrunk: the board takes whatever room the keyboard leaves. */}
        <div className="kb-preview" style={{ width: W * scale, height: H * scale }} aria-hidden="true">
          <div className="kb-preview-screen screen game" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            <header className="topbar"><span className="iconbtn"><Icon name="back" /></span><h1 className="topbar-title">Game #12<span className="topbar-clock"> · 1:23</span></h1><div className="topbar-right" /></header>
            <div className="vs-strip chat-strip">
              <div className="soundboard">{SOUNDBOARD.map((e) => <span key={e} className="sb-key">{e}</span>)}</div>
              <PartnerMini player={partner} view={view} />
            </div>
            <Board guesses={SAMPLE} current="BL" revealRow={null} shake={false} bounceRow={null} active />
            <Keyboard states={SAMPLE_KEYS} onKey={() => {}} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const { slot, chooseSlot, players, toast, realtime } = useStore();
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme());

  return (
    <div className="screen scroll">
      <TopBar title="Settings" />

      <section className="card">
        <h3>Who's playing on this phone?</h3>
        <PlayerPicker value={slot} onChange={(s) => { chooseSlot(s); toast(`This phone plays as ${players[s].name}`); }} />
      </section>

      <section className="card">
        <h3>Profiles</h3>
        <p className="muted small">Tap a photo to change it.</p>
        <ProfileRow slot={1} />
        <ProfileRow slot={2} />
      </section>

      <ClassicWords />

      <TelegramInvites />

      <SabotageSettings />

      <section className="card">
        <h3>Appearance</h3>
        <div className="segmented">
          {(['system', 'light', 'dark'] as ThemeChoice[]).map((t) => (
            <button key={t} className={theme === t ? 'on' : ''} aria-pressed={theme === t}
              onClick={() => { setTheme(t); setThemeState(t); }}>
              {t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <KeyboardSize />

      <section className="card">
        <h3>This phone</h3>
        <p className="muted small">Live sync: {realtime ? 'connected' : 'reconnecting (updates every few seconds)'} · Version {APP_VERSION}</p>
        <button className="btn text small" onClick={() => go('/versions')}>Version history</button>
      </section>
    </div>
  );
}
