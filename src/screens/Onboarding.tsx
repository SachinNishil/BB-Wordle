import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { api, friendlyError } from '../lib/api';
import { inviteLink, parseInvite } from '../lib/identity';
import type { Slot } from '../lib/types';
import { useStore } from '../store';
import { PlayerPicker } from './Settings';

function Logo() {
  return (
    <div className="brand">
      <h1 className="logo" aria-label="Wordle">
        {['W', 'O', 'R', 'D', 'L', 'E'].map((l, i) => (
          <span key={i} className={`logo-tile ${i === 1 || i === 4 ? 'present' : i === 3 ? 'absent' : 'correct'}`} style={{ animationDelay: `${i * 80}ms` }}>{l}</span>
        ))}
      </h1>
      <p className="logo-sub">for two</p>
    </div>
  );
}

/** No room key on this phone yet: create the room (first time ever) or join with the invite link. */
export function Welcome({ badKey }: { badKey?: boolean }) {
  const { joinRoom, forgetRoom } = useStore();
  const [exists, setExists] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    api.roomExists().then(setExists).catch((e) => setError(friendlyError(e)));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const { key } = await api.createRoom();
      setCreated(key);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="screen scroll onboard">
        <Logo />
        <section className="card">
          <p className="eyebrow">Room created 🎉</p>
          <h2>Your private room is ready</h2>
          <p className="muted">Next, send this invite link to your partner. Opening it once connects their phone. Keep it private: anyone with the link can play in your room.</p>
          <button className="btn soft" onClick={async () => {
            const link = inviteLink(created);
            try {
              if (navigator.share) await navigator.share({ text: `Come play Wordle with me! ${link}` });
              else await navigator.clipboard.writeText(link);
            } catch { /* cancelled */ }
          }}><Icon name="share" size={18} /> Share invite link</button>
          <button className="btn primary big" onClick={() => joinRoom(created)}>Continue</button>
        </section>
      </div>
    );
  }

  const key = parseInvite(paste);
  return (
    <div className="screen scroll onboard">
      <Logo />
      {badKey && (
        <section className="card warn-card">
          <h3>This phone's link stopped working</h3>
          <p className="muted small">The room key was changed. Open the new invite link, or paste it below.</p>
          <button className="btn text small" onClick={forgetRoom}>Clear the old link</button>
        </section>
      )}
      {error && <p className="error-line">{error}</p>}
      {exists === null && !error && <div className="loader" aria-label="Loading" />}
      {exists === false && (
        <section className="card">
          <h2>Welcome!</h2>
          <p className="muted">A private Wordle battle for two. Set up your room once, then invite your partner with a link.</p>
          <button className="btn primary big" onClick={create} disabled={busy}>{busy ? 'Setting up…' : 'Set up our room'}</button>
        </section>
      )}
      {exists === true && (
        <section className="card">
          <h2>Join your room</h2>
          <p className="muted">Copy the invite link your partner sent you (Settings › Invite on their phone), then tap below.</p>
          {'clipboard' in navigator && 'readText' in navigator.clipboard && (
            <button className="btn primary big" onClick={async () => {
              try {
                const k = parseInvite(await navigator.clipboard.readText());
                if (k) joinRoom(k);
                else setError("The clipboard doesn't hold an invite link. Copy it first, or paste it below.");
              } catch {
                setError('Paste the link into the box below instead.');
              }
            }}>Paste invite link</button>
          )}
          <input className="text-input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste it here" aria-label="Invite link" />
          <button className="btn ghost" disabled={!key} onClick={() => key && joinRoom(key)}>Join</button>
        </section>
      )}
    </div>
  );
}

export function WhoAreYou() {
  const { chooseSlot } = useStore();
  const [pick, setPick] = useState<Slot | null>(null);
  return (
    <div className="screen scroll onboard">
      <Logo />
      <section className="card">
        <h2>Who's playing on this phone?</h2>
        <p className="muted small">You can change this any time in Settings.</p>
        <PlayerPicker value={pick} onChange={setPick} />
        <button className="btn primary big" disabled={!pick} onClick={() => pick && chooseSlot(pick)}>Let's play</button>
      </section>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="screen scroll onboard">
      <Logo />
      <section className="card">
        <h2>Almost there</h2>
        <p className="muted">This copy of the app isn't connected to Supabase yet. Add two environment variables and redeploy:</p>
        <pre className="code">VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key</pre>
        <p className="muted small">On Vercel: Project › Settings › Environment Variables. Locally: a <code>.env</code> file. The README has the full steps.</p>
      </section>
    </div>
  );
}
