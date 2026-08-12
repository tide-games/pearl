// pearl.js — pure drop maths for The Pearl (v2: the Peg-E board).
//
// Fleet discipline: no DOM, no clock, no network, no crypto. The caller
// supplies hex seeds; everything here is a pure function of its arguments.
//
// THE BOARD (modelled on the prize-drop machines): a walled field 13
// positions wide, 12 rows deep. YOU CHOOSE the drop notch (five of them) —
// that choice is the strategy. Each row the pearl steps left (¼), straight
// (½), or right (¼): two seed bits per row, 24 bits total, drawn from the
// low bits of sha256(blockHash|mark). The walls bounce — and pay.
//
// THE FEATURES are the game (the slots are the floor):
//   · wall buzzers   — every wall clunk pays ×0.05 of stake
//   · two bumpers    — row 7, mirrored at positions 3 and 9: ×0.40 each
//   · the shell      — row 4, centre: ×0.15
//   · THE PEARL RUN  — shell struck, a bumper struck, landed dead centre,
//     all in one fall: ×10. Rare from every notch (≈1 in 2,600 at best).
//
// HONESTY: the slot table was SOLVED (exact linear algebra over the exact
// DP distributions) so that every drop notch faces the same ≈3% house
// edge — 2.91–2.97%, re-derived exactly by the DP mirror in tests. Your
// choice changes the ride's shape, never its fairness: edge notches
// clatter off the wall buzzers, mid notches farm the bumpers, the centre
// hunts the shell and the Run.

export const COLS = 13;
export const ROWS = 12;
export const DROPS = [2, 4, 6, 8, 10];       // the five notches
export const BITS_PER_ROW = 2;               // L ¼ · straight ½ · R ¼

export const BUMPERS = [{ row: 7, pos: 3 }, { row: 7, pos: 9 }];
export const SHELL = { row: 4, pos: 6 };
export const WALL_PAY = 0.05;
export const BUMPER_PAY = 0.40;
export const SHELL_PAY = 0.15;
export const RUN_PAY = 10;
export const RUN_SLOT = 6;

// The floor: solved so every notch faces the same edge. Order is protocol.
export const SLOT_PAY = [0.91, 0.9, 0.87, 0.8, 0.85, 0.9, 0.94, 0.9, 0.85, 0.8, 0.87, 0.9, 0.91];

// ---------------------------------------------------------------- the path

// 24 low bits of the seed, two per row: 00 left, 11 right, 01/10 straight.
export function stepsFromSeed(seedHex) {
  const clean = String(seedHex).replace(/[^0-9a-fA-F]/g, '');
  if (!clean.length) throw new Error('stepsFromSeed: empty hex');
  const v = BigInt('0x' + clean) % (1n << BigInt(ROWS * BITS_PER_ROW));
  const steps = [];
  for (let r = 0; r < ROWS; r++) {
    const two = Number((v >> BigInt(r * 2)) & 3n);
    steps.push(two === 0 ? -1 : two === 3 ? 1 : 0);
  }
  return steps;
}

// Walk one pearl from a notch: every event, in order, fully determined.
export function walk(drop, seedHex) {
  if (!DROPS.includes(drop)) throw new Error('walk: not a drop notch');
  const steps = stepsFromSeed(seedHex);
  let pos = drop;
  const track = [pos];
  const events = []; // {row, type:'wall'|'bumper'|'shell', pos}
  let walls = 0, bumpers = 0, shell = false;
  for (let r = 0; r < ROWS; r++) {
    let np = pos + steps[r];
    if (np < 0) { np = 0; walls++; events.push({ row: r + 1, type: 'wall', side: 'left' }); }
    else if (np > COLS - 1) { np = COLS - 1; walls++; events.push({ row: r + 1, type: 'wall', side: 'right' }); }
    pos = np;
    if (r + 1 === SHELL.row && pos === SHELL.pos && !shell) { shell = true; events.push({ row: r + 1, type: 'shell' }); }
    for (const b of BUMPERS) {
      if (r + 1 === b.row && pos === b.pos) { bumpers++; events.push({ row: r + 1, type: 'bumper', pos: b.pos }); }
    }
    track.push(pos);
  }
  const slot = pos;
  const run = shell && bumpers > 0 && slot === RUN_SLOT;
  return { drop, steps, track, slot, walls, bumpers, shell, run, events };
}

