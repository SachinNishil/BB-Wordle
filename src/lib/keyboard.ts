// v1.19: the phone keyboard slides over the app instead of squashing it (Android
// Chrome; iPhones already work this way). Whatever you're typing into is lifted
// just above the keyboard, and the rest of the screen stays exactly as it was.
type VK = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

// v1.20: the trash talk box has its own sheet that sits on the keyboard (--kbv), so only modals lift.
const LIFT = '.modal';
let kb = 0;
let lifted: HTMLElement | null = null;

function place() {
  if (lifted) { lifted.style.translate = ''; lifted.style.zIndex = ''; lifted = null; }
  const el = document.activeElement as HTMLElement | null;
  if (!kb || !el || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.closest('.type-overlay')) return;
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

/** --kbv: how much of the bottom of the window the keyboard covers, on every phone. */
function setKbv(px: number) {
  document.documentElement.style.setProperty('--kbv', `${Math.max(0, Math.round(px))}px`);
}

export function initKeyboard() {
  const vk = (navigator as Navigator & { virtualKeyboard?: VK }).virtualKeyboard;
  let overlay = false;
  if (vk) { try { vk.overlaysContent = true; overlay = true; } catch { /* fall back below */ } }
  if (!overlay || !vk) {
    // iPhones (and browsers without the VirtualKeyboard API): the visual viewport shrinks instead.
    const vv = window.visualViewport;
    if (!vv) return;
    const upd = () => setKbv(window.innerHeight - vv.height - vv.offsetTop);
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    return;
  }
  const root = document.documentElement;
  vk.addEventListener('geometrychange', () => {
    kb = Math.round(vk.boundingRect.height);
    root.style.setProperty('--kb', `${kb}px`);
    setKbv(kb);
    root.classList.toggle('kb-open', kb > 0);
    place();
  });
  document.addEventListener('focusin', () => setTimeout(place, 50));
  document.addEventListener('focusout', () => setTimeout(place, 50));
}
