# Pocket Puzzles

Endless generated puzzles for Adam's phone. No ads, no upgrades, no accounts,
no server: a static web app (PWA) that installs to the home screen and works
offline. Every puzzle is generated on the phone and proven solvable before you
see it.

## Games

| Game | How it's generated | How difficulty is measured |
|---|---|---|
| **Arrows** | Winding arrows (up to ~200 on Expert) added one at a time; kept only if the "who waits on whom" graph has no loop, i.e. the board can still be cleared | Board size, rounds of removal needed ("depth"), how few arrows are free each round. Bumps cost hearts |
| **Bus Stop** | Pick a walking-out order, then color riders so that order wins. Up to 8 colors; only the next 1–3 buses are shown | Win rate of a careful player who sees only what you see: easy ≥60%, expert 4–20% (never 0) |
| **Traffic Jam** | 6×6 to 8×8 lots with bollards. Easy/Medium: random lots hill-climbed on the phone. Hard/Expert: a bank of good layouts found offline (`js/games/traffic-bank.js`), flipped and reshaped on the phone, keeping only changes whose exact par stays in range | Exact fewest-moves count (par) from a full search; move limit = par + slack |

Stakes: no undo. Losing (out of hearts / stuck / out of moves) is game over and
the level restarts; each game+tier keeps a streak, broken by a loss, Start over,
or Skip.

Interest filters: Arrows prefers full boards with few free arrows; Traffic
prefers puzzles where nearly every car has to move; Bus prefers puzzles a random
player loses even within the target greedy band.

## Run

```
npm test                 # generate & verify puzzles for every game/tier (node test/run.mjs [count] [game])
python -m http.server 5191   # then open http://localhost:5191
npm run icons            # redraw icons/ (no dependencies)
node tools/build-traffic-bank.mjs <hard|expert> <count> <worker>   # search offline (run several), then:
node tools/build-traffic-bank.mjs merge
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
