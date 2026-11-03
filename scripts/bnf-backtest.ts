/**
 * BNF형 연구 백테스트 실행기(로컬 전용) — 규격: docs/bnf/STRATEGY.md, 추가 실험: docs/bnf/EXPERIMENTS.md
 *
 *   npx tsx scripts/bnf-backtest.ts binance                         # 1차 (먼저 scripts/bnf-fetch.ts binance)
 *   npx tsx scripts/bnf-backtest.ts bitget                          # 별도 거래소
 *   npx tsx scripts/bnf-backtest.ts binance-pre --periods pre       # E1 과거 구간 2차 검증
 *   npx tsx scripts/bnf-backtest.ts binance-btc                     # E2 BTC
 *   npx tsx scripts/bnf-backtest.ts binance --hypothesis funding --out binance-funding   # E4 펀딩 음수 극단
 *   npx tsx scripts/bnf-backtest.ts binance --costs app --out binance-cost              # E5 실사용 비용
 *   npx tsx scripts/bnf-backtest.ts bitget --costs app --out bitget-cost
 *
 * 입력: .bnf-data/<데이터 ID>/<심볼>-15m.csv (manifest SHA256 과 일치해야 실행)
 * 출력: data/bnf/<결과 ID>/results.json · summary.csv · trades.csv · monthly.csv
 *       + public/bnf-lab-data/<결과 ID>.json(연구 페이지가 읽는 축약본) + data/bnf/index.json(실험 목록)
 * 매개변수 최적화 없음 — 사전등록한 규칙을 한 번 실행한다.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { fromCsv, validateBars, resample, parseBinanceFunding, fundingGaps, isoUtc, MIN15, HOUR, H4, DAY } from '../lib/bnf/data';
import { dailyContext, wilderAtr } from '../lib/bnf/indicators';
import { findSignals, simulate, DEFAULT_PARAMS, type Regime, type FundingInput, type Trade, type Params, type Signal } from '../lib/bnf/engine';
import { fundingExtremeSignals } from '../lib/bnf/hypotheses';
import { summarize, monthlyReturns, sampleCurve, verdict, diagnose, VERDICT_LABEL, tradeRow, TRADE_COLUMNS, type Summary } from '../lib/bnf/metrics';
import { toView } from '../lib/bnf/view';

const ROOT = join(__dirname, '..');
const OOS_T = Date.UTC(2024, 10, 1);           // 2024-11-01 00:00 UTC — 이후는 OOS
const PRE_END = Date.UTC(2021, 10, 1);         // E1: 1차 데이터 시작 전까지
const REGIMES: [Regime, string][] = [['all', '전체 국면'], ['bear', '약세장 한정']];
const LEVS = [5, 10];
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const r = (x: number | null, d = 4) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(d));
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };

/** 실험 목록(연구 페이지 순서). 이름·설명은 사전등록 문서와 같다 */
const EXPERIMENTS: Record<string, { name: string; desc: string }> = {
  'binance': { name: 'ETH · Binance (1차)', desc: '1차 규격 — Binance ETHUSDT, 2021-11 ~ 2026-10' },
  'bitget': { name: 'ETH · Bitget (별도)', desc: '같은 규칙, Bitget ETHUSDT 별도 실험(펀딩 미포함)' },
  'binance-pre': { name: 'ETH · 과거 구간 (E1)', desc: '1차에서 쓰지 않은 2021-01 ~ 2021-10 진입 구간으로 2차 검증' },
  'binance-btc': { name: 'BTC · Binance (E2)', desc: '같은 규칙을 BTCUSDT 에 적용' },
  'binance-funding': { name: 'ETH · 펀딩 음수 극단 (E4)', desc: '별개 가설 — 정산 펀딩비가 음수이면서 직전 365일 하위 10% 이하일 때 롱' },
  'binance-cost': { name: 'ETH · 실사용 비용 (E5, Binance)', desc: '시장가 테이커 0.06%+슬리피지 0.05%, 목표는 지정가 메이커 0.02%' },
  'bitget-cost': { name: 'ETH · 실사용 비용 (E5, Bitget)', desc: '같은 비용 가정, Bitget 데이터' },
};
/** E5 — 앱 위험관리 기본값(lib/riskControl.ts: taker 0.06·maker 0.02·slippage 0.05) */
const APP_COSTS: Partial<Params> = { feeRate: 0.0006, slip: 0.0005, targetFeeRate: 0.0002, targetSlip: 0 };

