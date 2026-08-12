// tests.js — run: node tests.js  (exits non-zero on failure)
import { createHash } from 'node:crypto';
import {
  ROWS, SLOTS, PATHS, BONUS_PEGS, BONUS_PAY, TABLES, TABLE_KEYS,
  pathFromSeed, slotOf, trackOf, bonusHits, quote, settle, verifyDrop, evOf,
} from './pearl.js';

let fails = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok ', name);
  else { fails++; console.error('  FAIL', name, detail ?? ''); }
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const comb = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i; return c; };

// ---- the path convention
{
  const p = pathFromSeed('0'.repeat(64));
  ok(p.length === ROWS && p.every((b) => b === 0), 'seed 0 drops straight left');
  const q = pathFromSeed('fff'); // low 12 bits all set
  ok(q.every((b) => b === 1) && slotOf(q) === ROWS, 'seed 0xfff drops straight right');
  const a = pathFromSeed(sha256('tide')), b = pathFromSeed(sha256('tide'));
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same seed drops the same pearl');
  // bit i = row i, little-endian off the BigInt: 0b000000000101 → rows 0 and 2 right
  const r = pathFromSeed('5');
  ok(r[0] === 1 && r[1] === 0 && r[2] === 1 && slotOf(r) === 2, 'bit order is row order');
}

// ---- EXHAUSTIVE truth: every one of the 4096 paths, no sampling
{
  const counts = Array(SLOTS).fill(0);
  const pegCounts = BONUS_PEGS.map(() => 0);
  const evSum = Object.fromEntries(TABLE_KEYS.map((k) => [k, 0]));
  for (let v = 0; v < PATHS; v++) {
    const path = pathFromSeed(v.toString(16));
    counts[slotOf(path)]++;
    bonusHits(path).forEach((p) => { pegCounts[BONUS_PEGS.indexOf(p)]++; });
    for (const k of TABLE_KEYS) {
      const s = settle({ table: k, stake: 1000, seedHex: v.toString(16) });
      evSum[k] += s.payout;
    }
  }
  ok(counts.every((c, k) => c === comb(ROWS, k)),
    'all 4096 paths: slots land exactly on the binomial', JSON.stringify(counts));
  ok(BONUS_PEGS.every((p, i) => pegCounts[i] === (comb(p.row, p.pos) / 2 ** p.row) * PATHS),
    'all 4096 paths: bonus pegs struck exactly at C(r,p)/2^r');
  for (const k of TABLE_KEYS) {
    const edge = 1 - evSum[k] / (PATHS * 1000);
    ok(edge > 0.025 && edge < 0.035,
      `HOUSE RULE: ${k} edge ≈3% under exhaustive play (${(edge * 100).toFixed(2)}%)`);
    // the closed form must agree with brute force (flooring costs a whisker)
    ok(Math.abs(1 - evOf(k) - edge) < 0.002, `${k}: evOf agrees with enumeration`);
  }
}

// ---- tables are protocol
{
  ok(TABLE_KEYS.length === 3, 'three rides');
  for (const k of TABLE_KEYS) {
    const m = TABLES[k];
    ok(m.length === SLOTS, `${k} covers every slot`);
    ok(m.every((v, i) => v === m[SLOTS - 1 - i]), `${k} is symmetric — no better side`);
    ok(Math.max(...m) === m[0], `${k} pays its maximum at the rim`);
  }
  ok(TABLES.storm[0] > TABLES.swell[0] && TABLES.swell[0] > TABLES.calm[0],
    'storm > swell > calm at the rim: the shapes differ, the edge does not');
}

// ---- settling
{
  const s = settle({ table: 'calm', stake: 100, seedHex: sha256('drop1') });
  ok(Number.isInteger(s.payout) && s.payout === s.slotPay + s.bonusPay, 'payout is whole coins, sum of parts');
  ok(s.delta === s.payout - 100, 'delta is against the stake');
  const v = verifyDrop({ seedHex: sha256('drop1'), table: 'calm', stake: 100 });
  ok(JSON.stringify(v) === JSON.stringify(s), 'verifyDrop replays the identical drop');
  const center = settle({ table: 'storm', stake: 100, seedHex: 'fc0' }); // bits: six 0s then six 1s → slot 6
  ok(center.slot === 6 && center.slotPay === Math.floor(100 * TABLES.storm[6]),
    'a known seed lands a known slot at the table price', JSON.stringify({ slot: center.slot }));
  let threw = false;
  try { settle({ table: 'tsunami', stake: 100, seedHex: 'ff' }); } catch { threw = true; }
  ok(threw, 'an unknown table refuses to settle');
  threw = false;
  try { quote('calm', 0); } catch { threw = true; }
  ok(threw, 'a zero stake refuses to quote');
}

// ---- bonus pegs
{
  // straight-centre zigzag 0b101010101010 = 0xaaa: track hits 2@4? bits alternate 0,1…
  const p = pathFromSeed('aaa');
  const t = trackOf(p);
  ok(t[4] === 2 && t[6] === 3 && t[8] === 4, 'the perfect zigzag rides the centre line');
  ok(bonusHits(p).length === 3, 'and strikes every bonus peg on the way down');
  const q = quote('calm', 100);
  ok(q.bonusEach === 10 && q.maxPayout === Math.floor(100 * 11) + 30,
    'quote prices the rim plus a full string of pearls');
}

if (fails) { console.error(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nall tests pass');
