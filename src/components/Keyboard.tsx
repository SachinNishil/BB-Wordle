import type { KeyState } from '../lib/wordle';
import { Icon } from './Icon';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];

export function Keyboard({ states, onKey, disabled, chat }: {
  states: Record<string, KeyState>;
  onKey: (k: string) => void;
  disabled?: boolean;
  /** v1.8.1: the same keyboard types chat messages: SEND instead of ENTER, plus a space row. */
  chat?: boolean;
}) {
  return (
    <div className={`keyboard${disabled ? ' disabled' : ''}${chat ? ' chat' : ''}`} aria-label={chat ? 'Chat keyboard' : 'Keyboard'}>
      {ROWS.map((row, r) => (
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
              <button key={k} className={`key ${chat ? '' : states[k] ?? ''}`} onClick={() => onKey(k)} aria-label={`${k}${!chat && states[k] ? ' ' + states[k] : ''}`}>
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
