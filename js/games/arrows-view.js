import { svgEl, PALETTE } from '../svg.js';
import { DX, DY } from './arrows.js';

const S = 10;

export function createView(root, p, onMove) {
  const pad = 3;
  const svg = svgEl('svg', { viewBox: `${-pad} ${-pad} ${p.w * S + 2 * pad} ${p.h * S + 2 * pad}`, class: 'board arrows' }, root);
  const dots = svgEl('g', { class: 'dots' }, svg);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) svgEl('circle', { cx: x * S + S / 2, cy: y * S + S / 2, r: 0.7 }, dots);
  const flashLayer = svgEl('g', {}, svg);
  let cur = null;

  const groups = p.arrows.map((a, i) => {
    const g = svgEl('g', { class: 'arrow' }, svg);
    g.style.color = PALETTE[i % PALETTE.length];
    const pts = a.cells.map(([x, y]) => `${x * S + S / 2},${y * S + S / 2}`).join(' ');
    svgEl('polyline', { points: pts, class: 'hit' }, g);
    svgEl('polyline', { points: pts, class: 'line' }, g);
    const [hx, hy] = a.cells[a.cells.length - 1];
    const cx = hx * S + S / 2, cy = hy * S + S / 2;
    const dx = DX[a.dir], dy = DY[a.dir], px = -dy, py = dx;
    const tip = [cx + dx * 4.4, cy + dy * 4.4];
    const b1 = [cx - dx * 0.6 + px * 3.3, cy - dy * 0.6 + py * 3.3];
    const b2 = [cx - dx * 0.6 - px * 3.3, cy - dy * 0.6 - py * 3.3];
    svgEl('polygon', { points: [tip, b1, b2].map((q) => q.join(',')).join(' '), class: 'head' }, g);
    g.addEventListener('pointerdown', (e) => { e.preventDefault(); onMove(i); });
    return g;
  });

  return {
    update(state, ev) {
      cur = state;
      if (!ev) {
        groups.forEach((g, i) => {
          g.classList.remove('leaving');
          g.style.transform = '';
          g.style.display = state.gone[i] ? 'none' : '';
        });
        return;
      }
      const g = groups[ev.id], a = p.arrows[ev.id];
      if (ev.type === 'exit') {
        const dist = (Math.max(p.w, p.h) + 2) * S;
        g.classList.add('leaving');
        g.style.transform = `translate(${DX[a.dir] * dist}px, ${DY[a.dir] * dist}px)`;
        setTimeout(() => { if (cur.gone[ev.id]) g.style.display = 'none'; }, 380);
      } else if (ev.type === 'bump') {
        g.animate([
          { transform: 'translate(0,0)' },
          { transform: `translate(${DX[a.dir] * 2.5}px, ${DY[a.dir] * 2.5}px)` },
          { transform: 'translate(0,0)' },
        ], { duration: 220 });
        const [x, y] = ev.hit;
        const r = svgEl('rect', { x: x * S + 0.5, y: y * S + 0.5, width: S - 1, height: S - 1, rx: 2, class: 'flash' }, flashLayer);
        setTimeout(() => r.remove(), 500);
      }
    },
  };
}
