# Pocket Puzzles — TODO

## Now (updated 2026-11-19)
First batch is built and verified: menu + Arrows, Bus Stop, Traffic Jam, four
tiers each, works offline as an installable web app. Live at
https://sticklerbooks.github.io/pocket-puzzles/ (GitHub Pages, public repo
sticklerbooks/pocket-puzzles; `git push` deploys). Next: Adam's play test to tune difficulty.

## Open
- [ ] [Adam] Play test each game/tier; note "too easy / too hard" per tier so the bands can be moved.
- [ ] Second batch: pipe loops, color sort, Sudoku (technique-based rating), nonograms (symmetric shapes or bundled pixel art).
- [ ] Traffic expert takes ~2–6 s to generate on desktop (hidden by background prefetch after the first puzzle); consider a smaller bundled seed pool if it's slow on the phone.

## Done
- [x] Hosted on GitHub Pages (2026-11-19)
- [x] App shell, PWA, worker generation, saved progress, undo/restart (2026-11-19)
- [x] Arrows, Bus Stop, Traffic Jam generators + solvability tests (2026-11-19)
