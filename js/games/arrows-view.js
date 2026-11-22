import { svgEl, svgPoint, PALETTE } from '../svg.js';
import { DX, DY } from './arrows.js';

const S = 10;
const MAX_ZOOM = 6;

export function createView(root, p, onMove) {
  const pad = 3;
  const W = p.w * S + 2 * pad, H = p.h * S + 2 * pad;
  const svg = svgEl('svg', { class: 'board arrows' }, root);
  const dots = svgEl('g', { class: 'dots' }, svg);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) svgEl('circle', { cx: x * S + S / 2, cy: y * S + S / 2, r: 0.7 }, dots);
  const flashLayer = svgEl('g', {}, svg);
  let cur = null;

  // ---- Zoom & pan: the viewBox is the camera.
  const vb = { x: -pad, y: -pad, w: W, h: H };
  const setVB = () => {
    vb.w = Math.min(W, Math.max(W / MAX_ZOOM, vb.w));
    vb.h = vb.w * H / W;
    vb.x = Math.min(-pad + W - vb.w, Math.max(-pad, vb.x));
    vb.y = Math.min(-pad + H - vb.h, Math.max(-pad, vb.y));
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  };
  setVB();
  // Keep the board point under (clientX, clientY) fixed while resizing.
  const zoomAt = (cx, cy, factor) => {
    const [x0, y0] = svgPoint(svg, { clientX: cx, clientY: cy });
    vb.w /= factor;
    setVB();
    const [x1, y1] = svgPoint(svg, { clientX: cx, clientY: cy });
    vb.x += x0 - x1; vb.y += y0 - y1;
    setVB();
  };

  const pts = new Map();
  let tapTarget = null, moved = false, pinch = null, startX = 0, startY = 0;
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic or already-gone pointer */ }
    // A new gesture's first finger: forget any finger whose "up" got lost.
    if (e.isPrimary) { pts.clear(); pinch = null; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      const g = e.target.closest && e.target.closest('g.arrow');
      tapTarget = g ? +g.dataset.id : null;
      moved = false; startX = e.clientX; startY = e.clientY;
    } else if (pts.size === 2) {
      tapTarget = null;
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      if (Math.hypot(now.x - startX, now.y - startY) > 8) moved = true;
      if (moved) {
        const [x0, y0] = svgPoint(svg, { clientX: prev.x, clientY: prev.y });
        const [x1, y1] = svgPoint(svg, { clientX: now.x, clientY: now.y });
        vb.x -= x1 - x0; vb.y -= y1 - y0;
        setVB();
      }
    } else if (pts.size === 2 && pinch) {
      pts.set(e.pointerId, now);
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && pinch.d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
    }
    pts.set(e.pointerId, now);
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (!moved && !pinch && tapTarget !== null && e.type === 'pointerup') onMove(tapTarget);
      pinch = null; tapTarget = null;
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 300)); }, { passive: false });
  svg.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, vb.w < W * 0.99 ? 0.01 : 2.5));

  const groups = p.arrows.map((a, i) => {
    const g = svgEl('g', { class: 'arrow', 'data-id': i }, svg);
    g.style.color = PALETTE[i % PALETTE.length];
    const line = a.cells.map(([x, y]) => `${x * S + S / 2},${y * S + S / 2}`).join(' ');
    svgEl('polyline', { points: line, class: 'hit' }, g);
    svgEl('polyline', { points: line, class: 'line' }, g);
    const [hx, hy] = a.cells[a.cells.length - 1];
    const cx = hx * S + S / 2, cy = hy * S + S / 2;
    const dx = DX[a.dir], dy = DY[a.dir], px = -dy, py = dx;
    const tip = [cx + dx * 4.4, cy + dy * 4.4];
    const b1 = [cx - dx * 0.6 + px * 3.3, cy - dy * 0.6 + py * 3.3];
    const b2 = [cx - dx * 0.6 - px * 3.3, cy - dy * 0.6 - py * 3.3];
    svgEl('polygon', { points: [tip, b1, b2].map((q) => q.join(',')).join(' '), class: 'head' }, g);
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
        setTimeout(() => { if (cur.gone[ev.id]) g.style.display = 'none'; }, 420);
      } else if (ev.type === 'bump') {
        g.animate([
          { transform: 'translate(0,0)' },
          { transform: `translate(${DX[a.dir] * 2.5}px, ${DY[a.dir] * 2.5}px)` },
          { transform: 'translate(0,0)' },
        ], { duration: 220 });
        const [x, y] = ev.hit;
        const r = svgEl('rect', { x: x * S + 0.5, y: y * S + 0.5, width: S - 1, height: S - 1, rx: 2, class: 'flash' }, flashLayer);
        setTimeout(() => r.remove(), 600);
      }
    },
  };
}
