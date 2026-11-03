/**
 * BNF형 연구 데이터 수집기 — 재현 가능한 공개 데이터만 받는다(로컬 전용, 키 불필요).
 *
 *   npx tsx scripts/bnf-fetch.ts binance   # data.binance.vision 월별 15m klines + fundingRate (공식 CHECKSUM 검증)
 *   npx tsx scripts/bnf-fetch.ts bitget    # Bitget 공개 history-candles 15m (펀딩 이력은 약 100일뿐 → 미포함)
 *
 * 출력: .bnf-data/<거래소>/ (원본·정규화 CSV, git 제외) + data/bnf/<거래소>/manifest.json (출처·기간·SHA256·결측)
 * ⚠ 결측은 보간하지 않는다. 시작부터 연속 구간만 쓰고 첫 결측 직전에서 멈춘다(manifest 에 기록).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBinanceKlines, parseBinanceFunding, validateBars, continuousSpan, toCsv, fundingGaps, isoUtc, MIN15, DAY, type Bar, type FundingEvent } from '../lib/bnf/data';
import { unzipFirst } from '../lib/bnf/zip';

const SYMBOL = 'ETHUSDT';
const START = Date.UTC(2021, 10, 1);           // 2021-11-01 00:00 UTC
const ROOT = join(__dirname, '..');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (r.status === 404 || r.ok) return r;
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= tries - 1) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(1500 * (i + 1));
    }
  }
}

/** 2021-11 ~ 지난달(완료된 달)까지 YYYY-MM */
function months(now: number): string[] {
  const out: string[] = [];
  const d = new Date(START);
  const end = new Date(now); end.setUTCDate(1); end.setUTCHours(0, 0, 0, 0);
  while (d.getTime() < end.getTime()) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

/** zip + 공식 .CHECKSUM — 캐시가 있고 해시가 맞으면 재사용 */
async function archive(dir: string, url: string): Promise<{ buf: Buffer; sha: string; official: string | null } | null> {
  const file = join(dir, url.split('/').pop()!);
  const ck = await get(url + '.CHECKSUM');
  const official = ck.ok ? (await ck.text()).trim().split(/\s+/)[0] : null;
  if (existsSync(file)) {
    const buf = readFileSync(file);
    if (official && sha256(buf) === official) return { buf, sha: official, official };
  }
  const r = await get(url);
  if (r.status === 404) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(file, buf);
  return { buf, sha: sha256(buf), official };
}

function summarizeValidation(v: ReturnType<typeof validateBars>, closeTimeErrors: number[]) {
  return {
    duplicates: v.duplicates, conflicts: v.conflicts.length, misaligned: v.misaligned.length,
    ohlcErrors: v.ohlcErrors.slice(0, 20).map((e) => ({ t: isoUtc(e.t), reason: e.reason })), ohlcErrorCount: v.ohlcErrors.length,
    closeTimeErrors: closeTimeErrors.length, partialRemoved: v.partialRemoved,
  };
}

function finish(exchange: string, raw: Bar[], closeTimeErrors: number[], now: number, extra: Record<string, unknown>, endT = Infinity) {
  const v = validateBars(raw, MIN15, now);
  if (!v.ok || closeTimeErrors.length) {
    console.error('검증 실패', summarizeValidation(v, closeTimeErrors));
    process.exit(1);
  }
  const span = continuousSpan(v.bars, MIN15, START, endT);
  if (!span.length) { console.error('시작 봉(2021-11-01 00:00 UTC) 없음'); process.exit(1); }
  const last = span[span.length - 1];
  const gaps = v.gaps.filter((g) => g.afterT >= START).map((g) => ({ afterUtc: isoUtc(g.afterT), nextUtc: isoUtc(g.nextT), missing: g.missing }));
  const csv = toCsv(span);
  const dataDir = join(ROOT, '.bnf-data', exchange);
  writeFileSync(join(dataDir, `${SYMBOL}-15m.csv`), csv);
  const manifest = {
    exchange, symbol: SYMBOL, interval: '15m', collector: 'scripts/bnf-fetch.ts', generatedAt: new Date(now).toISOString(),
    range: { requestedStartUtc: isoUtc(START), firstUtc: isoUtc(span[0].t), lastBarOpenUtc: isoUtc(last.t), lastBarCloseUtc: isoUtc(last.t + MIN15), bars: span.length, days: span.length / 96 },
    excludedAfterFirstGap: v.bars.filter((b) => b.t > last.t && b.t <= endT).length,
    gaps,
    validation: summarizeValidation(v, closeTimeErrors),
    normalized: { path: `.bnf-data/${exchange}/${SYMBOL}-15m.csv`, columns: 't(open_time ms UTC),o,h,l,c,v', sha256: sha256(csv), rows: span.length },
    notIncluded: { openInterest: '미포함 — 전략에 쓰지 않고 추정값도 만들지 않음', liquidations: '미포함 — 같은 이유' },
    ...extra,
  };
  const outDir = join(ROOT, 'data', 'bnf', exchange);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${exchange}: ${span.length}봉 ${isoUtc(span[0].t)} ~ ${isoUtc(last.t)} (마지막 봉 시작) · 결측 ${gaps.length}곳 · 연속 구간 뒤 제외 ${manifest.excludedAfterFirstGap}봉`);
  for (const g of gaps) console.log(`  결측: ${g.afterUtc} 다음 ${g.nextUtc} (${g.missing}봉 없음)`);
}

async function binance() {
  const now = Date.now();
  const dir = join(ROOT, '.bnf-data', 'binance', 'raw');
  mkdirSync(dir, { recursive: true });
  const BASE = 'https://data.binance.vision/data/futures/um';
  const files: unknown[] = [];
  const raw: Bar[] = [];
  const closeTimeErrors: number[] = [];
  const funding: FundingEvent[] = [];
  const fundingFiles: unknown[] = [];
  for (const m of months(now)) {
    const url = `${BASE}/monthly/klines/${SYMBOL}/15m/${SYMBOL}-15m-${m}.zip`;
    const a = await archive(dir, url);
    if (!a) { files.push({ month: m, url, status: 'absent' }); console.log(`${m} 없음`); continue; }
    if (!a.official || a.official !== a.sha) { console.error(`${m} CHECKSUM 불일치/없음`); process.exit(1); }
    const { data } = unzipFirst(a.buf);
    const p = parseBinanceKlines(data.toString('utf8'));
    raw.push(...p.bars); closeTimeErrors.push(...p.closeTimeErrors);
    files.push({ month: m, url, zipSha256: a.sha, checksumMatch: true, csvSha256: sha256(data), rows: p.bars.length });

    const furl = `${BASE}/monthly/fundingRate/${SYMBOL}/${SYMBOL}-fundingRate-${m}.zip`;
    const f = await archive(dir, furl);
    if (!f || !f.official || f.official !== f.sha) { fundingFiles.push({ month: m, url: furl, status: f ? 'checksum_mismatch' : 'absent' }); continue; }
    const fd = unzipFirst(f.buf).data;
    const ev = parseBinanceFunding(fd.toString('utf8'));
    funding.push(...ev);
    fundingFiles.push({ month: m, url: furl, zipSha256: f.sha, checksumMatch: true, csvSha256: sha256(fd), rows: ev.length });
    process.stdout.write(`${m} `);
  }
  console.log();

  // 결측 날짜에 일별 아카이브(보충 자료)가 있는지 확인만 한다 — 있어도 별도 검증 전엔 쓰지 않음
  const v = validateBars(raw, MIN15, now);
  const supplement: { dateUtc: string; dailyArchive: string }[] = [];
  for (const g of v.gaps.filter((x) => x.afterT >= START)) {
    for (let d = Math.floor((g.afterT + MIN15) / DAY) * DAY; d < g.nextT; d += DAY) {
      const ds = isoUtc(d).slice(0, 10);
      const r = await get(`${BASE}/daily/klines/${SYMBOL}/15m/${SYMBOL}-15m-${ds}.zip.CHECKSUM`);
      supplement.push({ dateUtc: ds, dailyArchive: r.ok ? 'present(미검증 — 사용 안 함)' : 'absent' });
    }
  }

  const fsorted = funding.sort((a, b) => a.t - b.t);
  const fcsv = 'calc_time,funding_interval_hours,last_funding_rate\n' + fsorted.map((e) => `${e.t},${e.intervalH},${e.rate}`).join('\n') + '\n';
  writeFileSync(join(ROOT, '.bnf-data', 'binance', `${SYMBOL}-funding.csv`), fcsv);
  const fg = fundingGaps(fsorted);
  finish('binance', raw, closeTimeErrors, now, {
    contract: 'Binance USDⓈ-M ETHUSDT perpetual',
    source: `${BASE}/monthly/klines/${SYMBOL}/15m/`,
    files, supplement,
    funding: {
      source: `${BASE}/monthly/fundingRate/${SYMBOL}/`, files: fundingFiles, events: fsorted.length,
      firstUtc: fsorted.length ? isoUtc(fsorted[0].t) : null, lastUtc: fsorted.length ? isoUtc(fsorted[fsorted.length - 1].t) : null,
      gaps: fg.map((g) => ({ fromUtc: isoUtc(g.fromT), toUtc: isoUtc(g.toT) })),
      normalized: { path: `.bnf-data/binance/${SYMBOL}-funding.csv`, sha256: sha256(fcsv) },
      note: '보조 지표로만 사용. 명목가는 공식 mark price 가 아니라 해당 시각 15분봉 시가로 근사',
    },
  });
}

/** Bitget 은 공개 API 페이지네이션(200봉) — 비교 가능하도록 Binance 와 같은 끝(2026-10-27 23:45 UTC 봉)에서 자른다 */
const BITGET_END_EXCL = Date.UTC(2026, 9, 28);
async function bitget() {
  const now = Date.now();
  mkdirSync(join(ROOT, '.bnf-data', 'bitget'), { recursive: true });
  const seen = new Map<number, Bar>();
  let endTime = Math.min(BITGET_END_EXCL, Math.floor(now / MIN15) * MIN15);
  let calls = 0;
  while (endTime > START) {
    const url = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${SYMBOL}&productType=USDT-FUTURES&granularity=15m&limit=200&endTime=${endTime}`;
    const j = await (await get(url)).json();
    calls++;
    if (j?.code !== '00000') throw new Error(`Bitget 오류 ${j?.code} ${j?.msg}`);
    const rows: string[][] = j.data ?? [];
    if (!rows.length) break;
    let oldest = Infinity;
    for (const r of rows) {
      const t = Number(r[0]);
      oldest = Math.min(oldest, t);
      if (t >= START && t < BITGET_END_EXCL) seen.set(t, { t, o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) });
    }
    if (!(oldest < endTime)) break;
    endTime = oldest;
    if (calls % 100 === 0) console.log(`  ${calls}회 · ${isoUtc(oldest)}`);
    await sleep(130);
  }
  finish('bitget', [...seen.values()], [], now, {
    contract: 'Bitget USDT-FUTURES ETHUSDT perpetual',
    source: 'https://api.bitget.com/api/v2/mix/market/history-candles (granularity=15m, 공개 API · 원본 파일 해시 없음 → 정규화 CSV SHA256 기록)',
    apiCalls: calls, endCapUtc: isoUtc(BITGET_END_EXCL), endCapReason: 'Binance 실험과 같은 기간 비교 — Binance 가 2026-10-28 결측으로 2026-10-27 23:45 봉에서 멈춤',
    funding: { status: '미포함', reason: 'Bitget 공개 history-fund-rate 는 최근 약 100일(약 300건)만 제공 — 2021-11 부터의 이력 없음' },
  }, BITGET_END_EXCL - MIN15);
}

const which = process.argv[2];
(which === 'binance' ? binance() : which === 'bitget' ? bitget() : Promise.reject(new Error('사용법: npx tsx scripts/bnf-fetch.ts binance|bitget')))
  .catch((e) => { console.error(e.message); process.exit(1); });
