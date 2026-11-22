// Generates puzzles for every game and tier, checks each one is really
// solvable under the game's own rules, and prints timing and difficulty stats.
// Usage: node test/run.mjs [count-per-tier] [game]
import * as arrows from '../js/games/arrows.js';
import * as traffic from '../js/games/traffic.js';
import * as bus from '../js/games/bus.js';
import { TIERS } from '../js/rng.js';

const COUNT = +(process.argv[2] || 5);
const ONLY = process.argv[3];
let failures = 0;

function check(game, puzzle, info) {
  const s = game.init(puzzle);
  if (game === arrows) {
    // Keep tapping any arrow that can leave; must clear the board.
    for (let guard = 0; guard < 1000 && game.status(puzzle, s) === 'play'; guard++) {
      const id = puzzle.arrows.findIndex((a, i) => !s.gone[i] && !arrows.blocker(s.occ, puzzle.w, puzzle.h, a, i));
      if (id < 0) return 'deadlock';
      game.apply(puzzle, s, id);
    }
    return game.status(puzzle, s) === 'won' && s.lives === puzzle.lives ? null : 'not cleared';
  }
  for (const mv of info.solution) if (!game.apply(puzzle, s, mv)) return `illegal move ${JSON.stringify(mv)}`;
  if (game.status(puzzle, s) !== 'won') return 'solution does not win';
  if (game === traffic && info.solution.length !== puzzle.par) return 'par mismatch';
  if (game === traffic && puzzle.limit < puzzle.par + 4) return 'limit too tight';
  return null;
}

for (const game of [arrows, traffic, bus]) {
  if (ONLY && game.meta.id !== ONLY) continue;
  console.log(`\n== ${game.meta.name}`);
  for (const tier of TIERS) {
    const times = [], rows = [];
    for (let seed = 1; seed <= COUNT; seed++) {
      const t0 = performance.now();
      const { puzzle, info } = game.generate(tier, seed * 7919 + tier.length);
      times.push(performance.now() - t0);
      const err = check(game, puzzle, info);
      if (err) { failures++; console.log(`  FAIL ${tier} seed ${seed}: ${err}`); }
      const { solution, ...rest } = info;
      rows.push(rest);
    }
    const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
    const keys = Object.keys(rows[0]);
    console.log(`  ${tier.padEnd(7)} ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0).padStart(5)} ms avg, max ${Math.max(...times).toFixed(0)} | ` +
      keys.map((k) => `${k} ${avg(k)}`).join(', ') +
      ` | ${keys[0]}: ${rows.map((r) => r[keys[0]]).join(' ')}`);
  }
}
console.log(failures ? `\n${failures} FAILURES` : '\nall puzzles verified');
process.exit(failures ? 1 : 0);
