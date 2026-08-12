// pearl.js — pure drop maths for The Pearl.
//
// Fleet discipline: no DOM, no clock, no network, no crypto. The caller
// supplies hex seeds; everything here is a pure function of its arguments.
//
// THE DROP: a pearl falls through ROWS rows of pins, bouncing left or right
// at each. That is ROWS coin flips — so the seed IS the trajectory: the low
// ROWS bits of the seed hash decide every bounce (bit i = row i, 0 left,
// 1 right), the landing slot is simply how many rights were flipped, and
// slot probabilities are binomial coefficients. Nothing else is random.
// The animation a player watches replays these exact bits — the theatre IS
// the proof (the regatta's raceTrace principle, distilled).
//
// BONUS PEGS: fixed pins that pay a small bonus when the path crosses them
// — the pearl is at position p after r rows iff the first r bits hold p
// ones. Fully determined by the same bits; their expected value is priced
// into the tables. Charm without a single unprovable bit.
//
// TABLES: three payout shapes — calm, swell, storm — tuned to the SAME
// house edge (≈3%, pinned exactly in tests by exhaustive enumeration over
// all 4096 paths). The player picks the ride, never the odds.

export const ROWS = 12;
export const SLOTS = ROWS + 1;
export const PATHS = 1 << ROWS; // 4096 — small enough to enumerate exactly

// { row, pos }: struck when the pearl sits at `pos` after `row` bounces.
export const BONUS_PEGS = [
  { row: 4, pos: 2 },
  { row: 6, pos: 3 },
  { row: 8, pos: 4 },
];
export const BONUS_PAY = 0.10; // × stake, per struck bonus peg

// Symmetric multipliers, slot 0..12. Order is protocol — append-only.
export const TABLES = {
  calm:  [11, 4.5, 2.2, 1.3, 0.95, 0.72, 0.55, 0.72, 0.95, 1.3, 2.2, 4.5, 11],
  swell: [34.5, 9.85, 3.95, 1.77, 0.89, 0.49, 0.34, 0.49, 0.89, 1.77, 3.95, 9.85, 34.5],
  storm: [163, 27, 6.5, 1.74, 0.54, 0.22, 0.11, 0.22, 0.54, 1.74, 6.5, 27, 163],
};
export const TABLE_KEYS = Object.keys(TABLES);

// ---------------------------------------------------------------- the path

// The ROWS bounce bits from a hex seed: bit i decides row i. Taking the low
// bits of the full-hash BigInt keeps the whole convention checkable with a
// pocket calculator and mirrors the fleet's roll convention (BigInt mod —
// here mod 2^ROWS).
export function pathFromSeed(seedHex) {
  const clean = String(seedHex).replace(/[^0-9a-fA-F]/g, '');
  if (!clean.length) throw new Error('pathFromSeed: empty hex');
  const v = BigInt('0x' + clean) % BigInt(PATHS);
  const bits = [];
  for (let i = 0; i < ROWS; i++) bits.push(Number((v >> BigInt(i)) & 1n));
  return bits;
}

export const slotOf = (path) => path.reduce((a, b) => a + b, 0);

// Positions after each row (prefix sums) — the pearl's actual track.
export function trackOf(path) {
  const t = [0];
  for (const b of path) t.push(t[t.length - 1] + b);
  return t; // length ROWS+1; t[r] = position after r rows
}

// Which bonus pegs this path strikes, in board order.
export function bonusHits(path) {
  const t = trackOf(path);
  return BONUS_PEGS.filter((p) => t[p.row] === p.pos);
}

// ---------------------------------------------------------------- pricing

export function quote(tableKey, stake) {
  const m = TABLES[tableKey];
  if (!m) throw new Error('quote: no such table');
  if (!Number.isInteger(stake) || stake <= 0) throw new Error('quote: stake must be a positive integer');
  return {
    table: tableKey,
    multipliers: m.slice(),
    maxPayout: Math.floor(stake * m[0]) + BONUS_PEGS.length * Math.floor(stake * BONUS_PAY),
    bonusEach: Math.floor(stake * BONUS_PAY),
  };
}

// Settle one drop. Integer coins: slot pay and each bonus floor separately,
// so the sum is reproducible without float order-of-operations questions.
export function settle({ table, stake, seedHex }) {
  const q = quote(table, stake); // validates table + stake
  const path = pathFromSeed(seedHex);
  const slot = slotOf(path);
  const hits = bonusHits(path);
  const slotPay = Math.floor(stake * TABLES[table][slot]);
  const bonusPay = hits.length * Math.floor(stake * BONUS_PAY);
  const payout = slotPay + bonusPay;
  return {
    path, slot, hits: hits.map((p) => `${p.row}:${p.pos}`),
    multiplier: TABLES[table][slot],
    slotPay, bonusPay, payout, delta: payout - stake,
    maxPayout: q.maxPayout,
  };
}

// The offline verifier: same inputs, same drop, anywhere.
export function verifyDrop({ seedHex, table, stake }) {
  return settle({ table, stake, seedHex });
}

// Exact expected payout of one unit staked on a table — closed-form over
// all 4096 paths (tests enumerate rather than trust this, then compare).
export function evOf(tableKey) {
  const m = TABLES[tableKey];
  if (!m) throw new Error('evOf: no such table');
  const C = [1];
  for (let n = 1; n <= ROWS; n++) C.push((C[n - 1] * (ROWS - n + 1)) / n);
  const slots = m.reduce((s, mult, k) => s + (C[k] / PATHS) * mult, 0);
  const bonus = BONUS_PEGS.reduce((s, p) => {
    let c = 1;
    for (let n = 1; n <= p.pos; n++) c = (c * (p.row - n + 1)) / n;
    return s + (c / 2 ** p.row) * BONUS_PAY;
  }, 0);
  return slots + bonus;
}
