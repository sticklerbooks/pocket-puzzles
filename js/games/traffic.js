// Traffic Jam: 6x6 lot, cars slide along their lane, red car exits right.
//
// Generation: place cars at random, then explore every arrangement those cars
// can reach. Search back from the "red car is out" positions to get the true
// fewest-moves count for every arrangement, and start you at one whose count
// falls in the tier's range. Par is exact, not an estimate.
import { makeRng } from '../rng.js';

export const meta = {
  id: 'traffic',
  name: 'Traffic Jam',
  blurb: 'Slide cars along their lanes until the red car can drive out.',
};

export const N = 6;
export const ROW = 2;
const GOAL = N - 2;
const CAP = 20000; // bigger clusters are loose layouts, rarely hard
const POW = Array.from({ length: 20 }, (_, i) => 6 ** i);

const TIERS = {
  easy:   { cars: [6, 8],   band: [5, 9],   attempts: 150, enough: 3, ms: 1500 },
  medium: { cars: [8, 10],  band: [10, 17], attempts: 250, enough: 3, ms: 2500 },
  hard:   { cars: [10, 12], band: [16, 24], attempts: 600, enough: 1, ms: 4000 },
  expert: { cars: [11, 13], band: [25, 99], attempts: 900, enough: 1, ms: 6000 },
};

// car: { len, h (horizontal?), fix (row if h, column if not) }; pos = the other coordinate.
export function cellsOf(c, p) {
  const out = [];
  for (let k = 0; k < c.len; k++) out.push(c.h ? c.fix * N + p + k : (p + k) * N + c.fix);
  return out;
}

export function occupancy(cars, pos) {
  const o = new Int8Array(N * N).fill(-1);
  cars.forEach((c, i) => cellsOf(c, pos[i]).forEach((k) => { o[k] = i; }));
  return o;
}

// Lowest and highest position car i can slide to right now.
export function range(cars, pos, i, occ) {
  const c = cars[i];
  const cell = (p) => (c.h ? c.fix * N + p : p * N + c.fix);
  let lo = pos[i], hi = pos[i];
  while (lo > 0 && occ[cell(lo - 1)] < 0) lo--;
  while (hi + c.len < N && occ[cell(hi + c.len)] < 0) hi++;
  return [lo, hi];
}

function key(pos) {
  let k = 0;
  for (let i = 0; i < pos.length; i++) k += pos[i] * POW[i];
  return k;
}

function neighbors(cars, pos, fn) {
  const occ = occupancy(cars, pos);
  for (let i = 0; i < cars.length; i++) {
    const [lo, hi] = range(cars, pos, i, occ);
    for (let p = lo; p <= hi; p++) {
      if (p === pos[i]) continue;
      const q = pos.slice();
      q[i] = p;
      fn(q, i, p);
    }
  }
}

function decode(k, n) {
  const pos = new Array(n);
  for (let i = 0; i < n; i++) { pos[i] = k % 6; k = (k - pos[i]) / 6; }
  return pos;
}

// Fast inner loop: calls fn(neighborKey, car, to) for every single slide from
// the arrangement with key k, without allocating.
function slides(cars, k, buf, occ, fn) {
  const n = cars.length;
  let r = k;
  for (let i = 0; i < n; i++) { buf[i] = r % 6; r = (r - buf[i]) / 6; }
  occ.fill(-1);
  for (let i = 0; i < n; i++) {
    const c = cars[i], p = buf[i];
    for (let j = 0; j < c.len; j++) occ[c.h ? c.fix * N + p + j : (p + j) * N + c.fix] = i;
  }
  for (let i = 0; i < n; i++) {
    const c = cars[i], p = buf[i];
    const step = c.h ? 1 : N, base = c.h ? c.fix * N : c.fix;
    for (let q = p - 1; q >= 0 && occ[base + q * step] < 0; q--) fn(k + (q - p) * POW[i], i, q);
    for (let q = p + 1; q + c.len - 1 < N && occ[base + (q + c.len - 1) * step] < 0; q++) fn(k + (q - p) * POW[i], i, q);
  }
}

// Every arrangement reachable from start, with each one's distance to a win.
function explore(cars, start) {
  const buf = new Int8Array(cars.length), occ = new Int8Array(N * N);
  const k0 = key(start);
  const seen = new Map([[k0, 0]]);
  const keys = [k0];
  for (let h = 0; h < keys.length; h++) {
    slides(cars, keys[h], buf, occ, (nk) => {
      if (!seen.has(nk)) { seen.set(nk, keys.length); keys.push(nk); }
    });
    if (keys.length > CAP) return null;
  }
  const dist = new Int32Array(keys.length).fill(-1);
  const queue = [];
  keys.forEach((k, i) => { if (k % 6 === GOAL) { dist[i] = 0; queue.push(i); } });
  if (!queue.length) return null;
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    slides(cars, keys[i], buf, occ, (nk) => {
      const j = seen.get(nk);
      if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); }
    });
  }
  return { keys, dist, seen };
}

