import { TIERS, TIER_LABEL } from './rng.js';
import { htmlEl } from './svg.js';
import * as arrows from './games/arrows.js';
import * as bus from './games/bus.js';
import * as traffic from './games/traffic.js';
import { createView as arrowsView } from './games/arrows-view.js';
import { createView as busView } from './games/bus-view.js';
import { createView as trafficView } from './games/traffic-view.js';

const GAMES = [
  { logic: arrows, view: arrowsView },
  { logic: bus, view: busView },
  { logic: traffic, view: trafficView },
];
const byId = Object.fromEntries(GAMES.map((g) => [g.logic.meta.id, g]));

// ---- Saved data: chosen tier, puzzle in progress, solved counts. Phone only.
const KEY = 'pocket-puzzles:v1';
let store;
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { store = {}; }
store.saved ||= {};
store.solved ||= {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ } };

// ---- Generation: one worker for the puzzle you're waiting on, one for the next.
function makeWorker() {
  let w = null;
  try { w = new Worker('js/worker.js', { type: 'module' }); } catch { return null; }
  const pending = new Map();
  let n = 0;
  const api = {
    run(game, tier, seed) {
      if (!w) return Promise.resolve().then(() => byId[game].logic.generate(tier, seed));
      return new Promise((resolve, reject) => {
        const id = ++n;
        pending.set(id, { resolve, reject, game, tier, seed });
        w.postMessage({ id, game, tier, seed });
      });
    },
  };
  w.onmessage = (e) => {
    const job = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.ok) job.resolve(e.data); else job.reject(new Error(e.data.error));
  };
  w.onerror = () => {
    // Module workers unsupported: generate on the main thread instead.
    w = null;
    for (const job of pending.values()) api.run(job.game, job.tier, job.seed).then(job.resolve, job.reject);
    pending.clear();
  };
  return api;
}
const mainThread = { run: (game, tier, seed) => Promise.resolve().then(() => byId[game].logic.generate(tier, seed)) };
const fg = makeWorker() || mainThread;
const bg = makeWorker() || mainThread;

const newSeed = () => 1 + Math.floor(Math.random() * 999999);
const ready = new Map(); // "game:tier" -> { seed, promise } built in the background

function prefetch(game, tier) {
  const k = `${game}:${tier}`;
  if (ready.has(k)) return;
  const seed = newSeed();
  const promise = bg.run(game, tier, seed);
  promise.catch(() => ready.delete(k));
  ready.set(k, { seed, promise });
}

async function freshPuzzle(game, tier) {
  const k = `${game}:${tier}`;
  let job = ready.get(k);
  ready.delete(k);
  if (!job) { const seed = newSeed(); job = { seed, promise: fg.run(game, tier, seed) }; }
  const r = await job.promise;
  return { seed: job.seed, puzzle: r.puzzle };
}

// ---- Screens
const $ = (s) => document.querySelector(s);
const menu = $('#menu'), play = $('#play'), board = $('#board'), statusEl = $('#status'), overlay = $('#overlay');

function renderMenu() {
  const list = $('#game-list');
  list.innerHTML = '';
  for (const { logic } of GAMES) {
    const { id, name, blurb } = logic.meta;
    const card = htmlEl('section', 'card', list);
    htmlEl('h2', '', card).textContent = name;
    htmlEl('p', '', card).textContent = blurb;
    const row = htmlEl('div', 'tiers', card);
    for (const tier of TIERS) {
      const b = htmlEl('button', 'tier', row);
      const saved = store.saved[id];
      if (saved && saved.tier === tier) b.classList.add('resume');
      htmlEl('span', '', b).textContent = TIER_LABEL[tier];
      const solved = (store.solved[id] || {})[tier] || 0;
      htmlEl('small', '', b).textContent = saved && saved.tier === tier ? 'resume' : solved ? `${solved} solved` : ' ';
      b.onclick = () => openGame(id, tier);
    }
  }
}

let cur = null;
let loadToken = 0;