function slim(s: Summary) {
  return {
    trades: s.trades, wins: s.wins, winRate: r(s.winRate, 2), pf: r(s.pf, 3), avgR: r(s.avgR, 4), avgHoldH: r(s.avgHoldH, 2),
    maxLossUsdt: r(s.maxLossUsdt, 2), maxLossR: r(s.maxLossR, 3), mddPct: r(s.mddPct, 3), totalReturnPct: r(s.totalReturnPct, 3),
    finalEquity: r(s.finalEquity, 2), maxConsecLoss: s.maxConsecLoss, feesTotal: r(s.feesTotal, 2), slipTotal: r(s.slipTotal, 2),
    fundingTotal: r(s.fundingTotal, 2), exitReasons: s.exitReasons, worstMaePct: r(s.worstMaePct, 3), cappedTrades: s.cappedTrades,
    skipped: s.skipped, signalsInWindow: s.signalsInWindow, sufficient: s.sufficient,
  };
}
function slimDiag(trades: Trade[]) {
  const d = diagnose(trades);
  return {
    byReason: Object.fromEntries(Object.entries(d.byReason).map(([k, v]) => [k, { n: v.n, avgR: r(v.avgR, 3) }])),
    mfeBuckets: d.mfeBuckets, maeBuckets: d.maeBuckets, avgMfeR: r(d.avgMfeR, 3), avgMaeR: r(d.avgMaeR, 3),
    reached1RThenLost: d.reached1RThenLost, timeExitAvgR: r(d.timeExitAvgR, 3),
  };
}

