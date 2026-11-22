# Pocket Puzzles — TODO

## Now (updated 2026-11-19)
Round 2 (2026-11-22, after Adam's first play test: "too easy, needs stakes"):
no undo, game over + streaks; Arrows up to ~200 winding arrows with pinch-zoom;
Bus Stop up to 8 colors with only 1–3 buses visible; Traffic Jam 6×6→8×8 with
bollards and move limits. Live at https://sticklerbooks.github.io/pocket-puzzles/
(`git push` deploys). Next: Adam's second play test.

## Open
- [ ] [Adam] Play test each game/tier; note "too easy / too hard" per tier so the bands can be moved.
- [ ] Second batch: pipe loops, color sort, Sudoku (technique-based rating), nonograms (symmetric shapes or bundled pixel art).
- [ ] Traffic Expert bank has 27 layouts (Hard 60); grow it with tools/build-traffic-bank.mjs if Expert starts to feel repetitive.
- [ ] Bus Stop with 8 colors: consider a small shape on each rider if colors get hard to tell apart.

## Done
- [x] Round 2: stakes (game over, streaks, no undo), bigger/harder boards in all three games (2026-11-22)
- [x] Hosted on GitHub Pages (2026-11-19)
- [x] App shell, PWA, worker generation, saved progress, undo/restart (2026-11-19)
- [x] Arrows, Bus Stop, Traffic Jam generators + solvability tests (2026-11-19)
