import assert from 'node:assert/strict';
import { aggregate, ema, computeFlags, liveFlags, btcBreakFn, dropWithin, crashOnsets, scorecard, type Bar } from '../lib/crashWarning';

let passed = 0;
function ok(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}
console.log('crashWarning.ts');

/** 결정적 랜덤워크 5분봉(가끔 거래량·가격 충격) */
function walk(n: number, seed = 7, start = Date.UTC(2026, 0, 1)): Bar[] {
  let s = seed, px = 100;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Array.from({ length: n }, (_, i) => {
    const shock = i % 997 === 0 ? -2.5 : 0;
    const o = px; px = Math.max(1, px * (1 + (rnd() - 0.5) * 0.004 + shock / 100));
    return { ts: start + i * 300_000, o, h: Math.max(o, px) * (1 + rnd() * 0.001), l: Math.min(o, px) * (1 - rnd() * 0.001), c: px, v: 100 * (1 + rnd()) * (shock ? 20 : 1) };
  });
}

ok('집계: 완성된 봉만, OHLCV 합성', () => {
  const b = walk(13);   // 5분 13개 = 15분 4개 + 남는 1개
  const m15 = aggregate(b, 15);
  assert.equal(m15.length, 4);
  assert.equal(m15[0].o, b[0].o); assert.equal(m15[0].c, b[2].c);
  assert.equal(m15[0].h, Math.max(b[0].h, b[1].h, b[2].h)); assert.ok(Math.abs(m15[0].v - (b[0].v + b[1].v + b[2].v)) < 1e-9);
  assert.equal(ema([1, 1, 1], 20)[2], 1);
});
ok('실시간 판정 = 백테스트 판정(같은 5분봉을 집계해 마지막 시점 비교)', () => {
  const b5 = walk(288 * 40), btc = walk(288 * 40, 99);
  for (const cut of [b5.length, b5.length - 37, b5.length - 200]) {
    const part = b5.slice(0, cut), bpart = btc.slice(0, cut);
    const back = computeFlags(part, btcBreakFn(bpart)).at(-1)!;
    const now = part.at(-1)!.ts + 300_000;
    const live = liveFlags({ d1: aggregate(part, 1440), h4: aggregate(part, 240), h1: aggregate(part, 60), m15: aggregate(part, 15), m5: part, btc15: aggregate(bpart, 15), now })!;
    for (const k of ['mtf', 'h1VolBreak', 'core', 'failReclaim', 'btcBreak', 'lowerHighs1h', 'break15', 'vol5', 'checklist'] as const) assert.equal(live[k], back[k], `${k} @${cut}`);
  }
});
ok('폭락 정의: 60분 안 −3%, 6시간 간격으로 묶음 · 15분 선행 적중', () => {
  const b: Bar[] = Array.from({ length: 200 }, (_, i) => ({ ts: i * 300_000, o: 100, h: 100.1, l: 99.9, c: 100, v: 1 }));
  b[30] = { ...b[30], l: 96.5 }; b[34] = { ...b[34], l: 96 };
  assert.equal(dropWithin(b, 20, 0, 60), true); assert.equal(dropWithin(b, 20, 15, 75), true);
  assert.equal(dropWithin(b, 34, 0, 60), false);   // 그 봉 자신은 미포함, 이후 회복
  assert.equal(dropWithin(b, 31, 15, 75), false);  // 15분 뒤부터만 — 34번 봉(+15분)은 경계 밖
  assert.equal(crashOnsets(b).length, 1);
  assert.equal(dropWithin(b, 190, 0, 60), null);
});
ok('성적표: 경고 에피소드·적중·대조군·표본 부족', () => {
  const b5 = walk(288 * 40);
  const flags = computeFlags(b5);
  const sc = scorecard('x', b5, flags, (f) => f.break15);
  assert.ok(sc.warnings > 0 && sc.hits <= sc.warnings && sc.falseAlarms === sc.warnings - sc.hits);
  assert.ok(sc.base >= 0 && sc.base <= 100);
  assert.equal(scorecard('none', b5, flags, () => false).verdict, 'thin');
});
console.log(`\n${passed} passed`);