function main() {
  const dataId = process.argv[2];
  if (!dataId || dataId.startsWith('--')) throw new Error('사용법: npx tsx scripts/bnf-backtest.ts <데이터 ID> [--out ID] [--hypothesis bnf|funding] [--costs default|app] [--periods main|pre]');
  const outId = arg('out') ?? dataId;
  const hypothesis = arg('hypothesis') ?? 'bnf';
  const costs = arg('costs') ?? 'default';
  const periodMode = arg('periods') ?? 'main';
  if (!EXPERIMENTS[outId]) throw new Error(`EXPERIMENTS 에 없는 결과 ID: ${outId}`);
  const params: Params = { ...DEFAULT_PARAMS, ...(costs === 'app' ? APP_COSTS : {}) };

  const manifest = JSON.parse(readFileSync(join(ROOT, 'data', 'bnf', dataId, 'manifest.json'), 'utf8'));
  const symbol: string = manifest.symbol;
  const csv = readFileSync(join(ROOT, '.bnf-data', dataId, `${symbol}-15m.csv`), 'utf8');
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
  const fpath = join(ROOT, '.bnf-data', dataId, `${symbol}-funding.csv`);
  if (manifest.exchange === 'binance' && existsSync(fpath)) {
    const ftext = readFileSync(fpath, 'utf8');
    if (sha256(ftext) !== manifest.funding.normalized.sha256) throw new Error('펀딩 CSV 해시 불일치');
    const events = parseBinanceFunding(ftext).filter((e) => e.t >= bars15[0].t && e.t <= dataEndT);
    funding = { events, gaps: fundingGaps(events) };
  }
  if (hypothesis === 'funding' && !funding) throw new Error('펀딩 가설은 펀딩 이력이 필요합니다');
  const fin = (apply: boolean): FundingInput | null => (funding ? { ...funding, apply } : null);

  // 신호 원천: BNF 는 시간봉별, 펀딩 가설은 정산 이벤트 한 종류. 첫 신호 가능 시각도 원천별로
  const tfs: [string, number][] = hypothesis === 'funding' ? [['event', 0]] : [['15m', MIN15], ['1h', HOUR], ['4h', H4], ['1d', DAY]];
  const signalsFor = (tf: string, tfMs: number, regime: Regime): Signal[] =>
    hypothesis === 'funding' ? fundingExtremeSignals(funding!.events, ctx, regime) : findSignals(tfMs === MIN15 ? bars15 : resample(bars15, tfMs), tfMs, ctx, regime);
  let evalStart = startT;
  if (hypothesis === 'funding') {
    const first = fundingExtremeSignals(funding!.events, ctx, 'all', { q: 1 })[0];   // q=1: 창이 찬 첫 음수 정산 = 계산 가능 시작 근사
    evalStart = first ? Math.max(startT, Math.floor(first.t / DAY) * DAY) : startT;
  }

  const periods: [string, string, number, number][] = periodMode === 'pre'
    ? [['pre', '과거 구간(E1)', evalStart, PRE_END]]
    : [['dev', '개발·탐색', evalStart, OOS_T], ['oos', 'OOS 검증', OOS_T, Infinity], ['full', '전체', evalStart, Infinity]];
  const evalKey = periodMode === 'pre' ? 'pre' : 'oos';
  if (periodMode === 'pre' && startT >= PRE_END) throw new Error('과거 구간에 유효 신호일이 없습니다');

  // E1 개발 구간 일관성 항목 = 1차 실험 전체 구간 결과(같은 구성)
  const mainFull = periodMode === 'pre' ? JSON.parse(readFileSync(join(ROOT, 'data', 'bnf', 'binance', 'results.json'), 'utf8')) : null;

  const configs: unknown[] = [];
  const summaryRows: (string | number | null)[][] = [];
  const tradeRows: (string | number)[][] = [];
  const monthRows: (string | number)[][] = [];
  const verdicts: string[] = [];
  let levIdentical = true;

  for (const [tf, tfMs] of tfs) {
    for (const [regime, regimeLabel] of REGIMES) {
      const signals = signalsFor(tf, tfMs, regime);
      const nets: Record<number, string> = {};
      for (const lev of LEVS) {
        const key = `${tf}-${regime}-${lev}x`;
        const per: Record<string, unknown> = {};
        const sums: Record<string, Summary> = {};
        const fsums: Record<string, Summary | null> = {};
        let curveTrades: Trade[] = [], evalTrades: Trade[] = [], curveEquity: [number, number][] = [], curveFrom = evalStart, curveTo = dataEndT;
        for (const [pname, , from, to] of periods) {
          const base = { bars15, signals, bars4h, atr4h, params, leverage: lev, entryFrom: from, entryTo: to, startT: from };
          const run = simulate({ ...base, funding: fin(false) });
          const s = summarize(run, params.initial);
          const runF = funding ? simulate({ ...base, funding: fin(true) }) : null;
          const sf = runF ? summarize(runF, params.initial) : null;
          sums[pname] = s; fsums[pname] = sf;
          const lastExit = run.trades.length ? run.trades[run.trades.length - 1].exitT : from;
          const toT = Math.max(Math.min(to, dataEndT), lastExit);
          const monthly = monthlyReturns(run.equity, params.initial, from, toT);
          per[pname] = {
            entryFromUtc: isoUtc(from), entryToUtc: Number.isFinite(to) ? isoUtc(to) : isoUtc(dataEndT),
            summary: slim(s),
            withFunding: sf ? { totalReturnPct: r(sf.totalReturnPct, 3), avgR: r(sf.avgR, 4), pf: r(sf.pf, 3), mddPct: r(sf.mddPct, 3), fundingTotal: r(sf.fundingTotal, 2), fundingIncomplete: runF!.fundingIncomplete } : null,
            monthly: monthly.map((m) => [m.month, r(m.retPct, 3)]),
            diag: slimDiag(run.trades),
          };
          summaryRows.push([outId, tf, regime, lev, pname, s.trades, r(s.winRate, 2), r(s.pf, 3), r(s.avgR, 4), r(s.avgHoldH, 2), r(s.maxLossUsdt, 2), r(s.maxLossR, 3),
            r(s.mddPct, 3), r(s.totalReturnPct, 3), s.maxConsecLoss, r(s.feesTotal, 2), r(s.slipTotal, 2), r(s.fundingTotal, 2),
            sf ? r(sf.totalReturnPct, 3) : null, sf ? r(sf.avgR, 4) : null, s.sufficient ? 'Y' : 'N(판단 불가)', s.skipped.wideStop]);
          for (const t of run.trades) tradeRows.push([outId, tf, regime, lev, pname, ...tradeRow(t)]);
          for (const m of monthly) monthRows.push([outId, tf, regime, lev, pname, m.month, +m.retPct.toFixed(4), +m.endEquity.toFixed(4)]);
          if (pname === 'full' || periodMode === 'pre') { curveTrades = run.trades; curveEquity = run.equity; curveFrom = from; curveTo = Math.max(Math.min(to, dataEndT), lastExit); }
          if (pname === evalKey) evalTrades = run.trades;
        }
        nets[lev] = curveTrades.map((t) => t.net.toFixed(8)).join(',');
        let devForVerdict = sums.dev;
        if (mainFull) {
          const m = mainFull.configs.find((c: { key: string }) => c.key === key);
          devForVerdict = m.periods.full.summary as Summary;
        }
        const vcode = verdict(sums[evalKey], devForVerdict, fsums[evalKey]);
        verdicts.push(vcode);
        const trow = (t: Trade) => [isoUtc(t.entryT), isoUtc(t.exitT), t.reason, r(t.entry, 2), r(t.stop, 2), r(t.target, 2), r(t.exit, 2), r(t.net, 2), r(t.r, 3), r(t.holdH, 1), r(t.maePct, 2), t.funding == null ? null : r(t.funding, 3)];
        configs.push({
          key, tf, regime, regimeLabel, leverage: lev, signals: signals.length, periods: per,
          verdict: vcode, verdictLabel: VERDICT_LABEL[vcode],
          curve: sampleCurve(curveEquity, params.initial, curveFrom, Math.max(curveTo, curveTrades.at(-1)?.exitT ?? 0)),
          evalTrades: evalTrades.map(trow),
        });
        const e = sums[evalKey];
        console.log(`${key.padEnd(16)} 신호 ${String(signals.length).padStart(5)} | ${evalKey} ${String(e.trades).padStart(3)}회 PF ${e.pf?.toFixed(2) ?? '—'} 평균R ${e.avgR?.toFixed(3) ?? '—'} MDD ${e.mddPct.toFixed(2)}% → ${VERDICT_LABEL[vcode]}`);
      }
      if (nets[5] !== nets[10]) levIdentical = false;
    }
  }

  const conclusion = verdicts.includes('candidate')
    ? { code: 'candidate', label: '추가 검증 후보 있음 — 실거래 적합 판정 아님(선행 테스트 필요)' }
    : verdicts.every((x) => x === 'insufficient')
      ? { code: 'insufficient', label: '판단 불가 — 모든 구성이 평가 구간 거래 30회 미만' }
      : { code: 'unfit', label: '사용 부적합 — 미리 정한 기준을 통과한 구성이 없음' };

  let gitHead = '';
  try { gitHead = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
  const engineSha = sha256(['data', 'indicators', 'engine', 'metrics', 'hypotheses'].map((f) => readFileSync(join(ROOT, 'lib', 'bnf', `${f}.ts`), 'utf8')).join('\n'));
  const fundingLabel = funding ? `보조 열: Binance 공식 ${symbol} 펀딩비 반영(명목가는 15분봉 시가 근사)` : '미포함';
  const costBasis = costs === 'app' ? '실사용 비용 가정(시장가 0.06%+슬리피지 0.05%, 목표 지정가 0.02%) 반영, 펀딩비 제외' : '수수료·슬리피지 반영, 펀딩비 제외';

  const results = {
    meta: {
      id: outId, dataId, exchange: manifest.exchange, contract: manifest.contract, symbol, name: EXPERIMENTS[outId].name, desc: EXPERIMENTS[outId].desc,
      hypothesis, costs, periodMode, evalPeriod: evalKey,
      periods: periods.map(([key, label, from, to]) => ({ key, label, fromUtc: isoUtc(from), toUtc: Number.isFinite(to) ? isoUtc(to) : isoUtc(dataEndT) })),
      generatedAt: new Date().toISOString(), generator: 'scripts/bnf-backtest.ts', gitHead, engineSha256: engineSha,
      data: { firstUtc: manifest.range.firstUtc, lastBarOpenUtc: manifest.range.lastBarOpenUtc, bars: manifest.range.bars, sha256: manifest.normalized.sha256, gaps: manifest.gaps, source: manifest.source },
      firstSignalDayUtc: isoUtc(evalStart), oosFromUtc: isoUtc(periodMode === 'pre' ? evalStart : OOS_T), dataEndUtc: isoUtc(dataEndT),
      params: { ...params, maxHoldH: params.maxHoldMs / HOUR, cooldownH: params.cooldownMs / HOUR, smaDays: 25, quantileWindowDays: 365, quantile: 0.1, regimeSmaDays: 200, atr: '4h Wilder ATR14' },
      costBasis, funding: fundingLabel,
      notIncluded: ['미결제약정(OI)', '강제청산 데이터', '거래소 청산가·유지증거금 모델', ...(funding ? [] : ['펀딩비'])],
      leverageIdentical: levIdentical,
      disclaimer: hypothesis === 'funding'
        ? '펀딩비 음수 극단 역추세는 BNF 이격도와 별개의 연구 가설. 실거래 주문 기능 없음.'
        : '25일 이동평균 이격도를 쓰는 BNF형 연구 규칙이며 BNF 본인의 정확한 매매 알고리즘이 아님. 실거래 주문 기능 없음.',
      verdictNote: periodMode === 'pre' ? '판정의 개발 구간 일관성 항목에는 1차 실험(binance)의 같은 구성 전체 구간 결과를 넣음(사전등록 E1)' : null,
    },
    conclusion,
    configs,
  };
  const dir = join(ROOT, 'data', 'bnf', outId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results) + '\n');
  const csvOut = (rows: (string | number | null)[][]) => rows.map((x) => x.map((c) => (c == null ? '' : String(c))).join(',')).join('\n') + '\n';
  writeFileSync(join(dir, 'summary.csv'), csvOut([['experiment', 'tf', 'regime', 'leverage', 'period', 'trades', 'win_rate_pct', 'pf', 'avg_r', 'avg_hold_h', 'max_loss_usdt', 'max_loss_r',
    'mtm_mdd_pct', 'total_return_pct', 'max_consec_loss', 'fees_usdt', 'slippage_usdt', 'funding_usdt', 'return_with_funding_pct', 'avg_r_with_funding', 'sample_ok', 'skipped_wide_stop'], ...summaryRows]));
  writeFileSync(join(dir, 'trades.csv'), csvOut([['experiment', 'tf', 'regime', 'leverage', 'period', ...TRADE_COLUMNS], ...tradeRows]));
  writeFileSync(join(dir, 'monthly.csv'), csvOut([['experiment', 'tf', 'regime', 'leverage', 'period', 'month', 'return_pct', 'end_equity'], ...monthRows]));

  // 연구 페이지용 축약본(정적 파일 — 함수 실행 없음) + 실험 목록
  const pub = join(ROOT, 'public', 'bnf-lab-data');
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, `${outId}.json`), JSON.stringify(toView(results)) + '\n');
  const indexPath = join(ROOT, 'data', 'bnf', 'index.json');
  const index: { id: string; name: string; desc: string; conclusion: { code: string; label: string } }[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];
  const entry = { id: outId, name: EXPERIMENTS[outId].name, desc: EXPERIMENTS[outId].desc, conclusion };
  const next = [...index.filter((x) => x.id !== outId), entry].sort((a, b) => Object.keys(EXPERIMENTS).indexOf(a.id) - Object.keys(EXPERIMENTS).indexOf(b.id));
  writeFileSync(indexPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`\n${outId} 결론: ${conclusion.label} · 5x/10x 손익 동일: ${levIdentical} · 첫 신호 가능일 ${isoUtc(evalStart)}`);
}

main();
