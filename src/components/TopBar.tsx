import type { ReactNode } from 'react';
import { back } from '../router';
import { Icon } from './Icon';

export function TopBar({ title, right, onBack }: { title?: ReactNode; right?: ReactNode; onBack?: () => void }) {
  return (
    <header className="topbar">
      <button className="iconbtn" onClick={onBack ?? (() => back('/'))} aria-label="Back">
        <Icon name="back" />
      </button>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}