function showMenu() {
  cur = null;
  loadToken++;
  play.hidden = true;
  overlay.hidden = true;
  menu.hidden = false;
  renderMenu();
}

function openGame(game, tier) {
  history.pushState({ play: true }, '');
  menu.hidden = true;
  play.hidden = false;
  $('#title').textContent = byId[game].logic.meta.name;
  const saved = store.saved[game];
  if (saved && saved.tier === tier) start(saved);
  else newPuzzle(game, tier);
}

async function newPuzzle(game, tier) {
  const token = ++loadToken;
  cur = null;
  overlay.hidden = true;
  board.innerHTML = '<div class="building">Building a puzzle…</div>';
  statusEl.textContent = '';
  $('#level').textContent = TIER_LABEL[tier];
  let r;
  try { r = await freshPuzzle(game, tier); } catch (err) {
    board.innerHTML = `<div class="building">Something went wrong building that one.<br><small>${String(err.message).slice(0, 200)}</small></div>`;
    return;
  }
  if (token !== loadToken) return;
  start({ game, tier, seed: r.seed, puzzle: r.puzzle, moves: [] });
}

function start(rec) {
  store.saved[rec.game] = rec;
  save();
  const { logic, view } = byId[rec.game];
  cur = { rec, logic, state: null, view: null };
  $('#level').textContent = `${TIER_LABEL[rec.tier]} · #${rec.seed}`;
  board.innerHTML = '';
  overlay.hidden = true;
  cur.state = replay();
  cur.view = view(board, rec.puzzle, onMove);
  cur.view.update(cur.state, null);
  refresh();
  prefetch(rec.game, rec.tier);
}

function replay() {
  const { rec, logic } = cur;
  const s = logic.init(rec.puzzle);
  for (const m of rec.moves) logic.apply(rec.puzzle, s, m);
  return s;
}

function onMove(m) {
  if (!cur || cur.logic.status(cur.rec.puzzle, cur.state) === 'won') return;
  const ev = cur.logic.apply(cur.rec.puzzle, cur.state, m);
  if (!ev) { if (cur.view.reject) cur.view.reject(m); return; }
  cur.rec.moves.push(m);
  save();
  cur.view.update(cur.state, ev);
  refresh();
}

function refresh() {
  const { rec, logic, state } = cur;
  const st = logic.status(rec.puzzle, state);
  statusEl.textContent = logic.describe(rec.puzzle, state);
  statusEl.classList.toggle('stuck', st === 'stuck');
  if (st === 'stuck') statusEl.textContent += ' · Stuck. Undo a move or restart.';
  $('#undo').disabled = $('#restart').disabled = !rec.moves.length;
  if (st === 'won') {
    const solved = (store.solved[rec.game] ||= {});
    solved[rec.tier] = (solved[rec.tier] || 0) + 1;
    delete store.saved[rec.game];
    save();
    $('#won-detail').textContent = logic.describe(rec.puzzle, state);
    setTimeout(() => { if (cur && cur.rec === rec) overlay.hidden = false; }, 450);
  }
}

$('#back').onclick = () => history.back();
window.addEventListener('popstate', showMenu);
$('#undo').onclick = () => {
  if (!cur || !cur.rec.moves.length || cur.logic.status(cur.rec.puzzle, cur.state) === 'won') return;
  cur.rec.moves.pop();
  save();
  cur.state = replay();
  cur.view.update(cur.state, null);
  refresh();
};
$('#restart').onclick = () => {
  if (!cur || !cur.rec.moves.length || cur.logic.status(cur.rec.puzzle, cur.state) === 'won') return;
  cur.rec.moves.length = 0;
  save();
  cur.state = replay();
  cur.view.update(cur.state, null);
  refresh();
};
$('#new').onclick = () => {
  if (!cur) return;
  const { game, tier, moves } = cur.rec;
  if (moves.length && !confirm('Start a new puzzle? This one will be lost.')) return;
  newPuzzle(game, tier);
};
$('#next').onclick = () => { if (cur) newPuzzle(cur.rec.game, cur.rec.tier); };
$('#to-menu').onclick = () => history.back();

showMenu();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
