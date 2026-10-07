import { useState } from 'react';
import { inviteLink } from '../lib/identity';
import { load, save } from '../lib/storage';
import { useStore } from '../store';

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Shown in the browser (not the installed app). On iPhone the home-screen app
 * has its own storage, separate from Safari, so the room link has to be
 * pasted once inside the installed app.
 */
export function InstallHint() {
  const { roomKey, toast } = useStore();
  const [hidden, setHidden] = useState(() => load('bbw.installHintHidden', false));
  if (hidden || isStandalone() || !roomKey) return null;
  const ios = isIOS();
  return (
    <section className="card install">
      <div className="section-head">
        <h3>Add to your Home Screen</h3>
        <button className="btn text small" onClick={() => { save('bbw.installHintHidden', true); setHidden(true); }}>Not now</button>
      </div>
      {ios ? (
        <>
          <p className="muted small">1. Tap <b>Copy room link</b>. 2. Tap Safari's Share button, then <b>Add to Home Screen</b>. 3. Open the new icon and tap <b>Paste invite link</b>.</p>
          <button className="btn soft" onClick={async () => {
            try { await navigator.clipboard.writeText(inviteLink(roomKey)); toast('Room link copied'); } catch { toast("Couldn't copy. Use Settings › Invite instead.", 'error'); }
          }}>Copy room link</button>
        </>
      ) : (
        <p className="muted small">Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. It opens full screen, like a real app.</p>
      )}
    </section>
  );
}
