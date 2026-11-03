/**
 * BNF형 25일 이격도 역추세 백테스트 실행기(로컬 전용) — 규격: docs/bnf/STRATEGY.md
 *
 *   npx tsx scripts/bnf-backtest.ts binance    # 먼저 scripts/bnf-fetch.ts binance
 *   npx tsx scripts/bnf-backtest.ts bitget
 *
 * 입력: .bnf-data/<거래소>/ETHUSDT-15m.csv (manifest SHA256 과 일치해야 실행)
 * 출력: data/bnf/<거래소>/results.json · summary.csv · trades.csv · monthly.csv
 * 구성: 15m/1h/4h/1d × 전체/약세장 × 5x/10x × 개발/OOS/전체. 매개변수 최적화 없음(고정 규칙 1회 실행).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fromCsv, validateBars, resample, parseBinanceFunding, fundingGaps, isoUtc, MIN15, HOUR, H4, DAY, type Bar } from '../lib/bnf/data';
import { dailyContext, wilderAtr } from '../lib/bnf/indicators';
import { findSignals, simulate, DEFAULT_PARAMS, type Regime, type FundingInput, type Trade } from '../lib/bnf/engine';
import { summarize, monthlyReturns, sampleCurve, verdict, VERDICT_LABEL, tradeRow, TRADE_COLUMNS, type Summary } from '../lib/bnf/metrics';

const ROOT = join(__dirname, '..');
const OOS_T = Date.UTC(2024, 10, 1);           // 2024-11-01 00:00 UTC — 이후는 OOS
const TFS: [string, number][] = [['15m', MIN15], ['1h', HOUR], ['4h', H4], ['1d', DAY]];
const REGIMES: [Regime, string][] = [['all', '전체 국면'], ['bear', '약세장 한정']];
const LEVS = [5, 10];
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const r = (x: number | null, d = 4) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));

function slim(s: Summary) {
  return {
    trades: s.trades, wins: s.wins, winRate: r(s.winRate, 2), pf: r(s.pf, 3), avgR: r(s.avgR, 4), avgHoldH: r(s.avgHoldH, 2),
    maxLossUsdt: r(s.maxLossUsdt, 2), maxLossR: r(s.maxLossR, 3), mddPct: r(s.mddPct, 3), totalReturnPct: r(s.totalReturnPct, 3),
    finalEquity: r(s.finalEquity, 2), maxConsecLoss: s.maxConsecLoss, feesTotal: r(s.feesTotal, 2), slipTotal: r(s.slipTotal, 2),
    fundingTotal: r(s.fundingTotal, 2), exitReasons: s.exitReasons, worstMaePct: r(s.worstMaePct, 3), cappedTrades: s.cappedTrades,
    skipped: s.skipped, signalsInWindow: s.signalsInWindow, sufficient: s.sufficient,
  };
}

function main() {
  const ex = process.argv[2];
  if (ex !== 'binance' && ex !== 'bitget') throw new Error('사용법: npx tsx scripts/bnf-backtest.ts binance|bitget');
  const dir = join(ROOT, 'data', 'bnf', ex);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const csv = readFileSync(join(ROOT, '.bnf-data', ex, 'ETHUSDT-15m.csv'), 'utf8');
  if (sha256(csv) !== manifest.normalized.sha256) throw new Error('정규화 CSV 해시가 manifest 와 다릅니다 — 수집기를 다시 실행하세요');
  const v = validateBars(fromCsv(csv));
  if (!v.ok || v.gaps.length) throw new Error(`데이터 검증 실패(결측 ${v.gaps.length})`);
  const bars15 = v.bars;
  const dataEndT = bars15[bars15.length - 1].t + MIN15;

  const daily = resample(bars15, DAY);
  const ctx = dailyContext(daily);
  const bars4h = resample(bars15, H4);
  const atr4h = wilderAtr(bars4h, 14);
  const firstValid = ctx.q10.findIndex((q) => q != null);
  const startT = ctx.day0 + firstValid * DAY;

  let funding: { events: ReturnType<typeof parseBinanceFunding>; gaps: { fromT: number; toT: number }[] } | null = null;
  const fpath = join(ROOT, '.bnf-data', ex, 'ETHUSDT-funding.csv');
  if (ex === 'binance' && existsSync(fpath)) {
    const ftext = readFileSync(fpath, 'utf8');
    if (sha256(ftext) !== manifest.funding.normalized.sha256) throw new Error('펀딩 CSV 해시 불일치');
    const events = parseBinanceFunding(ftext).filter((e) => e.t >= bars15[0].t && e.t <= dataEndT);
    funding = { events, gaps: fundingGaps(events) };
  }
  const fin = (apply: boolean): FundingInput | null => (funding ? { ...funding, apply } : null);

  const periods: [string, number, number][] = [['dev', startT, OOS_T], ['oos', OOS_T, Infinity], ['full', startT, Infinity]];
  const configs: unknown[] = [];
  const summaryRows: (string | number | null)[][] = [];
  const tradeRows: (string | number)[][] = [];
  const monthRows: (string | number)[][] = [];
  const verdicts: string[] = [];
  let levIdentical = true;

  for (const [tf, tfMs] of TFS) {
    const tfBars: Bar[] = tfMs === MIN15 ? bars15 : resample(bars15, tfMs);
    for (const [regime, regimeLabel] of REGIMES) {
      const signals = findSignals(tfBars, tfMs, ctx, regime);
      const nets: Record<number, string> = {};
      for (const lev of LEVS) {
        const key = `${tf}-${regime}-${lev}x`;
        const per: Record<string, unknown> = {};
        const sums: Record<string, Summary> = {};
        const fsums: Record<string, Summary | null> = {};
        let fullTrades: Trade[] = [], oosTrades: Trade[] = [], fullEquity: [number, number][] = [];
        for (const [pname, from, to] of periods) {
          const base = { bars15, signals, bars4h, atr4h, leverage: lev, entryFrom: from, entryTo: to, startT: from };
          const run = simulate({ ...base, funding: fin(false) });
          const s = summarize(run, DEFAULT_PARAMS.initial);
          const runF = funding ? simulate({ ...base, funding: fin(true) }) : null;
          const sf = runF ? summarize(runF, DEFAULT_PARAMS.initial) : null;
          sums[pname] = s; fsums[pname] = sf;
          const lastExit = run.trades.length ? run.trades[run.trades.length - 1].exitT : from;
          const toT = Math.max(Math.min(to, dataEndT), lastExit);
          const monthly = monthlyReturns(run.equity, DEFAULT_PARAMS.initial, from, toT);
          per[pname] = {
            entryFromUtc: isoUtc(from), entryToUtc: Number.isFinite(to) ? isoUtc(to) : isoUtc(dataEndT),
            summary: slim(s),
            withFunding: sf ? { totalReturnPct: r(sf.totalReturnPct, 3), avgR: r(sf.avgR, 4), pf: r(sf.pf, 3), mddPct: r(sf.mddPct, 3), fundingTotal: r(sf.fundingTotal, 2), fundingIncomplete: runF!.fundingIncomplete } : null,
            monthly: monthly.map((m) => [m.month, r(m.retPct, 3)]),
          };
          summaryRows.push([ex, tf, regime, lev, pname, s.trades, r(s.winRate, 2), r(s.pf, 3), r(s.avgR, 4), r(s.avgHoldH, 2), r(s.maxLossUsdt, 2), r(s.maxLossR, 3),
            r(s.mddPct, 3), r(s.totalReturnPct, 3), s.maxConsecLoss, r(s.feesTotal, 2), r(s.slipTotal, 2), r(s.fundingTotal, 2),
            sf ? r(sf.totalReturnPct, 3) : null, sf ? r(sf.avgR, 4) : null, s.sufficient ? 'Y' : 'N(판단 불가)', s.skipped.wideStop]);
          for (const t of run.trades) tradeRows.push([ex, tf, regime, lev, pname, ...tradeRow(t)]);
          for (const m of monthly) monthRows.push([ex, tf, regime, lev, pname, m.month, +m.retPct.toFixed(4), +m.endEquity.toFixed(4)]);
          if (pname === 'full') { fullTrades = run.trades; fullEquity = run.equity; }
          if (pname === 'oos') oosTrades = run.trades;
        }
        nets[lev] = fullTrades.map((t) => t.net.toFixed(8)).join(',');
        const vcode = verdict(sums.oos, sums.dev, fsums.oos);
        verdicts.push(vcode);
        const trow = (t: Trade) => [isoUtc(t.entryT), isoUtc(t.exitT), t.reason, r(t.entry, 2), r(t.stop, 2), r(t.target, 2), r(t.exit, 2), r(t.net, 2), r(t.r, 3), r(t.holdH, 1), r(t.maePct, 2), t.funding == null ? null : r(t.funding, 3)];
        configs.push({
          key, tf, regime, regimeLabel, leverage: lev, signals: signals.length, periods: per,
          verdict: vcode, verdictLabel: VERDICT_LABEL[vcode],
          curve: sampleCurve(fullEquity, DEFAULT_PARAMS.initial, startT, Math.max(dataEndT, fullTrades.at(-1)?.exitT ?? 0)),
          oosTrades: oosTrades.map(trow),
        });
        console.log(`${key.padEnd(14)} 신호 ${String(signals.length).padStart(5)} | OOS ${String(sums.oos.trades).padStart(3)}회 PF ${sums.oos.pf?.toFixed(2) ?? '—'} 평균R ${sums.oos.avgR?.toFixed(3) ?? '—'} MDD ${sums.oos.mddPct.toFixed(2)}% | 개발 ${sums.dev.trades}회 평균R ${sums.dev.avgR?.toFixed(3) ?? '—'} → ${VERDICT_LABEL[vcode]}`);
      }
      if (nets[5] !== nets[10]) levIdentical = false;
    }
  }

  const conclusion = verdicts.includes('candidate')
    ? { code: 'candidate', label: '추가 검증 후보 있음 — 실거래 적합 판정 아님(선행 테스트 필요)' }
    : verdicts.every((v) => v === 'insufficient')
      ? { code: 'insufficient', label: '판단 불가 — 모든 구성이 OOS 거래 30회 미만' }
      : { code: 'unfit', label: '사용 부적합 — 미리 정한 기준을 통과한 구성이 없음' };

  let gitHead = '';
  try { gitHead = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
  const engineSha = sha256(['data', 'indicators', 'engine', 'metrics'].map((f) => readFileSync(join(ROOT, 'lib', 'bnf', `${f}.ts`), 'utf8')).join('\n'));

  const results = {
    meta: {
      exchange: ex, contract: manifest.contract, symbol: 'ETHUSDT', generatedAt: new Date().toISOString(),
      generator: 'scripts/bnf-backtest.ts', gitHead, engineSha256: engineSha,
      data: { firstUtc: manifest.range.firstUtc, lastBarOpenUtc: manifest.range.lastBarOpenUtc, bars: manifest.range.bars, sha256: manifest.normalized.sha256, gaps: manifest.gaps, source: manifest.source },
      firstSignalDayUtc: isoUtc(startT), oosFromUtc: isoUtc(OOS_T), dataEndUtc: isoUtc(dataEndT),
      params: { ...DEFAULT_PARAMS, maxHoldH: DEFAULT_PARAMS.maxHoldMs / HOUR, cooldownH: DEFAULT_PARAMS.cooldownMs / HOUR, smaDays: 25, quantileWindowDays: 365, quantile: 0.1, regimeSmaDays: 200, atr: '4h Wilder ATR14' },
      costBasis: '수수료·슬리피지 반영, 펀딩비 제외',
      funding: funding ? '보조 열: Binance 공식 펀딩비 반영(명목가는 15분봉 시가 근사)' : '미포함',
      notIncluded: ['미결제약정(OI)', '강제청산 데이터', '거래소 청산가·유지증거금 모델', ...(funding ? [] : ['펀딩비'])],
      leverageIdentical: levIdentical,
      disclaimer: '25일 이동평균 이격도를 쓰는 BNF형 연구 규칙이며 BNF 본인의 정확한 매매 알고리즘이 아님. 실거래 주문 기능 없음.',
    },
    conclusion,
    configs,
  };
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results) + '\n');
  const csvOut = (rows: (string | number | null)[][]) => rows.map((x) => x.map((c) => (c == null ? '' : String(c))).join(',')).join('\n') + '\n';
  writeFileSync(join(dir, 'summary.csv'), csvOut([['exchange', 'tf', 'regime', 'leverage', 'period', 'trades', 'win_rate_pct', 'pf', 'avg_r', 'avg_hold_h', 'max_loss_usdt', 'max_loss_r',
    'mtm_mdd_pct', 'total_return_pct', 'max_consec_loss', 'fees_usdt', 'slippage_usdt', 'funding_usdt', 'return_with_funding_pct', 'avg_r_with_funding', 'sample_ok', 'skipped_wide_stop'], ...summaryRows]));
  writeFileSync(join(dir, 'trades.csv'), csvOut([['exchange', 'tf', 'regime', 'leverage', 'period', ...TRADE_COLUMNS], ...tradeRows]));
  writeFileSync(join(dir, 'monthly.csv'), csvOut([['exchange', 'tf', 'regime', 'leverage', 'period', 'month', 'return_pct', 'end_equity'], ...monthRows]));
  console.log(`\n결론: ${conclusion.label} · 5x/10x 손익 동일: ${levIdentical} · 첫 신호 가능일 ${isoUtc(startT)}`);
}

main();
