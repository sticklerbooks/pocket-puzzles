// Searches for hard Traffic Jam layouts with a long time budget and writes
// them to tmp/bank-<tier>-<worker>.json. Run several in parallel, then merge
// with: node tools/build-traffic-bank.mjs merge
// Usage: node tools/build-traffic-bank.mjs <tier> <count> <worker>
import { writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { generate } from '../js/games/traffic.js';

const [, , tier, count, worker] = process.argv;
mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true });

if (tier === 'merge') {
  const out = {};
  const dir = new URL('../tmp/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.startsWith('bank-'))) {
    const t = f.split('-')[1];
    (out[t] ||= []).push(...JSON.parse(readFileSync(new URL(f, dir))));
  }
  for (const t in out) {
    const seen = new Set();
    out[t] = out[t].filter((b) => { const k = JSON.stringify(b); if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(t, out[t].length, 'pars', out[t].map((b) => b.par).sort((a, b) => a - b).join(' '));
  }
  const body = Object.entries(out).map(([t, list]) => `  ${t}: [\n${list.map((b) => '    ' + JSON.stringify(b)).join(',\n')},\n  ],`).join('\n');
  writeFileSync(new URL('../js/games/traffic-bank.js', import.meta.url),
    `// Built by tools/build-traffic-bank.mjs: good starting layouts for the hard tiers.\n// Each entry: { n, cars: [[len, h, fix]], walls, start, par }.\nexport const BANK = {\n${body}\n};\n`);
} else {
  const band = { hard: 20, expert: 32 }[tier];
  const found = [];
  const file = new URL(`../tmp/bank-${tier}-${worker}.json`, import.meta.url);
  for (let s = 1; found.length < +count; s++) {
    const { puzzle: p } = generate(tier, +worker * 100000 + s, { fresh: true, ms: 30000, attempts: 6000 });
    if (p.par < band) continue;
    found.push({ n: p.n, cars: p.cars.map((c) => [c.len, c.h ? 1 : 0, c.fix]), walls: p.walls, start: p.start, par: p.par });
    writeFileSync(file, JSON.stringify(found));
    console.log(tier, worker, found.length, 'par', p.par);
  }
}
