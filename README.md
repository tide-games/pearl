# The Pearl 🫧

**Play: https://tide-games.github.io/pearl/** — the tide drops the pearl.

Choose one of **five drop notches** — that choice is the strategy — and the
pearl falls through a walled field of pins, twelve rows deep. Twenty-four
seed bits of `sha256(blockHash | mark)` write every step (left ¼, straight
½, right ¼): **the seed is the trajectory**, and the fall you watch replays
it exactly; the theatre *is* the proof.

- **The features are the game** (modelled on the classic prize-drop
  machines): wall buzzers pay ×0.05 a clunk, the twin bumpers ×0.4, the
  golden shell ×0.15 — and shell → bumper → dead centre in one fall is
  **the Pearl Run, ×10** (≈1 in 2,700 from the middle notch).
- **Every notch faces the same ≈3% edge** — the slot table was solved by
  exact linear algebra over the exact DP distributions (2.91–2.97%,
  re-derived in tests). Your choice shapes the ride, never the fairness:
  edge notches clatter the buzzers, mid notches farm the bumpers, the
  centre hunts the shell and the Run.
- **Two modes**: practice (local seed, instant) and The Tide — the next
  testnet4 block seeds the drop, settled at one confirmation (testnet4
  reorgs are real; we learned live).

Pure maths in [`pearl.js`](pearl.js) — no DOM, no clock, no network — with
[`tests.js`](tests.js) pinning every notch's edge by exact DP plus 100k
sampled drops. A
[tide-games](https://tide-games.github.io/) boat, built in the fleet
playbook: one owner, five harsh critic runs, plateau at 82/100.

Sealed stakes (the Tidegate courier, `bet.venue: 'pearl'`) are the planned
next voyage, following the pattern the regatta proved.
