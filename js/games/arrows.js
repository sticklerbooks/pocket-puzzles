// Arrows: each arrow is a bent line with a head. Tap it and it slides out the
// way its head points, but only if nothing is in the way. Tapping a blocked
// arrow costs a heart; run out and it's game over.
//
// Generation: arrows are grown as random winding paths and added one at a
// time. Each arrow "waits on" the arrows sitting in its path out; a new arrow
// is kept only if that waiting-graph stays free of loops, which is exactly
// when the board can still be cleared. So every puzzle is solvable, and the
// check is cheap enough for boards of 200+ arrows.
import { makeRng } from '../rng.js';

export const meta = {
  id: 'arrows',
  name: 'Arrows',
  blurb: 'Tap an arrow to send it off the board. Hit a blocked one and you lose a heart. Pinch to zoom.',
};

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

// lens: [min, max, weight] buckets for arrow length.
const SHORT = [2, 5, 0.6], MID = [6, 12, 0.28], LONG = [13, 28, 0.12];
const TIERS = {
  easy:   { w: 10, h: 14, lives: 5, lens: [[2, 5, 0.75], [6, 10, 0.25]], tries: 3 },
  medium: { w: 15, h: 22, lives: 3, lens: [SHORT, MID, LONG], tries: 3 },
  hard:   { w: 20, h: 30, lives: 3, lens: [SHORT, MID, LONG], tries: 2 },
  expert: { w: 24, h: 38, lives: 3, lens: [[2, 5, 0.62], [6, 14, 0.26], [15, 34, 0.12]], tries: 2 },
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
  const waitsOn = arrows.map((a, i) => new Set(rayCells(w, h, a).map((c) => occ[c]).filter((o) => o >= 0 && o !== i)));
  const blocks = arrows.map(() => []);
  waitsOn.forEach((s, i) => s.forEach((j) => blocks[j].push(i)));
  const count = waitsOn.map((s) => s.size);
  let free = count.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
  let left = arrows.length, depth = 0, frac = 0;
  while (free.length) {
    depth++;
    frac += free.length / left;
    left -= free.length;
    const next = [];
    for (const i of free) for (const j of blocks[i]) if (--count[j] === 0) next.push(j);
    free = next;
  }
  if (left) return null;
  return { depth, freeFrac: frac / depth };
}

function pickLen(rng, lens) {
  let r = rng() * lens.reduce((s, l) => s + l[2], 0);
  for (const [lo, hi, wt] of lens) { if ((r -= wt) <= 0) return lo + rng.int(hi - lo + 1); }
  return 2;
}

function build(t, rng) {
  const { w, h } = t;
  const n = w * h;
  const occ = new Int16Array(n).fill(-1);
  const rayCover = Array.from({ length: n }, () => []); // cell -> arrows whose path out crosses it
  const waitsOn = [], blocks = [];
  const arrows = [];
  const stamp = new Int32Array(4096);
  let tick = 0;
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] < 0;

  // Would adding this arrow create a loop of arrows waiting on each other?
  const wouldLoop = (outs, ins) => {
    for (const j of outs) if (ins.has(j)) return true;
    tick++;
    const stack = [...outs];
    for (const j of outs) stamp[j] = tick;
    while (stack.length) {
      const j = stack.pop();
      for (const k of waitsOn[j]) {
        if (ins.has(k)) return true;
        if (stamp[k] !== tick) { stamp[k] = tick; stack.push(k); }
      }
    }
    return false;
  };

  const tryPlace = (path) => {
    const options = [path, path.slice().reverse()].map((cells) => ({ cells, dir: headDir(cells) }));
    if (rng() < 0.5) options.reverse();
    for (const a of options) {
      const own = new Set(a.cells.map(([x, y]) => y * w + x));
      const ray = rayCells(w, h, a);
      if (ray.some((c) => own.has(c))) continue;
      const outs = new Set();
      for (const c of ray) if (occ[c] >= 0) outs.add(occ[c]);
      const ins = new Set();
      for (const c of own) for (const j of rayCover[c]) ins.add(j);
      if (wouldLoop(outs, ins)) continue;
      const id = arrows.length;
      arrows.push(a);
      for (const c of own) occ[c] = id;
      for (const c of ray) rayCover[c].push(id);
      waitsOn.push(outs);
      blocks.push(ins);
      for (const j of outs) blocks[j].add(id);
      for (const j of ins) waitsOn[j].add(id);
      return true;
    }
    return false;
  };

  // Winding walk: mostly straight, turns favor one rotation so long arrows
  // hook and spiral around their neighbours.
  const grow = (sx, sy, L) => {
    const path = [[sx, sy]];
    const used = new Set([sy * w + sx]);
    let d = rng.int(4);
    const spin = rng() < 0.5 ? 1 : 3;
    while (path.length < L) {
      const [x, y] = path[path.length - 1];
      const ok = (k) => open(x + DX[k], y + DY[k]) && !used.has((y + DY[k]) * w + x + DX[k]);
      let k;
      const r = rng();
      if (r < 0.55 && ok(d)) k = d;
      else if (r < 0.85 && ok((d + spin) % 4)) k = (d + spin) % 4;
      else {
        const opts = [0, 1, 2, 3].filter(ok);
        if (!opts.length) break;
        k = rng.pick(opts);
      }
      d = k;
      path.push([x + DX[d], y + DY[d]]);
      used.add((y + DY[d]) * w + x + DX[d]);
    }
    return path;
  };

  const order = rng.shuffle([...Array(n).keys()]);
  for (const lens of [t.lens, [[2, 3, 1]]]) {
    for (const c of order) {
      if (occ[c] >= 0) continue;
      const x = c % w, y = (c / w) | 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = grow(x, y, pickLen(rng, lens));
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
    const fit = a.depth * 0.2 + (1 - a.freeFrac) * 2 + coverage * 5;
    if (!best || fit > best.fit) best = { fit, arrows, a, coverage };
  }
  return {
    puzzle: { w: t.w, h: t.h, lives: t.lives, arrows: best.arrows },
    info: { count: best.arrows.length, depth: best.a.depth, freeFrac: +best.a.freeFrac.toFixed(2), coverage: +best.coverage.toFixed(2) },
  };
}

export function init(p) {
  const occ = new Int16Array(p.w * p.h).fill(-1);
  p.arrows.forEach((a, i) => a.cells.forEach(([x, y]) => { occ[y * p.w + x] = i; }));
  return { occ, gone: p.arrows.map(() => false), left: p.arrows.length, lives: p.lives };
}

// Tapping a blocked arrow is a move too: it costs a heart.
export function apply(p, s, id) {
  if (s.gone[id] || s.lives <= 0) return null;
  const hit = blocker(s.occ, p.w, p.h, p.arrows[id], id);
  if (hit) { s.lives--; return { type: 'bump', id, hit }; }
  s.gone[id] = true;
  s.left--;
  for (const [x, y] of p.arrows[id].cells) s.occ[y * p.w + x] = -1;
  return { type: 'exit', id };
}

export function status(p, s) {
  if (s.left === 0) return 'won';
  return s.lives <= 0 ? 'lost' : 'play';
}

export function hearts(p, s) { return '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(p.lives - Math.max(0, s.lives)); }

export function describe(p, s) {
  if (s.left === 0) return `Cleared ${p.arrows.length} arrows · ${hearts(p, s)}`;
  return `${hearts(p, s)}  ·  ${s.left} of ${p.arrows.length} left`;
}

export function lostText() { return 'Out of hearts'; }