function solutionFrom(cars, ex, idx) {
  const path = [];
  const buf = new Int8Array(cars.length), occ = new Int8Array(N * N);
  let i = idx;
  while (ex.dist[i] > 0) {
    let next = -1, mv = null;
    slides(cars, ex.keys[i], buf, occ, (nk, car, to) => {
      if (next >= 0) return;
      const j = ex.seen.get(nk);
      if (ex.dist[j] === ex.dist[i] - 1) { next = j; mv = { car, to }; }
    });
    path.push(mv);
    i = next;
  }
  return path;
}

function addCars(rng, cars, pos, n) {
  const occ = occupancy(cars, pos);
  let tries = 0;
  while (cars.length < n && tries++ < 300) {
    const len = rng() < 0.72 ? 2 : 3;
    const h = rng() < 0.5;
    const fix = rng.int(N);
    if (h && fix === ROW) continue; // a sideways car in the exit row could never get out of the way
    const p = rng.int(N - len + 1);
    const c = { len, h, fix };
    const cells = cellsOf(c, p);
    if (cells.some((k) => occ[k] >= 0)) continue;
    cells.forEach((k) => { occ[k] = cars.length; });
    cars.push(c);
    pos.push(p);
  }
  return { cars, pos };
}

function randomCars(rng, n) {
  return addCars(rng, [{ len: 2, h: true, fix: ROW }], [rng.int(3)], n);
}

// Small change to a layout: drop a car, add a car, or both.
function mutate(rng, base, t) {
  const cars = base.cars.slice(), pos = base.pos.slice();
  const r = rng();
  if (r < 0.65 && cars.length > t.cars[0] - 2) {
    const k = 1 + rng.int(cars.length - 1);
    cars.splice(k, 1); pos.splice(k, 1);
  }
  if (r > 0.35 || cars.length < t.cars[0]) addCars(rng, cars, pos, Math.min(cars.length + 1, t.cars[1] + 1));
  return { cars, pos };
}

export function generate(tier, seed) {
  const t = TIERS[tier];
  const rng = makeRng(seed);
  let best = null, inBand = 0, climb = null, stale = 0;
  const t0 = Date.now();
  for (let a = 0; a < t.attempts && inBand < t.enough; a++) {
    if (best && Date.now() - t0 > t.ms) break; // time's up: hand over the hardest found
    if (stale > 40) { climb = null; stale = 0; } // stuck on a plateau: start over
    // Hill-climb: mostly tweak the hardest layout so far, sometimes start fresh.
    const { cars, pos } = climb && rng() < 0.9
      ? mutate(rng, climb, t)
      : randomCars(rng, t.cars[0] + rng.int(t.cars[1] - t.cars[0] + 1));
    const ex = explore(cars, pos);
    if (!ex) continue;
    let idx = -1, d = -1;
    for (let i = 0; i < ex.dist.length; i++) {
      const v = ex.dist[i];
      if (v <= t.band[1] && v > d) { d = v; idx = i; }
    }
    if (idx < 0 || d < 1) continue;
    if (!climb || d > climb.d) stale = 0; else stale++;
    if (!climb || d >= climb.d) climb = { cars, pos: decode(ex.keys[idx], cars.length), d };
    const solution = solutionFrom(cars, ex, idx);
    // Interest: how many of the cars actually take part in the solution.
    const moved = new Set(solution.map((m) => m.car)).size / cars.length;
    const ok = d >= t.band[0];
    if (ok) inBand++;
    const fit = ok ? 100 + moved * 10 + d * 0.2 : d;
    if (!best || fit > best.fit) best = { fit, cars, start: decode(ex.keys[idx], cars.length), par: d, solution, moved };
  }
  return {
    puzzle: { cars: best.cars, start: best.start, par: best.par },
    info: { par: best.par, cars: best.cars.length, moved: +best.moved.toFixed(2), solution: best.solution },
  };
}

export function init(p) { return { pos: p.start.slice(), moves: 0 }; }

export function apply(p, s, mv) {
  const { car, to } = mv;
  const [lo, hi] = range(p.cars, s.pos, car, occupancy(p.cars, s.pos));
  if (to < lo || to > hi || to === s.pos[car]) return null;
  s.pos[car] = to;
  s.moves++;
  return { type: 'slide', car, to };
}

export function status(p, s) { return s.pos[0] === GOAL ? 'won' : 'play'; }

export function describe(p, s) {
  if (s.pos[0] === GOAL) return s.moves <= p.par ? `Out in ${s.moves} moves, matching par` : `Out in ${s.moves} moves (par ${p.par})`;
  return `Moves ${s.moves} · Par ${p.par}`;
}
