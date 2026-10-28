import type { KeyState } from '../lib/wordle';
import { Icon } from './Icon';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];

/** v1.21 Shuffle: the same 26 letters in a new order (same row lengths), from a seed. */
export function shuffledRows(seed: number) {
  const letters = [...'QWERTYUIOPASDFGHJKLZXCVBNM'];
  let x = seed % 2147483647 || 7;
  for (let i = letters.length - 1; i > 0; i--) {
    x = (x * 16807) % 2147483647;
    const j = x % (i + 1);
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const l = letters.join('');
  return [l.slice(0, 10), l.slice(10, 19), '+' + l.slice(19) + '-'];
}

export function Keyboard({ states, onKey, disabled, chat, layout, banned }: {
  states: Record<string, KeyState>;
  onKey: (k: string) => void;
  disabled?: boolean;
  /** v1.8.1: the same keyboard types chat messages: SEND instead of ENTER, plus a space row. */
  chat?: boolean;
  /** v1.21 Sabotage: Shuffle's letter order, and Banned letter's letter. */
  layout?: string[];
  banned?: string | null;
}) {
  const rows = layout ?? ROWS;
  return (
    <div className={`keyboard${disabled ? ' disabled' : ''}${chat ? ' chat' : ''}`} aria-label={chat ? 'Chat keyboard' : 'Keyboard'}>
      {rows.map((row, r) => (
        <div className="krow" key={r}>
          {r === 1 && <span className="kspacer" />}
          {[...row].map((k) => {
            if (k === '+')
              return chat
                ? <button key="enter" className="key wide send" onClick={() => onKey('Enter')} aria-label="Send message">SEND</button>
                : <button key="enter" className="key wide" onClick={() => onKey('Enter')} aria-label="Enter">ENTER</button>;
            if (k === '-')
              return (
                <button key="back" className="key wide" onClick={() => onKey('Backspace')} aria-label="Backspace">
                  <Icon name="backspace" size={22} />
                </button>
              );
            return (
              <button key={k} className={`key ${chat ? '' : states[k] ?? ''}${banned === k ? ' banned' : ''}`} onClick={() => onKey(k)}
                aria-label={`${k}${!chat && states[k] ? ' ' + states[k] : ''}${banned === k ? ' banned' : ''}`}>
                {k}
              </button>
            );
          })}
          {r === 1 && <span className="kspacer" />}
        </div>
      ))}
      {chat && (
        <div className="krow">
          <button className="key" onClick={() => onKey('?')} aria-label="Question mark">?</button>
          <button className="key space" onClick={() => onKey(' ')} aria-label="Space">space</button>
          <button className="key" onClick={() => onKey('!')} aria-label="Exclamation mark">!</button>
        </div>
      )}
    </div>
  );
}
