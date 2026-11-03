/**
 * BNF 연구 페이지(/bnf-lab)용 결과 모델 — scripts/bnf-backtest.ts 가 results.json 을 화면에 필요한 만큼 줄여
 * public/bnf-lab-data/<실험 ID>.json 으로 쓴다(정적 파일, 함수 실행 없음).
 * 5x·10x 손익이 같으면(leverageIdentical) 10x 의 월별·곡선·거래 목록은 빼고 5x 것을 함께 쓴다.
 */
export type ExitKey = 'target' | 'stop' | 'stop_gap' | 'time' | 'data_end';

export interface SummarySlim {
  trades: number; wins: number; winRate: number | null; pf: number | null; avgR: number | null; avgHoldH: number | null;
  maxLossUsdt: number | null; maxLossR: number | null; mddPct: number | null; totalReturnPct: number | null; finalEquity: number | null;
  maxConsecLoss: number; feesTotal: number | null; slipTotal: number | null; fundingTotal: number | null;
  exitReasons: Record<ExitKey, number>;
  worstMaePct: number | null; cappedTrades: number;
  skipped: { wideStop: number; busy: number; cooldown: number; noAtr: number; noBar: number };
  signalsInWindow: number; sufficient: boolean;
}
export interface FundingSlim { totalReturnPct: number | null; avgR: number | null; pf: number | null; mddPct: number | null; fundingTotal: number | null; fundingIncomplete: number }
export interface DiagSlim {
  byReason: Record<ExitKey, { n: number; avgR: number | null }>;
  mfeBuckets: [string, number][]; maeBuckets: [string, number][];
  avgMfeR: number | null; avgMaeR: number | null; reached1RThenLost: number; timeExitAvgR: number | null;
}
/** [진입, 청산, 사유, 진입가, 손절, 목표, 청산가, 순손익, R, 보유h, MAE%, 펀딩] */
export type TradeRowView = [string, string, string, number, number, number, number, number, number, number, number, number | null];

interface PeriodRaw { entryFromUtc: string; entryToUtc: string; summary: SummarySlim; withFunding: FundingSlim | null; monthly: [string, number | null][]; diag: DiagSlim }
export interface MetaView {
  id: string; dataId: string; exchange: string; contract: string; symbol: string; name: string; desc: string;
  hypothesis: string; costs: string; periodMode: string; evalPeriod: string;
  periods: { key: string; label: string; fromUtc: string; toUtc: string }[];
  generatedAt: string; gitHead: string; engineSha256: string;
  data: { firstUtc: string; lastBarOpenUtc: string; bars: number; sha256: string; gaps: { afterUtc: string; nextUtc: string; missing: number }[]; source: string };
  firstSignalDayUtc: string; oosFromUtc: string; dataEndUtc: string;
  params: Record<string, unknown>; costBasis: string; funding: string; notIncluded: string[]; leverageIdentical: boolean; disclaimer: string;
  verdictNote: string | null;
}
interface ResultsFile {
  meta: MetaView;
  conclusion: { code: string; label: string };
  configs: {
    key: string; tf: string; regime: string; regimeLabel: string; leverage: number; signals: number;
    periods: Record<string, PeriodRaw>;
    verdict: string; verdictLabel: string; curve: [number, number][]; evalTrades: TradeRowView[];
  }[];
}

export interface PeriodView { from: string; to: string; s: SummarySlim; f: FundingSlim | null; monthly: [string, number | null][] | null; diag: DiagSlim | null }
export interface ConfigView {
  key: string; tf: string; regime: string; regimeLabel: string; leverage: number; signals: number; verdict: string; verdictLabel: string;
  periods: Record<string, PeriodView>;
  curve: [number, number][] | null; evalTrades: TradeRowView[] | null;
}
export interface ExperimentView { meta: MetaView; conclusion: { code: string; label: string }; configs: ConfigView[] }
/** 실험 목록(data/bnf/index.json) */
export interface ExperimentIndexItem { id: string; name: string; desc: string; conclusion: { code: string; label: string } }

export function toView(raw: unknown): ExperimentView {
  const r = raw as ResultsFile;
  const ident = r.meta.leverageIdentical;
  return {
    meta: r.meta, conclusion: r.conclusion,
    configs: r.configs.map((c) => {
      const keep = !ident || c.leverage === 5;
      const periods = Object.fromEntries(Object.entries(c.periods).map(([p, x]) =>
        [p, { from: x.entryFromUtc, to: x.entryToUtc, s: x.summary, f: x.withFunding, monthly: keep ? x.monthly : null, diag: keep ? x.diag : null }]));
      return { key: c.key, tf: c.tf, regime: c.regime, regimeLabel: c.regimeLabel, leverage: c.leverage, signals: c.signals, verdict: c.verdict, verdictLabel: c.verdictLabel, periods, curve: keep ? c.curve : null, evalTrades: keep ? c.evalTrades : null };
    }),
  };
}
