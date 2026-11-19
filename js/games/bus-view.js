import { svgEl, htmlEl } from '../svg.js';
import { CAP, reachable } from './bus.js';

export const COLORS = ['#e5484d', '#3e7bfa', '#f2c40f', '#2fa36b', '#9256d9', '#f2711c'];
const S = 10;

export function createView(root, p, onMove) {
  const wrap = htmlEl('div', 'bus-wrap', root);
  const stop = htmlEl('div', 'bus-stop', wrap);
  const now = htmlEl('div', 'bus-now', stop);
  const queue = htmlEl('div', 'bus-queue', stop);
  const bench = htmlEl('div', 'bench', wrap);
  const svg = svgEl('svg', { viewBox: `-2 -2 ${p.w * S + 4} ${p.h * S + 4}`, class: 'board bus' }, wrap);
  // The curb: riders walk out over the top edge.
  svgEl('rect', { x: -2, y: -2, width: p.w * S + 4, height: 1.4, rx: 0.7, class: 'curb' }, svg);
  const cellsG = svgEl('g', {}, svg);
  let riders = [];

  svg.addEventListener('pointerdown', (e) => {
    const i = e.target.dataset && e.target.dataset.i;
    if (i !== undefined) { e.preventDefault(); onMove(+i); }
  });

  return {
    update(s, ev) {
      // Bus at the stop, with its 3 seats.
      now.innerHTML = '';
      if (s.bus < p.buses.length) {
        now.style.background = COLORS[p.buses[s.bus]];
        for (let k = 0; k < CAP; k++) htmlEl('span', k < s.seated ? 'seat full' : 'seat', now);
        if (ev && ev.departed) { now.classList.remove('arrive'); void now.offsetWidth; now.classList.add('arrive'); }
      } else {
        now.style.background = 'var(--muted)';
      }
      // Every bus still to come, in order. Nothing hidden.
      queue.innerHTML = '';
      for (let b = s.bus + 1; b < p.buses.length; b++) htmlEl('span', 'chip', queue).style.background = COLORS[p.buses[b]];
      bench.innerHTML = '';
      for (let k = 0; k < p.bench; k++) {
        const slot = htmlEl('span', 'slot', bench);
        if (k < s.bench.length) htmlEl('span', 'dot', slot).style.background = COLORS[s.bench[k]];
      }
      bench.classList.toggle('full', s.bench.length >= p.bench);

      cellsG.innerHTML = '';
      riders = [];
      const acc = reachable(s.cells, p.w, p.h);
      for (let i = 0; i < s.cells.length; i++) {
        const x = (i % p.w) * S, y = ((i / p.w) | 0) * S, c = s.cells[i];
        if (c === -2) { svgEl('rect', { x: x + 0.6, y: y + 0.6, width: S - 1.2, height: S - 1.2, rx: 1.6, class: 'wall' }, cellsG); continue; }
        svgEl('rect', { x: x + 0.6, y: y + 0.6, width: S - 1.2, height: S - 1.2, rx: 1.6, class: 'floor' }, cellsG);
        if (c < 0) continue;
        const g = svgEl('g', { class: acc[i] ? 'rider free' : 'rider' }, cellsG);
        g.style.color = COLORS[c];
        svgEl('circle', { cx: x + S / 2, cy: y + 3.4, r: 1.9, class: 'body' }, g);
        svgEl('path', { d: `M ${x + 1.9} ${y + 8.9} a 3.1 3.1 0 0 1 6.2 0 z`, class: 'body' }, g);
        svgEl('rect', { x, y, width: S, height: S, class: 'tap', 'data-i': i }, g);
        riders[i] = g;
      }
    },
    reject(i) {
      const g = riders[i];
      if (g) g.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-1.2px)' }, { transform: 'translateX(1.2px)' }, { transform: 'translateX(0)' }], { duration: 200 });
      if (bench.classList.contains('full')) bench.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 300 });
    },
  };
}
