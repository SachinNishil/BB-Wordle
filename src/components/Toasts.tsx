import { useRoute } from '../router';
import { useStore } from '../store';

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  const { parts } = useRoute();
  return (
    <div className={`toasts${parts[0] === 'game' ? ' in-game' : ''}`} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? 'info'}`} onClick={() => dismissToast(t.id)}>
          <span>{t.text}</span>
          {t.action && (
            <button className="toast-action" onClick={(e) => { e.stopPropagation(); t.action!.run(); dismissToast(t.id); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
