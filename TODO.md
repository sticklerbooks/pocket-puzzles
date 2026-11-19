# Pocket Puzzles — TODO

## Now (updated 2026-11-19)
First batch is built and verified: menu + Arrows, Bus Stop, Traffic Jam, four
tiers each, works offline as an installable web app. Runs locally on port 5191.
Next: pick hosting so it can go on Adam's phone, then his play test to tune
difficulty.

## Open
- [ ] [decide] Hosting: GitHub Pages (free) or a stickler4details.com subdomain. The phone loads it once, then it works offline.
- [ ] [Adam] Play test each game/tier; note "too easy / too hard" per tier so the bands can be moved.
- [ ] Second batch: pipe loops, color sort, Sudoku (technique-based rating), nonograms (symmetric shapes or bundled pixel art).
- [ ] Traffic expert takes ~2–6 s to generate on desktop (hidden by background prefetch after the first puzzle); consider a smaller bundled seed pool if it's slow on the phone.

## Done
- [x] App shell, PWA, worker generation, saved progress, undo/restart (2026-11-19)
- [x] Arrows, Bus Stop, Traffic Jam generators + solvability tests (2026-11-19)
