// Traffic Jam: cars slide along their lane, red car exits right. Lots grow
// from 6x6 to 8x8 with a few fixed bollards; each level has a move limit.
//
// Generation: place cars at random, then explore every arrangement those cars
// can reach. Search back from the "red car is out" positions to get the true
// fewest-moves count for every arrangement, and start you at one whose count
// falls in the tier's range. Par is exact, not an estimate. Hill-climbing
// (tweak the hardest layout found so far) finds the hard ones quickly.
import { makeRng } from '../rng.js';
import { BANK } from './traffic-bank.js';

export const meta = {
  id: 'traffic',
  name: 'Traffic Jam',
  blurb: 'Slide cars along their lanes until the red car can drive out. Don’t run out of moves.',
};

const CAP = 8000;  // bigger clusters are loose layouts, rarely hard

// slack: extra moves allowed beyond par, as a share of par (minimum 4).
const TIERS = {
  easy:   { n: 6, cars: [7, 9],   walls: [0, 0], band: [6, 10],  slack: 1.0,  attempts: 200, enough: 3, ms: 1500 },
  medium: { n: 7, cars: [13, 15], walls: [1, 3], band: [12, 20], slack: 0.75, attempts: 400, enough: 2, ms: 2500 },
  hard:   { n: 8, cars: [17, 20], walls: [3, 5], band: [20, 32], slack: 0.6,  attempts: 700, enough: 1, ms: 4000 },
  expert: { n: 8, cars: [18, 22], walls: [4, 6], band: [32, 99], slack: 0.5,  attempts: 900, enough: 1, ms: 6000 },
};

export const exitRow = (n) => Math.floor((n - 1) / 2);

// car: { len, h (horizontal?), fix (row if h, column if not) }; pos = the other coordinate.
export function cellsOf(n, c, p) {
  const out = [];
  for (let k = 0; k < c.len; k++) out.push(c.h ? c.fix * n + p + k : (p + k) * n + c.fix);
  return out;
}

export function occupancy(pz, pos) {
  const o = new Int8Array(pz.n * pz.n).fill(-1);
  for (const w of pz.walls) o[w] = 99;
  pz.cars.forEach((c, i) => cellsOf(pz.n, c, pos[i]).forEach((k) => { o[k] = i; }));
  return o;
}

// Lowest and highest position car i can slide to right now.
export function range(pz, pos, i, occ) {
  const c = pz.cars[i], n = pz.n;
  const cell = (p) => (c.h ? c.fix * n + p : p * n + c.fix);
  let lo = pos[i], hi = pos[i];
  while (lo > 0 && occ[cell(lo - 1)] < 0) lo--;
  while (hi + c.len < n && occ[cell(hi + c.len)] < 0) hi++;
  return [lo, hi];
}

// Arrangements are keyed by a short string: character i is car i's position.
function makeSearch(pz) {
  const { n, cars, walls } = pz;
  const m = cars.length;
  const goal = n - 2;
  const buf = new Uint8Array(m), occ = new Int8Array(n * n);
  const key = (pos) => String.fromCharCode(...pos);
  const decode = (k) => Array.from(k, (ch) => ch.charCodeAt(0));
  const keyOf = () => String.fromCharCode.apply(null, buf);
  // Calls fn(neighborKey, car, to) for every single slide.
  const slides = (k, fn) => {
    for (let i = 0; i < m; i++) buf[i] = k.charCodeAt(i);
    occ.fill(-1);
    for (const w of walls) occ[w] = 99;
    for (let i = 0; i < m; i++) {
      const c = cars[i], p = buf[i];
      for (let j = 0; j < c.len; j++) occ[c.h ? c.fix * n + p + j : (p + j) * n + c.fix] = i;
    }
    for (let i = 0; i < m; i++) {
      const c = cars[i], p = buf[i];
      const step = c.h ? 1 : n, base = c.h ? c.fix * n : c.fix;
      for (let q = p - 1; q >= 0 && occ[base + q * step] < 0; q--) { buf[i] = q; fn(keyOf(), i, q); }
      for (let q = p + 1; q + c.len - 1 < n && occ[base + (q + c.len - 1) * step] < 0; q++) { buf[i] = q; fn(keyOf(), i, q); }
      buf[i] = p;
    }
  };
  return { key, decode, slides, goal };
}

