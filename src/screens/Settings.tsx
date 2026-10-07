import { useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { APP_VERSION } from '../lib/config';
import { photoToDataUrl } from '../lib/photo';
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme';
import type { Slot } from '../lib/types';
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

      <section className="card">
        <h3>This phone</h3>
        <p className="muted small">Live sync: {realtime ? 'connected' : 'reconnecting (updates every few seconds)'} · Version {APP_VERSION}</p>
        <button className="btn text small" onClick={() => go('/versions')}>Version history</button>
      </section>
    </div>
  );
}
