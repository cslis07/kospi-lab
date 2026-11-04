/**
 * BNF 모의 검증 봇 실행기 — 사전등록: docs/bnf/FORWARD.md. GitHub Actions(.github/workflows/bnf-forward.yml)가 3시간마다 실행.
 *
 *   npx tsx scripts/bnf-forward.ts                 # data/bnf-forward.json 갱신(이전 파일이 있으면 기록 고정·변경 경고에 사용)
 *   npx tsx scripts/bnf-forward.ts --start 2025-06-01 --out <경로>   # 로컬 점검용(과거 시작으로 엔진 확인 — 등록 기록 아님)
 *
 * Bitget 공개 캔들만 쓴다(키·주문 없음). Vercel 함수는 쓰지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MIN15, HOUR, DAY, isoUtc, type Bar } from '../lib/bnf/data';
import { runForward, FORWARD_START, type ForwardResult } from '../lib/bnf/forward';
import type { Summary } from '../lib/bnf/metrics';

const ROOT = join(__dirname, '..');
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Bitget history-candles 를 endTime 뒤에서 앞으로 페이지네이션 — [fromT, now) */
async function fetchBitget(gran: '1H' | '15m', fromT: number): Promise<Bar[]> {
  const step = gran === '1H' ? HOUR : MIN15;
  const seen = new Map<number, Bar>();
  let endTime = Math.floor(Date.now() / step) * step + step;
  for (let calls = 0; endTime > fromT; calls++) {
    if (calls > 2000) throw new Error('호출 수 상한 초과');
    const url = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=ETHUSDT&productType=USDT-FUTURES&granularity=${gran}&limit=200&endTime=${endTime}`;
    let j: { code?: string; msg?: string; data?: string[][] } | null = null;
    for (let tr = 0; tr < 4; tr++) {
      try { j = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json(); if (j?.code === '00000') break; } catch { /* 재시도 */ }
      await sleep(1500 * (tr + 1));
    }
    if (j?.code !== '00000') throw new Error(`Bitget 오류 ${j?.code} ${j?.msg}`);
    const rows = j.data ?? [];
    if (!rows.length) break;
    let oldest = Infinity;
    for (const row of rows) {
      const t = Number(row[0]);
      oldest = Math.min(oldest, t);
      if (t >= fromT) seen.set(t, { t, o: Number(row[1]), h: Number(row[2]), l: Number(row[3]), c: Number(row[4]), v: Number(row[5]) });
    }
    if (!(oldest < endTime)) break;
    endTime = oldest;
    await sleep(120);
  }
  return [...seen.values()].sort((a, b) => a.t - b.t);
}

async function main() {
  const start = arg('start') ? Date.parse(`${arg('start')}T00:00:00Z`) : FORWARD_START;
  const out = arg('out') ?? join(ROOT, 'data', 'bnf-forward.json');
  const nowT = Date.now();
  const previous: ForwardResult | null = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  if (previous && previous.startUtc !== isoUtc(start)) throw new Error(`기존 기록의 시작(${previous.startUtc})과 다릅니다 — 다른 --out 을 쓰세요`);
  // A 의 개발 구간 일관성 항목 = Bitget 백테스트 1h 전체 국면 전체 구간(사전등록 §4)
  const bt = JSON.parse(readFileSync(join(ROOT, 'data', 'bnf', 'bitget', 'results.json'), 'utf8'));
  const devForA = bt.configs.find((c: { key: string }) => c.key === '1h-all-5x').periods.full.summary as Summary;

  const [bars1h, bars15] = await Promise.all([fetchBitget('1H', start - 420 * DAY), fetchBitget('15m', start)]);
  const res = runForward({ bars1h, bars15, nowT, start, previous, devForA, registeredAt: '2026-11-04' });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
  console.log(`상태 ${res.status}${res.statusNote ? ` (${res.statusNote})` : ''} · 데이터 ${res.dataThroughUtc ?? '—'}까지 · 1H ${bars1h.length}봉 · 15m ${bars15.length}봉`);
  if (res.now) console.log(`  최신 1H ${res.now.barUtc} 종가 ${res.now.close} 이격도 ${res.now.deviation} / 임계 ${res.now.q10} · 최근 과매도 ${res.now.oversoldRecent}`);
  for (const c of res.candidates) {
    console.log(`  ${c.id}: 청산 ${c.summary.trades}회(${c.progress}) 평균R ${c.summary.avgR?.toFixed(3) ?? '—'} 자산 ${c.equity} · 보유 ${c.open ? `${c.open.entry}→손절 ${c.open.stop}/목표 ${c.open.target}` : '없음'} · 예정 ${c.pending ? c.pending.entryAtBarT : '없음'}${c.verdictLabel ? ` · ${c.verdictLabel}` : ''}`);
  }
  if (res.revisions.length) console.log(`  ⚠ 기록 변경 ${res.revisions.length}건`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
