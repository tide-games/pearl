// tests.js — run: node tests.js  (exits non-zero on failure)
import { createHash } from 'node:crypto';
import {
  COLS, ROWS, DROPS, BUMPERS, SHELL, WALL_PAY, BUMPER_PAY, SHELL_PAY,
  RUN_PAY, RUN_SLOT, SLOT_PAY,
  stepsFromSeed, walk, settle, verifyDrop, maxPayout, exactStats, evOf,
} from './pearl.js';

let fails = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok ', name);
  else { fails++; console.error('  FAIL', name, detail ?? ''); }
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- the step convention
{
  const s = stepsFromSeed('0'.repeat(64));
  ok(s.length === ROWS && s.every((x) => x === -1), 'seed 0: every pair 00 → all left');
  const r = stepsFromSeed('ffffff'); // 24 set bits
  ok(r.every((x) => x === 1), 'all-ones: every pair 11 → all right');
  const m = stepsFromSeed('5'); // 0b0101 → rows 0,1 straight
  ok(m[0] === 0 && m[1] === 0, '01/10 pairs go straight');
  ok(JSON.stringify(stepsFromSeed(sha256('x'))) === JSON.stringify(stepsFromSeed(sha256('x'))),
    'the same seed steps the same steps');
}

// ---- the walk
{
  const w = walk(2, '0'.repeat(64)); // all-left from notch 2: hits wall, hugs it
  ok(w.slot === 0 && w.walls === 10, 'all-left from notch 2 hugs the left wall (10 clunks)',
    JSON.stringify({ slot: w.slot, walls: w.walls }));
  const c = walk(6, '5'.repeat(6)); // straights → drops dead centre
  ok(c.track.every((p) => p === 6) && c.slot === 6, 'all-straight from centre never leaves the line');
  ok(c.shell === true, 'and strikes the shell on the way');
  let threw = false;
  try { walk(3, 'ff'); } catch { threw = true; }
  ok(threw, 'only the five notches may drop');
}

// ---- exact economics: the DP mirror pins every notch's edge
{
  for (const d of DROPS) {
    const edge = 1 - evOf(d);
    ok(edge > 0.025 && edge < 0.035,
      `HOUSE RULE: notch ${d} edge ≈3% (${(edge * 100).toFixed(2)}%)`);
  }
  // mirrored notches face mirrored boards — identical edges
  ok(Math.abs(evOf(2) - evOf(10)) < 1e-12 && Math.abs(evOf(4) - evOf(8)) < 1e-12,
    'the board is honest under reflection');
  // DP mass conserves
  for (const d of DROPS) {
    const s = exactStats(d);
    ok(Math.abs(s.slots.reduce((a, b) => a + b, 0) - 1) < 1e-12, `notch ${d}: probability mass conserves`);
  }
}

// ---- sampling agrees with the DP (100k drops from the centre notch)
{
  const N = 100_000;
  const s = exactStats(6);
  let hitsShell = 0, slots6 = 0, walls = 0;
  for (let i = 0; i < N; i++) {
    const w = walk(6, sha256('mc' + i));
    if (w.shell) hitsShell++;
    if (w.slot === 6) slots6++;
    walls += w.walls;
  }
  const tol = (p) => 4 * Math.sqrt(p * (1 - p) / N);
  ok(Math.abs(hitsShell / N - s.eshell) < tol(s.eshell), '100k drops: shell rate matches the DP (4σ)');
  ok(Math.abs(slots6 / N - s.slots[6]) < tol(s.slots[6]), '100k drops: centre landings match the DP (4σ)');
  ok(Math.abs(walls / N - s.ewall) < 0.01, '100k drops: wall clunks match the DP');
}

// ---- settling
{
  const s = settle({ drop: 6, stake: 100, seedHex: sha256('d1') });
  ok(Number.isInteger(s.payout)
    && s.payout === s.slotPay + s.wallPay + s.bumperPay + s.shellPay + s.runPay,
    'payout is whole coins, the sum of its parts');
  const v = verifyDrop({ drop: 6, stake: 100, seedHex: sha256('d1') });
  ok(JSON.stringify(v) === JSON.stringify(s), 'verifyDrop replays the identical fall');
  // the pearl run pays the dream: shell + bumper + centre landing
  const run = settle({ drop: 6, stake: 100, seedHex: sha256('d1') });
  ok(maxPayout(100) === 100 * RUN_PAY + Math.floor(100 * SLOT_PAY[RUN_SLOT])
    + Math.floor(100 * BUMPER_PAY) + Math.floor(100 * SHELL_PAY),
    'maxPayout names the full dream');
  let threw = false;
  try { settle({ drop: 6, stake: 0, seedHex: 'ff' }); } catch { threw = true; }
  ok(threw, 'a zero stake refuses to settle');
}

// ---- the pearl run exists and is rare (exact, from the DP)
{
  const best = Math.max(...DROPS.map((d) => exactStats(d).erun));
  ok(best > 0, 'the pearl run is possible');
  ok(best < 0.001, `and rare — best notch ≈1 in ${Math.round(1 / best).toLocaleString()}`);
  // hand-build a run: straight to shell, drift to bumper, return to centre
  // steps: rows1-4 straight (shell at (4,6)); rows5-7: -1,-1,-1 → pos 3 at row7 (bumper);
  // rows8-12: +1,+1,+1,0,0 → pos 6. Encode pairs: -1=00, 0=01, +1=11.
  const pairs = [1, 1, 1, 1, 0, 0, 0, 3, 3, 3, 1, 1];
  let v = 0n;
  pairs.forEach((p, i) => { v |= BigInt(p) << BigInt(2 * i); });
  const w = walk(6, v.toString(16));
  ok(w.run === true, 'a hand-built shell→bumper→centre fall IS a pearl run',
    JSON.stringify({ slot: w.slot, shell: w.shell, bumpers: w.bumpers }));
  const paid = settle({ drop: 6, stake: 100, seedHex: v.toString(16) });
  ok(paid.runPay === 1000, 'and it pays ×10 on the nose');
}

// ---- table sanity
{
  ok(SLOT_PAY.length === COLS, 'a payout for every oyster');
  ok(SLOT_PAY.every((v, i) => v === SLOT_PAY[COLS - 1 - i]), 'the floor is symmetric');
  ok(SLOT_PAY.every((v) => v > 0 && v < 1.5), 'the floor is the floor — features are the game');
}

if (fails) { console.error(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nall tests pass');
