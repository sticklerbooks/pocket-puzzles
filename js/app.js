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
store.streak ||= {};
const streakOf = (game, tier) => ((store.streak[game] ||= {})[tier] ||= { cur: 0, best: 0 });
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
      if (saved && saved.v !== 2) delete store.saved[id];
      if (saved && saved.tier === tier && saved.v === 2) b.classList.add('resume');
      htmlEl('span', '', b).textContent = TIER_LABEL[tier];
      const solved = (store.solved[id] || {})[tier] || 0;
      const st = streakOf(id, tier);
      htmlEl('small', '', b).textContent = saved && saved.tier === tier && saved.v === 2 ? 'resume'
        : st.cur ? `streak ${st.cur}` : st.best ? `best ${st.best}` : solved ? `${solved} solved` : ' ';
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
  if (saved && saved.tier === tier && saved.v === 2) start(saved);
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
  start({ v: 2, game, tier, seed: r.seed, puzzle: r.puzzle, moves: [] });
}

function start(rec) {
  store.saved[rec.game] = rec;
  save();
  const { logic, view } = byId[rec.game];
  cur = { rec, logic, state: null, view: null };
  $('#level').textContent = `${TIER_LABEL[rec.tier]} · #${rec.seed}`;
  showStreak(rec);
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

function showStreak(rec) {
  const s = streakOf(rec.game, rec.tier);
  $('#streak').textContent = s.cur ? `Streak ${s.cur}` : s.best ? `Best ${s.best}` : '';
}

// Ending a level early (or failing it) breaks the streak.
function breakStreak(rec) {
  const s = streakOf(rec.game, rec.tier);
  const was = s.cur;
  s.cur = 0;
  save();
  showStreak(rec);
  return was;
}

function showOverlay(title, detail, primary, onPrimary, showNew) {
  $('#ov-title').textContent = title;
  $('#ov-detail').textContent = detail;
  $('#ov-primary').textContent = primary;
  $('#ov-primary').onclick = onPrimary;
  $('#ov-new').hidden = !showNew;
  overlay.hidden = false;
}

function refresh() {
  const { rec, logic, state } = cur;
  const st = logic.status(rec.puzzle, state);
  statusEl.textContent = logic.describe(rec.puzzle, state);
  statusEl.classList.toggle('lost', st === 'lost');
  $('#restart').disabled = !rec.moves.length || st !== 'play';
  if (st === 'won') {
    const solved = (store.solved[rec.game] ||= {});
    solved[rec.tier] = (solved[rec.tier] || 0) + 1;
    const s = streakOf(rec.game, rec.tier);
    s.cur++;
    s.best = Math.max(s.best, s.cur);
    delete store.saved[rec.game];
    save();
    showStreak(rec);
    const best = s.cur === s.best ? (s.cur > 1 ? ' (best yet)' : '') : ` · best ${s.best}`;
    const detail = `${logic.describe(rec.puzzle, state)}\nStreak ${s.cur}${best}`;
    setTimeout(() => { if (cur && cur.rec === rec) showOverlay('Solved', detail, 'Next puzzle', nextPuzzle, false); }, 450);
  } else if (st === 'lost') {
    let detail = 'Same puzzle, from the start.';
    if (!rec.failed) {
      rec.failed = true;
      const was = breakStreak(rec);
      if (was) detail = `Streak ended at ${was}.`;
    }
    setTimeout(() => { if (cur && cur.rec === rec) showOverlay(logic.lostText(rec.puzzle, state), detail, 'Try again', tryAgain, true); }, 500);
  }
}

function resetLevel() {
  cur.rec.moves.length = 0;
  cur.rec.failed = false;
  save();
  cur.state = replay();
  cur.view.update(cur.state, null);
  overlay.hidden = true;
  refresh();
}

function tryAgain() { if (cur) resetLevel(); }
function nextPuzzle() { if (cur) newPuzzle(cur.rec.game, cur.rec.tier); }

function confirmBreak(what) {
  const s = streakOf(cur.rec.game, cur.rec.tier);
  return !s.cur || confirm(`${what} ends your streak of ${s.cur}. Go ahead?`);
}

$('#back').onclick = () => history.back();
window.addEventListener('popstate', showMenu);
$('#restart').onclick = () => {
  if (!cur || !cur.rec.moves.length || cur.logic.status(cur.rec.puzzle, cur.state) !== 'play') return;
  if (!confirmBreak('Starting over')) return;
  breakStreak(cur.rec);
  resetLevel();
};
$('#new').onclick = () => {
  if (!cur) return;
  const st = cur.logic.status(cur.rec.puzzle, cur.state);
  if (st === 'play' && !confirmBreak('Skipping this puzzle')) return;
  if (st === 'play') breakStreak(cur.rec);
  nextPuzzle();
};
$('#ov-new').onclick = nextPuzzle;
$('#to-menu').onclick = () => history.back();

showMenu();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
