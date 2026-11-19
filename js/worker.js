// Puzzle generation runs here so the screen never freezes.
import * as arrows from './games/arrows.js';
import * as traffic from './games/traffic.js';
import * as bus from './games/bus.js';

const GAMES = { arrows, traffic, bus };

self.onmessage = (e) => {
  const { id, game, tier, seed } = e.data;
  try {
    const { puzzle, info } = GAMES[game].generate(tier, seed);
    delete info.solution;
    self.postMessage({ id, ok: true, puzzle, info });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack || err) });
  }
};
