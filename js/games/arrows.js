// Arrows: each arrow is a bent line with a head. Tap it and it slides out the
// way its head points, but only if nothing is in the way.
//
// Generation: arrows are added one at a time and kept only if the board can
// still be cleared, so every puzzle is solvable by construction. Removing an
// arrow never blocks anything, so the only skill is finding the free ones;
// difficulty is "depth" (how many rounds of removal it takes) and how few
// arrows are free at each round.
import { makeRng } from '../rng.js';

export const meta = {
  id: 'arrows',
  name: 'Arrows',
  blurb: 'Tap an arrow to send it off the board. It only leaves if nothing is in its way.',
};

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

const TIERS = {
  easy:   { w: 6,  h: 7,  len: [2, 4], target: 4,  tries: 24 },
  medium: { w: 8,  h: 10, len: [2, 5], target: 7,  tries: 18 },
  hard:   { w: 10, h: 13, len: [2, 6], target: 10, tries: 12 },
  expert: { w: 12, h: 16, len: [3, 8], target: 14, tries: 8 },
};

function headDir(cells) {
  const [ax, ay] = cells[cells.length - 2];
  const [bx, by] = cells[cells.length - 1];
  for (let d = 0; d < 4; d++) if (bx - ax === DX[d] && by - ay === DY[d]) return d;
  throw new Error('bad path');
}

// First cell in this arrow's way, or null if its path off the board is clear.
export function blocker(occ, w, h, arrow, id) {
  const [hx, hy] = arrow.cells[arrow.cells.length - 1];
  let x = hx + DX[arrow.dir], y = hy + DY[arrow.dir];
  while (x >= 0 && y >= 0 && x < w && y < h) {
    const o = occ[y * w + x];
    if (o >= 0 && o !== id) return [x, y];
    x += DX[arrow.dir]; y += DY[arrow.dir];
  }
  return null;
}

function rayCells(w, h, arrow) {
  const out = [];
  const [hx, hy] = arrow.cells[arrow.cells.length - 1];
  let x = hx + DX[arrow.dir], y = hy + DY[arrow.dir];
  while (x >= 0 && y >= 0 && x < w && y < h) { out.push(y * w + x); x += DX[arrow.dir]; y += DY[arrow.dir]; }
  return out;
}

// Peel the board in rounds: every free arrow leaves at once.
export function analyze(w, h, arrows) {
  const occ = new Int16Array(w * h).fill(-1);
  arrows.forEach((a, i) => a.cells.forEach(([x, y]) => { occ[y * w + x] = i; }));
  let alive = arrows.map((_, i) => i);
  const fracs = [];
  while (alive.length) {
    const free = alive.filter((i) => !blocker(occ, w, h, arrows[i], i));
    if (!free.length) return null;
    fracs.push(free.length / alive.length);
    for (const i of free) for (const [x, y] of arrows[i].cells) occ[y * w + x] = -1;
    const gone = new Set(free);
    alive = alive.filter((i) => !gone.has(i));
  }
  return { depth: fracs.length, freeFrac: fracs.reduce((s, v) => s + v, 0) / fracs.length };
}

function build(t, rng) {
  const { w, h } = t;
  const occ = new Int16Array(w * h).fill(-1);
  const arrows = [];
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] < 0;

  const tryPlace = (path) => {
    const options = [path, path.slice().reverse()]
      .map((cells) => ({ cells, dir: headDir(cells) }))
      .filter((a) => {
        const own = new Set(a.cells.map(([x, y]) => y * w + x));
        return !rayCells(w, h, a).some((c) => own.has(c));
      });
    // Prefer heads that point across the board: longer paths out make deeper puzzles.
    options.sort((a, b) => rayCells(w, h, b).length - rayCells(w, h, a).length);
    if (options.length === 2 && rng() < 0.25) options.reverse();
    for (const a of options) {
      const id = arrows.length;
      for (const [x, y] of a.cells) occ[y * w + x] = id;
      arrows.push(a);
      if (analyze(w, h, arrows)) return true;
      arrows.pop();
      for (const [x, y] of a.cells) occ[y * w + x] = -1;
    }
    return false;
  };

  const grow = (sx, sy, L) => {
    const path = [[sx, sy]];
    const used = new Set([sy * w + sx]);
    let d = rng.int(4);
    while (path.length < L) {
      const [x, y] = path[path.length - 1];
      const opts = [];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (open(nx, ny) && !used.has(ny * w + nx)) opts.push(k);
      }
      if (!opts.length) break;
      d = opts.includes(d) && rng() < 0.6 ? d : rng.pick(opts);
      const nx = x + DX[d], ny = y + DY[d];
      path.push([nx, ny]);
      used.add(ny * w + nx);
    }
    return path;
  };

  const order = rng.shuffle([...Array(w * h).keys()]);
  for (const [lo, hi] of [t.len, [2, 2]]) {
    for (const c of order) {
      if (occ[c] >= 0) continue;
      const x = c % w, y = (c / w) | 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = grow(x, y, lo + rng.int(hi - lo + 1));
        if (p.length < 2) break;
        if (tryPlace(p)) break;
      }
    }
  }
  return arrows;
}

export function generate(tier, seed) {
  const t = TIERS[tier];
  const rng = makeRng(seed);
  let best = null;
  for (let i = 0; i < t.tries; i++) {
    const arrows = build(t, rng);
    const a = analyze(t.w, t.h, arrows);
    const coverage = arrows.reduce((s, x) => s + x.cells.length, 0) / (t.w * t.h);
    const fit = -Math.abs(a.depth - t.target) + (1 - a.freeFrac) * 2 + coverage * 3;
    if (!best || fit > best.fit) best = { fit, arrows, a, coverage };
  }
  return {
    puzzle: { w: t.w, h: t.h, arrows: best.arrows },
    info: { depth: best.a.depth, freeFrac: +best.a.freeFrac.toFixed(2), count: best.arrows.length, coverage: +best.coverage.toFixed(2) },
  };
}

export function init(p) {
  const occ = new Int16Array(p.w * p.h).fill(-1);
  p.arrows.forEach((a, i) => a.cells.forEach(([x, y]) => { occ[y * p.w + x] = i; }));
  return { occ, gone: p.arrows.map(() => false), left: p.arrows.length, bumps: 0 };
}

// Tapping a blocked arrow is a move too (it counts as a bump).
export function apply(p, s, id) {
  if (s.gone[id]) return null;
  const hit = blocker(s.occ, p.w, p.h, p.arrows[id], id);
  if (hit) { s.bumps++; return { type: 'bump', id, hit }; }
  s.gone[id] = true;
  s.left--;
  for (const [x, y] of p.arrows[id].cells) s.occ[y * p.w + x] = -1;
  return { type: 'exit', id };
}

export function status(p, s) { return s.left === 0 ? 'won' : 'play'; }

export function describe(p, s) {
  if (s.left === 0) return s.bumps ? `Cleared with ${s.bumps} bump${s.bumps > 1 ? 's' : ''}` : 'Cleared without a bump';
  return `${s.left} left` + (s.bumps ? ` · ${s.bumps} bump${s.bumps > 1 ? 's' : ''}` : '');
}
