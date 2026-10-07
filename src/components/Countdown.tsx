import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib/clock';

/** Full-screen 3, 2, 1, GO! counting down to `target` (server time, ms). */
export function Countdown({ target, onGo, label }: { target: number; onGo: () => void; label?: string }) {
  const [now, setNow] = useState(serverNow());
  const fired = useRef(false);
  const goRef = useRef(onGo);
  goRef.current = onGo;

  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 50);
    return () => clearInterval(t);
  }, []);

  const remaining = target - now;
  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      navigator.vibrate?.(40);
      // Leave GO! on screen for a beat before the board takes over.
      setTimeout(() => goRef.current(), 650);
    }
  }, [remaining]);

  const n = Math.min(3, Math.ceil(remaining / 1000));
  const text = remaining > 0 ? String(Math.max(1, n)) : 'GO!';
  return (
    <div className="countdown" role="alert" aria-live="assertive">
      {label && <p className="countdown-label">{label}</p>}
      <span key={text} className={`countdown-num${text === 'GO!' ? ' go' : ''}`}>{text}</span>
    </div>
  );
}
