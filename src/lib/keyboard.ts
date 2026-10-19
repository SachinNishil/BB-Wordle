// v1.19: the phone keyboard slides over the app instead of squashing it (Android
// Chrome; iPhones already work this way). Whatever you're typing into is lifted
// just above the keyboard, and the rest of the screen stays exactly as it was.
type VK = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

const LIFT = '.trash.dock, .finished-panel, .modal';
let kb = 0;
let lifted: HTMLElement | null = null;

function place() {
  if (lifted) { lifted.style.translate = ''; lifted.style.zIndex = ''; lifted = null; }
  const el = document.activeElement as HTMLElement | null;
  if (!kb || !el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
  const visibleBottom = window.innerHeight - kb - 10;
  const box = el.closest<HTMLElement>(LIFT);
  if (box) {
    const over = box.getBoundingClientRect().bottom - visibleBottom;
    if (over > 0) {
      box.style.translate = `0 ${-Math.round(over)}px`;
      box.style.zIndex = '25';
      lifted = box;
    }
    return;
  }
  const over = el.getBoundingClientRect().bottom - visibleBottom;
  if (over > 0) window.scrollBy({ top: over + 12, behavior: 'smooth' });
}

export function initKeyboard() {
  const vk = (navigator as Navigator & { virtualKeyboard?: VK }).virtualKeyboard;
  if (!vk) return;
  try { vk.overlaysContent = true; } catch { return; }
  const root = document.documentElement;
  vk.addEventListener('geometrychange', () => {
    kb = Math.round(vk.boundingRect.height);
    root.style.setProperty('--kb', `${kb}px`);
    root.classList.toggle('kb-open', kb > 0);
    place();
  });
  document.addEventListener('focusin', () => setTimeout(place, 50));
  document.addEventListener('focusout', () => setTimeout(place, 50));
}
