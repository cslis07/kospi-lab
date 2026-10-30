/**
 * 종목 상세 '투자 지표 · 목표주가 · 동종업계 · 리포트' — 네이버 모바일 integration 응답을 화면용으로 정리.
 * (참고: 네이버페이 증권 종목 홈 · 토스증권 애널리스트 의견 · 인베스팅 동종업계 비교)
 * 계산은 표시용 괴리율(목표가 대비 현재가)뿐 — 값을 만들어내지 않고, 없는 필드는 null 로 둔다.
 * 비공식 API 라 필드가 바뀔 수 있다 → 형식이 다르면 빈 값.
 */
import { researchUrl } from './naverStock';

export interface InsightMetric { key: string; label: string; value: string }
export interface InsightConsensus {
  targetMean: number | null;
  /** 1(매도)~5(강력매수) 평균 — 네이버 recommMean */
  recommMean: number | null;
  /** 컨센서스 집계일 YYYY-MM-DD */
  date: string | null;
}
export interface InsightPeer { code: string; name: string; price: number; changeRate: number; marketCapEok: number | null; market: string | null }
export interface InsightReport { id: string; title: string; broker: string; date: string; url: string }
export interface StockInsight {
  metrics: InsightMetric[];
  consensus: InsightConsensus | null;
  peers: InsightPeer[];
  reports: InsightReport[];
}

/** "1,234" "+5.2%" "10.00배" "22,292원" → 숫자. 숫자가 없으면 null */
export function numOf(s: unknown): number | null {
  if (s == null) return null;
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "20261030" → "2026-10-30" */
const ymd = (s: unknown) => { const d = String(s ?? ''); return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d; };

/** 화면에 보일 지표 순서(코드 → 표시명). 시세(시가·고가 등)는 상단 가격 영역이 이미 보여 제외 */
export const METRIC_ORDER: [string, string][] = [
  ['per', 'PER'], ['cnsPer', '추정 PER'], ['pbr', 'PBR'], ['eps', 'EPS'], ['cnsEps', '추정 EPS'], ['bps', 'BPS'],
  ['dividendYieldRatio', '배당수익률'], ['dividend', '주당배당금'], ['foreignRate', '외국인 소진율'],
];

/** recommMean(1~5) → 말. 네이버 기준 4 이상 매수, 3 중립 */
export function opinionLabel(m: number | null): string | null {
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  if (m >= 4.5) return '강력매수';
  if (m >= 3.5) return '매수';
  if (m >= 2.5) return '중립';
  if (m >= 1.5) return '매도';
  return '강력매도';
}

/** 현재가 대비 목표가 괴리율(%) — 목표가가 현재가보다 얼마나 위/아래인지 */
export function upsidePct(target: number | null, price: number | null): number | null {
  if (!target || !price || price <= 0) return null;
  return ((target - price) / price) * 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseInsight(integ: any): StockInsight {
  const infos: { code?: string; value?: string }[] = Array.isArray(integ?.totalInfos) ? integ.totalInfos : [];
  const metrics: InsightMetric[] = [];
  for (const [code, label] of METRIC_ORDER) {
    const v = infos.find((i) => i.code === code)?.value;
    if (v && v !== '-' && v !== 'N/A' && numOf(v) != null) metrics.push({ key: code, label, value: v });
  }

  const c = integ?.consensusInfo;
  const targetMean = numOf(c?.priceTargetMean);
  const recommMean = numOf(c?.recommMean);
  const consensus: InsightConsensus | null = c && (targetMean || recommMean)
    ? { targetMean: targetMean || null, recommMean: recommMean || null, date: c.createDate ?? null }
    : null;

  const peersRaw: unknown[] = Array.isArray(integ?.industryCompareInfo) ? integ.industryCompareInfo : [];
  const peers: InsightPeer[] = [];
  for (const p of peersRaw as Record<string, unknown>[]) {
    const code = String(p.itemCode ?? '');
    const price = numOf(p.closePrice);
    if (!/^[0-9A-Z]{6}$/.test(code) || price == null) continue;
    // marketValue 는 백만원 단위 → 억
    const mv = numOf(p.marketValue);
    const ex = p.stockExchangeType as { nameKor?: string } | undefined;
    peers.push({ code, name: String(p.stockName ?? code), price, changeRate: numOf(p.fluctuationsRatio) ?? 0, marketCapEok: mv != null ? Math.round(mv / 100) : null, market: ex?.nameKor ?? null });
  }

  const repRaw: unknown[] = Array.isArray(integ?.researches) ? integ.researches : [];
  const reports: InsightReport[] = (repRaw as Record<string, unknown>[])
    .filter((r) => r.id != null && r.tit)
    .map((r) => ({ id: String(r.id), title: String(r.tit), broker: String(r.bnm ?? ''), date: ymd(r.wdt), url: researchUrl(String(r.id)) }));

  return { metrics, consensus, peers, reports };
}

/* ── 해외 종목(네이버 worldstock integration) ─────────────── */
export interface OverseasInsight {
  consensus: (InsightConsensus & { targetHigh: number | null; targetLow: number | null }) | null;
  overview: string | null;
  peers: { symbol: string; name: string; price: number; changeRate: number; marketCapUsd: number | null; dividendYield: number | null }[];
}

/** 티커 → 네이버 로이터 코드 후보(뉴욕은 그대로, 나스닥 .O, 그 외 .K/.N/.A) */
export const reutersCandidates = (symbol: string) => {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  return s ? [s, `${s}.O`, `${s}.K`, `${s}.N`, `${s}.A`] : [];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseOverseasInsight(integ: any): OverseasInsight {
  const c = integ?.consensusInfo;
  const targetMean = numOf(c?.priceTargetMean);
  const recommMean = numOf(c?.recommMean);
  const consensus = c && (targetMean || recommMean)
    ? { targetMean: targetMean || null, recommMean: recommMean || null, date: c.createDate ?? null, targetHigh: numOf(c.priceTargetHigh) || null, targetLow: numOf(c.priceTargetLow) || null }
    : null;
  const ov = integ?.corporateOverview ?? integ?.summaries?.summary;
  const raw: Record<string, unknown>[] = Array.isArray(integ?.industryCompareInfo?.globalStocks) ? integ.industryCompareInfo.globalStocks : [];
  const peers = raw.flatMap((p) => {
    const symbol = String(p.symbolCode ?? '');
    const price = numOf(p.closePrice);
    // 달러 종목만(소니·샤오미처럼 엔·홍콩달러 종목은 $ 표시·시총 단위가 어긋나고 상세 이동도 안 됨)
    const cur = (p.currencyType as { code?: string } | undefined)?.code;
    if (!symbol || price == null || (cur && cur !== 'USD')) return [];
    const mv = numOf(p.marketValueRaw);
    return [{ symbol, name: String(p.stockName ?? symbol), price, changeRate: numOf(p.fluctuationsRatio) ?? 0, marketCapUsd: mv || null, dividendYield: numOf(p.dividendYield) }];
  });
  return { consensus, overview: typeof ov === 'string' && ov.trim() ? ov.trim() : null, peers };
}