// Every arrangement reachable from start, with each one's distance to a win.
function explore(pz, start) {
  const S = makeSearch(pz);
  const k0 = S.key(start);
  const seen = new Map([[k0, 0]]);
  const keys = [k0];
  for (let h = 0; h < keys.length; h++) {
    S.slides(keys[h], (nk) => { if (!seen.has(nk)) { seen.set(nk, keys.length); keys.push(nk); } });
    if (keys.length > CAP) return null;
  }
  const dist = new Int32Array(keys.length).fill(-1);
  const queue = [];
  keys.forEach((k, i) => { if (k.charCodeAt(0) === S.goal) { dist[i] = 0; queue.push(i); } });
  if (!queue.length) return null;
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    S.slides(keys[i], (nk) => { const j = seen.get(nk); if (dist[j] < 0) { dist[j] = dist[i] + 1; queue.push(j); } });
  }
  return { keys, dist, seen, S };
}

function solutionFrom(ex, idx) {
  const path = [];
  let i = idx;
  while (ex.dist[i] > 0) {
    let next = -1, mv = null;
    ex.S.slides(ex.keys[i], (nk, car, to) => {
      if (next >= 0) return;
      const j = ex.seen.get(nk);
      if (ex.dist[j] === ex.dist[i] - 1) { next = j; mv = { car, to }; }
    });
    path.push(mv);
    i = next;
  }
  return path;
}

function addCars(rng, pz, pos, count) {
  const { n, cars } = pz;
  const row = cars[0].fix;
  const occ = occupancy(pz, pos);
  let tries = 0;
  while (cars.length < count && tries++ < 400) {
    const len = rng() < (n === 8 ? 0.5 : n === 7 ? 0.62 : 0.72) ? 2 : 3;
    const h = rng() < 0.5;
    const fix = rng.int(n);
    if (h && fix === row) continue; // a sideways car in the exit row could never get out of the way
    const p = rng.int(n - len + 1);
    const c = { len, h, fix };
    const cells = cellsOf(n, c, p);
    if (cells.some((k) => occ[k] >= 0)) continue;
    cells.forEach((k) => { occ[k] = cars.length; });
    cars.push(c);
    pos.push(p);
  }
}

function randomLot(rng, t) {
  const n = t.n, row = exitRow(n);
  const pz = { n, cars: [{ len: 2, h: true, fix: row }], walls: [] };
  const pos = [rng.int(Math.max(1, n - 4))];
  const nw = t.walls[0] + rng.int(t.walls[1] - t.walls[0] + 1);
  const occ = occupancy(pz, pos);
  while (pz.walls.length < nw) {
    const k = rng.int(n * n);
    if (occ[k] >= 0 || ((k / n) | 0) === row) continue; // never wall off the exit row
    occ[k] = 99;
    pz.walls.push(k);
  }
  addCars(rng, pz, pos, t.cars[0] + rng.int(t.cars[1] - t.cars[0] + 1));
  return { pz, pos };
}

// Small change to a layout: drop a car, add a car, or both.
function mutate(rng, base, t) {
  const pz = { n: base.pz.n, cars: base.pz.cars.slice(), walls: base.pz.walls };
  const pos = base.pos.slice();
  const r = rng();
  if (r < 0.65 && pz.cars.length > t.cars[0] - 2) {
    const k = 1 + rng.int(pz.cars.length - 1);
    pz.cars.splice(k, 1); pos.splice(k, 1);
  }
  if (r > 0.35 || pz.cars.length < t.cars[0]) addCars(rng, pz, pos, Math.min(pz.cars.length + 1, t.cars[1]));
  return { pz, pos };
}

// Mirror top-to-bottom: same puzzle, different look (the exit row moves too).
function flip(pz, pos) {
  const n = pz.n;
  return {
    pz: {
      n,
      cars: pz.cars.map((c) => (c.h ? { ...c, fix: n - 1 - c.fix } : c)),
      walls: pz.walls.map((k) => (n - 1 - ((k / n) | 0)) * n + (k % n)),
    },
    pos: pz.cars.map((c, i) => (c.h ? pos[i] : n - c.len - pos[i])),
  };
}

