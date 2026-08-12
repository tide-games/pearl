# The Pearl 🫧

**Play: https://tide-games.github.io/pearl/** — the tide drops the pearl.

A pearl falls through twelve rows of coral pins into one of thirteen oysters.
Twelve bounces are twelve bits of `sha256(blockHash | mark)` — **the seed is
the trajectory**: every bounce, every bonus shell struck, the landing slot.
The fall you watch replays those bits exactly; the theatre *is* the proof.

- **Three rides, one edge**: calm (rim ×11), swell (×34.5), storm (×163) —
  tuned to the same ≈3% house edge, pinned in tests by enumerating all
  4,096 paths exactly. The player shapes the ride, never the odds.
- **Bonus shells**: three golden pegs on the center line pay +10% of stake
  when the path crosses them — fully determined by the same bits, priced
  into the tables. Charm without one unprovable bit.
- **Two modes**: practice (local seed, instant) and The Tide — the next
  testnet4 block seeds the drop, settled at one confirmation (testnet4
  reorgs are real; we learned live).

Pure maths in [`pearl.js`](pearl.js) — no DOM, no clock, no network — with
[`tests.js`](tests.js) exhaustively enumerating every path. A
[tide-games](https://tide-games.github.io/) boat, built in the fleet
playbook: one owner, three critics, loop to plateau.

Sealed stakes (the Tidegate courier, `bet.venue: 'pearl'`) are the planned
next voyage, following the pattern the regatta proved.
