// Bus Stop: riders stand in a lot; buses arrive in a fixed, fully visible order.
// Tap a rider who has a clear path to the top edge. Riders matching the bus at
// the stop board it; others wait on a small bench. Each bus takes 3 riders.
// A full bench with no matching rider free means you're stuck: game over.
//
// You only see the next few buses, so there's some surprise, but every puzzle
// is solvable: generation picks a walking-out order first, then colors riders
// so that order wins. Difficulty is measured by letting a careful player who
// sees only what you see try it many times: easy puzzles let it win most of
// the time, expert ones only now and then (never zero).
import { makeRng } from '../rng.js';

export const meta = {
  id: 'bus',
  name: 'Bus Stop',
  blurb: 'Send riders to the bus of their color. Everyone else waits on a small bench.',
};

export const CAP = 3;

// view: how many buses after the current one you can see coming.
// band: target win rate for a sensible player who only sees what you see.
const TIERS = {
  easy:   { w: 6, h: 7,  colors: 4, bench: 5, view: 3, wallP: 0.08, detour: 0.15, margin: 1, look: 3, band: [0.6, 1.01] },
  medium: { w: 7, h: 8,  colors: 5, bench: 5, view: 2, wallP: 0.10, detour: 0.30, margin: 0, look: 3, band: [0.35, 0.65] },
  hard:   { w: 8, h: 9,  colors: 6, bench: 4, view: 2, wallP: 0.10, detour: 0.50, margin: 0, look: 3, band: [0.15, 0.35] },
  expert: { w: 9, h: 10, colors: 8, bench: 4, view: 1, wallP: 0.12, detour: 0.55, margin: 0, look: 2, band: [0.04, 0.2] },
};

const WALL = -2, EMPTY = -1;

// Which riders can walk out right now (open path to the top edge).
export function reachable(cells, w, h) {
  const n = w * h;
  const open = new Uint8Array(n);
  const q = [];
  for (let x = 0; x < w; x++) if (cells[x] === EMPTY) { open[x] = 1; q.push(x); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w;
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j >= 0 && j < n && !open[j] && cells[j] === EMPTY) { open[j] = 1; q.push(j); }
    }
  }
  const acc = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (cells[i] < 0) continue;
    const x = i % w;
    if (i < w || open[i - w] || (i + w < n && open[i + w]) || (x > 0 && open[i - 1]) || (x < w - 1 && open[i + 1])) acc[i] = 1;
  }
  return acc;
}

function layout(t, rng) {
  const { w, h } = t;
  const cells = new Int8Array(w * h).fill(0);
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < Math.ceil(w / 2); x++) {
      if (rng() < t.wallP) { cells[y * w + x] = WALL; cells[y * w + (w - 1 - x)] = WALL; }
    }
  }
  // Wall off anything that could never reach the top.
  const seen = new Uint8Array(w * h);
  const q = [];
  for (let x = 0; x < w; x++) if (cells[x] !== WALL) { seen[x] = 1; q.push(x); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w;
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j >= 0 && j < w * h && !seen[j] && cells[j] !== WALL) { seen[j] = 1; q.push(j); }
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i]) cells[i] = WALL;
  // Rider count must be a multiple of 3: leave a spot or two empty.
  const total = cells.filter((c) => c === 0).length;
  const riders = [];
  for (let i = w; i < w * h; i++) if (cells[i] === 0) riders.push(i);
  rng.shuffle(riders);
  let extra = total % 3;
  while (extra-- > 0) cells[riders.pop()] = EMPTY;
  return cells;
}

function walkOrder(cells, w, h, rng) {
  const c = cells.slice();
  const out = [];
  for (;;) {
    const acc = reachable(c, w, h);
    const opts = [];
    for (let i = 0; i < c.length; i++) if (acc[i]) opts.push(i);
    if (!opts.length) return out;
    const i = rng.pick(opts);
    out.push(i);
    c[i] = EMPTY;
  }
}

// Color riders along the planned order. Mostly each rider is for the bus at
// the stop; sometimes (detour) they're for a later bus and wait on the bench.
function colorize(order, buses, t, rng) {
  const P = order.length;
  const filled = new Uint8Array(P);
  const color = new Int8Array(P);
  let ptr = 0;
  for (let s = 0; s < P; s++) {
    while (filled[ptr]) ptr++;
    const bus = (ptr / CAP) | 0;
    let waiting = 0;
    for (let j = (bus + 1) * CAP; j < P; j++) if (filled[j]) waiting++;
    if (rng() < t.detour && waiting < t.bench - t.margin) {
      const cur = buses[bus];
      const opts = new Set();
      for (let b = bus + 1; b < Math.min(buses.length, bus + 1 + t.look); b++) if (buses[b] !== cur) opts.add(buses[b]);
      if (opts.size) {
        const col = rng.pick([...opts]);
        let j = -1;
        for (let k = (bus + 1) * CAP; k < P; k++) if (!filled[k] && buses[(k / CAP) | 0] === col) { j = k; break; }
        if (j >= 0) { filled[j] = 1; color[s] = col; continue; }
      }
    }
    filled[ptr] = 1;
    color[s] = buses[bus];
  }
  return color;
}

