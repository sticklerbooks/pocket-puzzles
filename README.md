# Pocket Puzzles

Endless generated puzzles for Adam's phone. No ads, no upgrades, no accounts,
no server: a static web app (PWA) that installs to the home screen and works
offline. Every puzzle is generated on the phone and proven solvable before you
see it.

## Games

| Game | How it's generated | How difficulty is measured |
|---|---|---|
| **Arrows** | Arrows added one at a time, each kept only if the board can still be cleared | Rounds of removal needed ("depth"), and how few arrows are free each round |
| **Bus Stop** | Pick a walking-out order, then color riders so that order wins; all buses visible | How often a sensible greedy player (board if you can, else bench whoever's needed soonest) wins: easy ≥75%, expert ≤12% |
| **Traffic Jam** | Random 6×6 lots, hill-climbed toward harder layouts; every reachable arrangement explored | Exact fewest-moves count (par), from a full search |

Interest filters: Arrows prefers full boards with few free arrows; Traffic
prefers puzzles where nearly every car has to move; Bus prefers puzzles a random
player loses even within the target greedy band.

## Run

```
npm test                 # generate & verify puzzles for every game/tier (node test/run.mjs [count] [game])
python -m http.server 5191   # then open http://localhost:5191
npm run icons            # redraw icons/ (no dependencies)
```

## Layout

- `js/games/<game>.js`: rules, generator, scorer (pure, runs in Node and the worker)
- `js/games/<game>-view.js`: the screen for that game
- `js/app.js`: menu, play screen, undo/restart, saves progress in localStorage
- `js/worker.js`: generation off the main thread; the next puzzle is built in the background while you play
- `sw.js`: offline cache (network first, cache when offline)

Adding a game = one logic module (`meta, generate, init, apply, status, describe`)
+ one view (`createView(root, puzzle, onMove) → { update(state, event), reject? }`),
registered in `app.js`, `worker.js`, `sw.js`.
