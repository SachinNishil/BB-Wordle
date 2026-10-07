// Draws a finished game as one picture: both boards with every guess, the
// answer(s), who won, guesses and times. Always in the light "paper" look so
// it reads well wherever it's sent.
import type { ResultData } from '../components/Results';
import { fmtDate, fmtDuration } from './clock';
import type { Player, Slot } from './types';

const W = 1080;
const H = 1350;
const C = {
  bg: '#f7f1e9', glow: '#fdf8f1', surface: '#ffffff', line: '#e7ddd0', ink: '#2a221d', ink2: '#6c6057', ink3: '#a09284',
  green: '#5b9f57', yellow: '#d6aa3b', gray: '#8d847b', p1: '#3d7cc0', p2: '#dc5f7d', p1soft: '#e3eefa', p2soft: '#fbe6ec',
};
const DISPLAY = "Fraunces, Georgia, 'Times New Roman', serif";
const UI = "Figtree, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function markColour(m: string | undefined) {
  return m === 'G' ? C.green : m === 'Y' ? C.yellow : C.gray;
}

function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, letter: string, mark?: string) {
  rr(ctx, x, y, s, s, s * 0.13);
  if (mark) {
    ctx.fillStyle = markColour(mark);
    ctx.fill();
  } else {
    ctx.fillStyle = C.surface;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.line;
    ctx.stroke();
  }
  if (letter) {
    ctx.fillStyle = mark ? '#ffffff' : C.ink;
    ctx.font = `800 ${Math.round(s * 0.56)}px ${UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + s / 2, y + s / 2 + s * 0.03);
  }
}

function word(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, gap: number, w: string) {
  const total = 5 * s + 4 * gap;
  [...w].forEach((l, i) => tile(ctx, cx - total / 2 + i * (s + gap), y, s, l, 'G'));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function avatar(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, d: number) {
  const img = p.photo ? await loadImage(p.photo) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, d, d);
  } else {
    ctx.fillStyle = p.slot === 1 ? C.p1 : C.p2;
    ctx.fillRect(x, y, d, d);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(d * 0.46)}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name.slice(0, 1).toUpperCase(), x + d / 2, y + d / 2 + 2);
  }
  ctx.restore();
}

/** One line under the winner's name, explaining how it was won. */
function verdict(d: ResultData, players: Record<Slot, Player>) {
  const a = d.sides[1];
  const b = d.sides[2];
  if (d.result === 'draw') return { head: "It's a draw!", sub: 'Same guesses, same time' };
  if (d.result === 'both_failed' || !d.winner) return { head: 'The word won 😵‍💫', sub: 'Nobody cracked it this time' };
  const w = d.winner;
  const l = (3 - w) as Slot;
  const ws = d.sides[w];
  const ls = d.sides[l];
  let sub: string;
  if (ls.status !== 'solved') sub = `${players[l].name} ${ls.gave_up ? 'gave up' : "didn't get it"}`;
  else if (a.guess_count === b.guess_count) sub = `Both in ${ws.guess_count}, the clock decided it ⏱️`;
  else sub = `${ws.guess_count} guesses vs ${ls.guess_count}`;
  return { head: `🏆 ${players[w].name} wins`, sub };
}

export async function renderResultImage(d: ResultData, players: Record<Slot, Player>): Promise<Blob> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`800 64px Fraunces`),
        document.fonts.load(`800 40px Figtree`),
        document.fonts.load(`600 30px Figtree`),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Paper background with a soft glow.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 0, 40, W / 2, 0, 900);
  g.addColorStop(0, C.glow);
  g.addColorStop(1, 'rgba(253,248,241,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink;
  ctx.font = `800 62px ${DISPLAY}`;
  ctx.fillText('Wordle for Two', W / 2, 112);
  ctx.fillStyle = C.ink2;
  ctx.font = `600 30px ${UI}`;
  const when = fmtDate(d.date, { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(`${d.mode === 'challenge' ? 'Challenge ⚔️ · ' : ''}Game #${d.number} · ${when}`, W / 2, 160);

  // Winner card
  const v = verdict(d, players);
  ctx.save();
  ctx.shadowColor = 'rgba(70,45,20,0.16)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  rr(ctx, 60, 196, W - 120, 140, 28);
  ctx.fillStyle = C.surface;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = C.ink;
  ctx.font = `800 54px ${DISPLAY}`;
  ctx.fillText(v.head, W / 2, 268);
  ctx.fillStyle = C.ink2;
  ctx.font = `600 29px ${UI}`;
  ctx.fillText(v.sub, W / 2, 312);

  // The two boards
  const colW = 450;
  const gap = 10;
  const s = Math.floor((colW - 4 * gap) / 5); // 82
  const boardTop = 500;
  const challenge = d.mode === 'challenge';
  for (const slot of [1, 2] as Slot[]) {
    const x0 = slot === 1 ? 60 : W - 60 - colW;
    const p = players[slot];
    const side = d.sides[slot];
    const won = d.winner === slot;

    // Column card
    rr(ctx, x0 - 18, 366, colW + 36, challenge ? 840 : 700, 30);
    ctx.fillStyle = won ? (slot === 1 ? C.p1soft : C.p2soft) : 'rgba(255,255,255,0.55)';
    ctx.fill();
    if (won) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = slot === 1 ? C.p1 : C.p2;
      ctx.stroke();
    }

    await avatar(ctx, p, x0, 388, 60);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = slot === 1 ? C.p1 : C.p2;
    ctx.font = `800 40px ${UI}`;
    const name = won ? `${p.name} 👑` : p.name;
    ctx.fillText(name, x0 + 76, 420);

    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink;
    ctx.font = `800 34px ${UI}`;
    const score = side.status === 'solved' ? `${side.guess_count}/6` : side.gave_up ? 'Gave up' : 'X/6';
    ctx.fillText(score, x0 + colW, 404);
    ctx.fillStyle = C.ink2;
    ctx.font = `600 26px ${UI}`;
    ctx.fillText(fmtDuration(side.duration_ms), x0 + colW, 442);

    const rows = side.guesses ?? [];
    for (let r = 0; r < 6; r++) {
      const row = rows[r];
      for (let i = 0; i < 5; i++) {
        const tx = x0 + i * (s + gap);
        const ty = boardTop + r * (s + gap);
        if (row) tile(ctx, tx, ty, s, row.word[i] ?? '', row.pattern[i]);
        else if (side.patterns[r]) tile(ctx, tx, ty, s, '', side.patterns[r][i]);
        else tile(ctx, tx, ty, s, '');
      }
    }

    if (challenge) {
      const y = boardTop + 6 * (s + gap) + 30;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.ink2;
      ctx.font = `600 25px ${UI}`;
      ctx.fillText(`${p.name}'s word, picked by ${players[(3 - slot) as Slot].name}`, x0 + colW / 2, y + 20);
      word(ctx, x0 + colW / 2, y + 40, 66, 8, d.words[slot]);
    }
  }

  if (!challenge) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.ink2;
    ctx.font = `700 24px ${UI}`;
    ctx.fillText('THE WORD', W / 2, 1130);
    word(ctx, W / 2, 1150, 80, 10, d.word);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ink3;
  ctx.font = `600 22px ${UI}`;
  ctx.fillText('BB Wordle', W / 2, H - 40);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'),
  );
}