// ---------------------------------------------------------------- pricing

// Integer coins throughout; each part floors separately so the sum is
// reproducible without float order-of-operations questions.
export function settle({ drop, stake, seedHex }) {
  if (!Number.isInteger(stake) || stake <= 0) throw new Error('settle: stake must be a positive integer');
  const w = walk(drop, seedHex);
  const slotPay = Math.floor(stake * SLOT_PAY[w.slot]);
  const wallPay = w.walls * Math.floor(stake * WALL_PAY);
  const bumperPay = w.bumpers * Math.floor(stake * BUMPER_PAY);
  const shellPay = w.shell ? Math.floor(stake * SHELL_PAY) : 0;
  const runPay = w.run ? stake * RUN_PAY : 0;
  const payout = slotPay + wallPay + bumperPay + shellPay + runPay;
  return { ...w, slotPay, wallPay, bumperPay, shellPay, runPay, payout, delta: payout - stake };
}

export function verifyDrop(args) { return settle(args); }

// The best any single fall can pay from a notch — for the HUD's honesty.
export function maxPayout(stake) {
  // pearl run + both-bumpers is impossible in one fall pattern-wise for
  // bumpers (same row, mirrored) — one bumper max. Max: run + max walls
  // are also mutually exclusive in practice; report the dream: the Run.
  return stake * RUN_PAY + Math.floor(stake * SLOT_PAY[RUN_SLOT])
    + Math.floor(stake * BUMPER_PAY) + Math.floor(stake * SHELL_PAY);
}

// ---------------------------------------------------------------- exact maths
// The DP the tests trust: exact distribution over (pos, shellHit, bumperHit)
// with rational-free floats (exact within double precision — the tests also
// cross-check by mass sampling). Returns per-notch expectations.
export function exactStats(drop) {
  let prob = new Map([[`${drop}|0|0`, 1]]);
  let ewall = 0;
  for (let r = 0; r < ROWS; r++) {
    const next = new Map();
    for (const [key, p] of prob) {
      const [pos, hs, hb] = key.split('|').map(Number);
      for (const [step, sp] of [[-1, 0.25], [0, 0.5], [1, 0.25]]) {
        const q = p * sp;
        let np = pos + step;
        if (np < 0) { np = 0; ewall += q; }
        else if (np > COLS - 1) { np = COLS - 1; ewall += q; }
        let ns = hs, nb = hb;
        if (r + 1 === SHELL.row && np === SHELL.pos) ns = 1;
        for (const b of BUMPERS) if (r + 1 === b.row && np === b.pos) nb = 1;
        const k2 = `${np}|${ns}|${nb}`;
        next.set(k2, (next.get(k2) || 0) + q);
      }
    }
    prob = next;
  }
  const slots = Array(COLS).fill(0);
  let eshell = 0, ebump = 0, erun = 0;
  for (const [key, p] of prob) {
    const [pos, hs, hb] = key.split('|').map(Number);
    slots[pos] += p; eshell += hs * p; ebump += hb * p;
    if (hs && hb && pos === RUN_SLOT) erun += p;
  }
  return { slots, ewall, eshell, ebump, erun };
}

// Exact expected payout per unit staked from a notch. NOTE: ebump counts
// paths that hit ≥1 bumper; both bumpers in one fall is impossible (same
// row, mirrored sides), so it equals the expected bumper COUNT too.
export function evOf(drop) {
  const s = exactStats(drop);
  return s.slots.reduce((a, p, k) => a + p * SLOT_PAY[k], 0)
    + s.ewall * WALL_PAY + s.eshell * SHELL_PAY + s.ebump * BUMPER_PAY
    + s.erun * RUN_PAY;
}
