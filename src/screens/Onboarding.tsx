import { useState } from 'react';
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