export function init(p) { return { cells: p.cells.slice(), bus: 0, seated: 0, bench: [] }; }

export function apply(p, s, i) {
  if (s.bus >= p.buses.length || s.cells[i] < 0) return null;
  if (!reachable(s.cells, p.w, p.h)[i]) return null;
  const c = s.cells[i];
  let to;
  if (c === p.buses[s.bus]) { s.seated++; to = 'bus'; }
  else if (s.bench.length < p.bench) { s.bench.push(c); to = 'bench'; }
  else return null;
  s.cells[i] = EMPTY;
  let departed = 0;
  while (s.bus < p.buses.length && s.seated === CAP) {
    s.bus++; s.seated = 0; departed++;
    if (s.bus < p.buses.length) {
      const col = p.buses[s.bus];
      for (let j = 0; j < s.bench.length && s.seated < CAP;) {
        if (s.bench[j] === col) { s.bench.splice(j, 1); s.seated++; } else j++;
      }
    }
  }
  return { type: to, cell: i, color: c, departed };
}

export function status(p, s) {
  if (s.bus >= p.buses.length) return 'won';
  const acc = reachable(s.cells, p.w, p.h);
  const cur = p.buses[s.bus];
  const room = s.bench.length < p.bench;
  for (let i = 0; i < acc.length; i++) if (acc[i] && (room || s.cells[i] === cur)) return 'play';
  return 'lost';
}

export function lostText() { return 'Stuck: bench full'; }

export function describe(p, s) {
  if (s.bus >= p.buses.length) return `All ${p.buses.length} buses filled`;
  return `Bus ${Math.min(s.bus + 1, p.buses.length)} of ${p.buses.length}`;
}

function playout(p, rng, smart) {
  const s = init(p);
  for (;;) {
    const st = status(p, s);
    if (st !== 'play') return st === 'won';
    const acc = reachable(s.cells, p.w, p.h);
    const cur = p.buses[s.bus];
    const match = [], other = [];
    for (let i = 0; i < acc.length; i++) if (acc[i]) (s.cells[i] === cur ? match : other).push(i);
    const room = s.bench.length < p.bench;
    let pick;
    if (smart) {
      // A careful player: board when possible; otherwise dig toward riders the
      // current bus needs, benching riders for buses already in sight. Only
      // the buses you can see count; anything further out is a guess.
      const seen = p.buses.slice(s.bus + 1, s.bus + 1 + p.view);
      const value = (c) => (c === cur ? 3 : seen.includes(c) ? 1 : 0);
      const opens = (i) => {
        const c2 = s.cells.slice();
        c2[i] = EMPTY;
        const a2 = reachable(c2, p.w, p.h);
        let v = 0;
        for (let j = 0; j < a2.length; j++) if (a2[j] && !acc[j]) v += value(c2[j]);
        return v;
      };
      const pool = match.length ? match : other;
      const score = pool.map((i) => opens(i) + (match.length ? 0 : value(s.cells[i]) * 2) + rng() * 0.5);
      pick = pool[score.indexOf(Math.max(...score))];
    } else {
      pick = rng.pick(room ? match.concat(other) : match);
    }
    apply(p, s, pick);
  }
}

export function generate(tier, seed) {
  const t = TIERS[tier];
  const rng = makeRng(seed);
  let best = null, inBand = 0;
  const t0 = Date.now();
  for (let a = 0; a < 80 && inBand < 2; a++) {
    if (best && Date.now() - t0 > 2500) break;
    const cells = layout(t, rng);
    const order = walkOrder(cells, t.w, t.h, rng);
    if (order.length < 9) continue;
    const nBus = order.length / CAP;
    const buses = rng.shuffle([...Array(nBus).keys()].map((i) => i % t.colors));
    const color = colorize(order, buses, t, rng);
    const pc = Array.from(cells);
    order.forEach((i, k) => { pc[i] = color[k]; });
    const puzzle = { w: t.w, h: t.h, cells: pc, buses, bench: t.bench, view: t.view };
    // The planned order must actually win under the real rules.
    const s = init(puzzle);
    if (!order.every((i) => apply(puzzle, s, i)) || status(puzzle, s) !== 'won') continue;
    const RUNS = 20;
    let g = 0, r = 0;
    for (let k = 0; k < RUNS; k++) { if (playout(puzzle, rng, true)) g++; if (playout(puzzle, rng, false)) r++; }
    const greedy = g / RUNS, random = r / RUNS;
    const ok = greedy >= t.band[0] && greedy < t.band[1] && g > 0;
    if (ok) inBand++;
    const miss = greedy < t.band[0] ? t.band[0] - greedy : Math.max(0, greedy - t.band[1]);
    const fit = ok ? 100 + (1 - random) * 10 : g === 0 ? -1000 : -miss * 100; // never hand out one nobody wins
    if (!best || fit > best.fit) best = { fit, puzzle, greedy, random, order };
  }
  return {
    puzzle: best.puzzle,
    info: { riders: best.order.length, buses: best.puzzle.buses.length, greedyWin: best.greedy, randomWin: best.random, solution: best.order },
  };
}
