/**
 * BNF형 연구 페이지(/bnf-lab)용 결과 모델 — scripts/bnf-backtest.ts 가 쓴 results.json 을 화면에 필요한 만큼만 줄인다.
 * 5x·10x 손익이 같으면(leverageIdentical) 10x 의 월별·곡선·거래 목록은 빼고 5x 것을 함께 쓴다.
 */
export type PeriodKey = 'dev' | 'oos' | 'full';

export interface SummarySlim {
  trades: number; wins: number; winRate: number | null; pf: number | null; avgR: number | null; avgHoldH: number | null;
  maxLossUsdt: number | null; maxLossR: number | null; mddPct: number | null; totalReturnPct: number | null; finalEquity: number | null;
  maxConsecLoss: number; feesTotal: number | null; slipTotal: number | null; fundingTotal: number | null;
  exitReasons: Record<'target' | 'stop' | 'stop_gap' | 'time' | 'data_end', number>;
  worstMaePct: number | null; cappedTrades: number;
  skipped: { wideStop: number; busy: number; cooldown: number; noAtr: number; noBar: number };
  signalsInWindow: number; sufficient: boolean;
}
export interface FundingSlim { totalReturnPct: number | null; avgR: number | null; pf: number | null; mddPct: number | null; fundingTotal: number | null; fundingIncomplete: number }
/** [진입, 청산, 사유, 진입가, 손절, 목표, 청산가, 순손익, R, 보유h, MAE%, 펀딩] */
export type TradeRowView = [string, string, string, number, number, number, number, number, number, number, number, number | null];

interface ResultsFile {
  meta: {
    exchange: string; contract: string; generatedAt: string; gitHead: string; engineSha256: string;
    data: { firstUtc: string; lastBarOpenUtc: string; bars: number; sha256: string; gaps: { afterUtc: string; nextUtc: string; missing: number }[]; source: string };
    firstSignalDayUtc: string; oosFromUtc: string; dataEndUtc: string;
    params: Record<string, unknown>; costBasis: string; funding: string; notIncluded: string[]; leverageIdentical: boolean; disclaimer: string;
  };
  conclusion: { code: string; label: string };
  configs: {
    key: string; tf: string; regime: string; regimeLabel: string; leverage: number; signals: number;
    periods: Record<PeriodKey, { entryFromUtc: string; entryToUtc: string; summary: SummarySlim; withFunding: FundingSlim | null; monthly: [string, number | null][] }>;
    verdict: string; verdictLabel: string; curve: [number, number][]; oosTrades: TradeRowView[];
  }[];
}

export interface ConfigView {
  key: string; tf: string; regime: string; regimeLabel: string; leverage: number; signals: number; verdict: string; verdictLabel: string;
  periods: Record<PeriodKey, { from: string; to: string; s: SummarySlim; f: FundingSlim | null; monthly: [string, number | null][] | null }>;
  curve: [number, number][] | null; oosTrades: TradeRowView[] | null;
}
export interface ExchangeView {
  id: string; name: string; contract: string; conclusion: { code: string; label: string };
  meta: Omit<ResultsFile['meta'], 'exchange' | 'contract'>;
  configs: ConfigView[];
}

export function toView(raw: unknown, name: string): ExchangeView {
  const r = raw as ResultsFile;
  const ident = r.meta.leverageIdentical;
  const { exchange, contract, ...meta } = r.meta;
  return {
    id: exchange, name, contract, conclusion: r.conclusion, meta,
    configs: r.configs.map((c) => {
      const keep = !ident || c.leverage === 5;
      const periods = Object.fromEntries((['dev', 'oos', 'full'] as PeriodKey[]).map((p) => {
        const x = c.periods[p];
        return [p, { from: x.entryFromUtc, to: x.entryToUtc, s: x.summary, f: x.withFunding, monthly: keep ? x.monthly : null }];
      })) as ConfigView['periods'];
      return { key: c.key, tf: c.tf, regime: c.regime, regimeLabel: c.regimeLabel, leverage: c.leverage, signals: c.signals, verdict: c.verdict, verdictLabel: c.verdictLabel, periods, curve: keep ? c.curve : null, oosTrades: keep ? c.oosTrades : null };
    }),
  };
}