// Hard lots are rare at random, so the hard tiers start from a bank of good
// layouts found offline (tools/build-traffic-bank.mjs) and reshape one: add
// and remove cars, keeping each change only if the exact par stays in range.
function fromBank(t, bank, rng) {
  const b = rng.pick(bank);
  let cur = { pz: { n: b.n, cars: b.cars.map(([len, h, fix]) => ({ len, h: !!h, fix })), walls: b.walls }, pos: b.start };
  if (rng() < 0.5) cur = flip(cur.pz, cur.pos);
  let best = null, changes = 0;
  const t0 = Date.now();
  for (let a = 0; a < 200 && changes < 8 && Date.now() - t0 < t.ms / 2; a++) {
    const cand = a === 0 ? cur : mutate(rng, cur, t);
    const r = score(cand.pz, cand.pos, t);
    if (!r || r.par < t.band[0]) continue;
    if (a > 0) changes++;
    cur = { pz: cand.pz, pos: r.start };
    if (!best || changes >= 2 || r.par >= best.par) best = r;
  }
  return best;
}

function score(pz, pos, t) {
  const ex = explore(pz, pos);
  if (!ex) return null;
  let idx = -1, d = -1;
  for (let i = 0; i < ex.dist.length; i++) {
    const v = ex.dist[i];
    if (v <= t.band[1] && v > d) { d = v; idx = i; }
  }
  if (idx < 0 || d < 1) return null;
  const solution = solutionFrom(ex, idx);
  return { pz, start: ex.S.decode(ex.keys[idx]), par: d, solution, moved: new Set(solution.map((mv) => mv.car)).size / pz.cars.length };
}

export function generate(tier, seed, opts = {}) {
  const t = { ...TIERS[tier], ...opts };
  const rng = makeRng(seed);
  if (BANK[tier] && BANK[tier].length && !opts.fresh) {
    const r = fromBank(t, BANK[tier], rng);
    if (r) return finish(r, t);
  }
  let best = null, inBand = 0, climb = null, stale = 0;
  const t0 = Date.now();
  for (let a = 0; a < t.attempts && inBand < t.enough; a++) {
    if (best && Date.now() - t0 > t.ms) break; // time's up: hand over the hardest found
    if (stale > 40) { climb = null; stale = 0; } // stuck on a plateau: start over
    const { pz, pos } = climb && rng() < 0.9 ? mutate(rng, climb, t) : randomLot(rng, t);
    const ex = explore(pz, pos);
    if (!ex) continue;
    let idx = -1, d = -1;
    for (let i = 0; i < ex.dist.length; i++) {
      const v = ex.dist[i];
      if (v <= t.band[1] && v > d) { d = v; idx = i; }
    }
    if (idx < 0 || d < 1) continue;
    const start = ex.S.decode(ex.keys[idx]);
    if (!climb || d > climb.d) stale = 0; else stale++;
    if (!climb || d >= climb.d) climb = { pz, pos: start, d };
    const solution = solutionFrom(ex, idx);
    // Interest: how many of the cars actually take part in the solution.
    const moved = new Set(solution.map((mv) => mv.car)).size / pz.cars.length;
    const ok = d >= t.band[0];
    if (ok) inBand++;
    const fit = ok ? 100 + moved * 10 + d * 0.2 : d;
    if (!best || fit > best.fit) best = { fit, pz, start, par: d, solution, moved };
  }
  return finish(best, t);
}

function finish(best, t) {
  const { pz, start, par } = best;
  return {
    puzzle: { n: pz.n, cars: pz.cars, walls: pz.walls, start, par, limit: par + Math.max(4, Math.ceil(par * t.slack)) },
    info: { par, n: pz.n, cars: pz.cars.length, moved: +best.moved.toFixed(2), solution: best.solution },
  };
}

export function init(p) { return { pos: p.start.slice(), moves: 0 }; }

export function apply(p, s, mv) {
  const { car, to } = mv;
  if (s.moves >= p.limit) return null;
  const [lo, hi] = range(p, s.pos, car, occupancy(p, s.pos));
  if (to < lo || to > hi || to === s.pos[car]) return null;
  s.pos[car] = to;
  s.moves++;
  return { type: 'slide', car, to };
}

export function status(p, s) {
  if (s.pos[0] === p.n - 2) return 'won';
  return s.moves >= p.limit ? 'lost' : 'play';
}

export function describe(p, s) {
  if (s.pos[0] === p.n - 2) return s.moves <= p.par ? `Out in ${s.moves} moves, matching par` : `Out in ${s.moves} moves (par ${p.par})`;
  return `Moves ${s.moves} of ${p.limit} · Par ${p.par}`;
}

export function lostText() { return 'Out of moves'; }
