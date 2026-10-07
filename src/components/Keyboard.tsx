import type { KeyState } from '../lib/wordle';
import { Icon } from './Icon';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];

export function Keyboard({ states, onKey, disabled }: {
  states: Record<string, KeyState>;
  onKey: (k: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`keyboard${disabled ? ' disabled' : ''}`} aria-label="Keyboard">
      {ROWS.map((row, r) => (
        <div className="krow" key={r}>
          {r === 1 && <span className="kspacer" />}
          {[...row].map((k) => {
            if (k === '+') return <button key="enter" className="key wide" onClick={() => onKey('Enter')} aria-label="Enter">ENTER</button>;
            if (k === '-')
              return (
                <button key="back" className="key wide" onClick={() => onKey('Backspace')} aria-label="Backspace">
                  <Icon name="backspace" size={22} />
                </button>
              );
            return (
              <button key={k} className={`key ${states[k] ?? ''}`} onClick={() => onKey(k)} aria-label={`${k}${states[k] ? ' ' + states[k] : ''}`}>
                {k}
              </button>
            );
          })}
          {r === 1 && <span className="kspacer" />}
        </div>
      ))}
    </div>
  );
}
