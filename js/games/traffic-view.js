import { svgEl, svgPoint, PALETTE } from '../svg.js';
import { occupancy, range } from './traffic.js';

const S = 10, GAP = 0.8;

export function createView(root, p, onMove) {
  const N = p.n, ROW = p.cars[0].fix;
  const svg = svgEl('svg', { viewBox: `-3 -3 ${N * S + 8} ${N * S + 6}`, class: 'board traffic' }, root);
  svgEl('rect', { x: -1.5, y: -1.5, width: N * S + 3, height: N * S + 3, rx: 3, class: 'lot' }, svg);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    svgEl('rect', { x: x * S + 0.4, y: y * S + 0.4, width: S - 0.8, height: S - 0.8, rx: 1.2, class: 'space' }, svg);
  }
  // Bollards: fixed blocks nothing can pass.
  for (const k of p.walls || []) {
    const x = (k % N) * S, y = ((k / N) | 0) * S;
    svgEl('rect', { x: x + 1.6, y: y + 1.6, width: S - 3.2, height: S - 3.2, rx: 1.4, class: 'bollard' }, svg);
  }
  // Exit: a gap in the right wall at the red car's row.
  svgEl('rect', { x: N * S, y: ROW * S + 1, width: 4, height: S - 2, class: 'exit' }, svg);
  svgEl('path', { d: `M ${N * S + 1.2} ${ROW * S + 3.2} l 2 1.8 l -2 1.8`, class: 'exit-mark' }, svg);

  let state = null;
  const rects = p.cars.map((c, i) => {
    const r = svgEl('rect', {
      width: (c.h ? c.len : 1) * S - 2 * GAP,
      height: (c.h ? 1 : c.len) * S - 2 * GAP,
      rx: 2.2,
      class: i === 0 ? 'car red' : 'car',
    }, svg);
    if (i) r.style.fill = PALETTE[(i - 1) % PALETTE.length];
    r.addEventListener('pointerdown', (e) => startDrag(e, i, r));
    return r;
  });

  const place = (i, v) => {
    const c = p.cars[i];
    const x = c.h ? v : c.fix, y = c.h ? c.fix : v;
    rects[i].setAttribute('x', x * S + GAP);
    rects[i].setAttribute('y', y * S + GAP);
  };

  function startDrag(e, i, r) {
    if (!state || state.pos[0] === N - 2 || state.moves >= p.limit) return;
    e.preventDefault();
    try { r.setPointerCapture(e.pointerId); } catch { /* synthetic or already-gone pointer */ }
    const c = p.cars[i];
    const [lo, hi] = range(p, state.pos, i, occupancy(p, state.pos));
    const [sx, sy] = svgPoint(svg, e);
    const from = state.pos[i];
    let v = from;
    r.classList.add('dragging');
    const move = (ev) => {
      const [x, y] = svgPoint(svg, ev);
      v = Math.max(lo, Math.min(hi, from + ((c.h ? x - sx : y - sy) / S)));
      place(i, v);
    };
    const up = () => {
      r.removeEventListener('pointermove', move);
      r.removeEventListener('pointerup', up);
      r.removeEventListener('pointercancel', up);
      r.classList.remove('dragging');
      const to = Math.round(v);
      place(i, from);
      if (to !== from) onMove({ car: i, to });
    };
    r.addEventListener('pointermove', move);
    r.addEventListener('pointerup', up);
    r.addEventListener('pointercancel', up);
  }

  return {
    update(s) {
      state = s;
      p.cars.forEach((_, i) => place(i, s.pos[i]));
      rects[0].classList.toggle('out', s.pos[0] === N - 2);
    },
  };
}
