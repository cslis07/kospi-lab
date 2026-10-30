/**
 * 종목 실적 추이(분기·연간) — 네이버 finance/quarter·annual 응답을 차트용으로 정리. 국내·해외 공용.
 * (참고: 네이버페이 증권 '재무' 탭 · 토스증권 실적 · Koyfin/Macrotrends 다년 재무 차트)
 * 국내: financeInfo.{trTitleList,rowList} · 매출액/영업이익/당기순이익 = 억원, isConsensus='Y' 는 증권사 추정치.
 * 해외: {unit,trTitleList,rowList} 최상위 · 단위 USD 백만 · 영업이익 대신 EBIT.
 * 값이 '-'·없음이면 null — 0으로 만들지 않는다. 영업이익률은 원본에 없으면(해외) 영업이익/매출로 계산.
 */
import { numOf } from './stockInsight';

export interface FinPeriod { key: string; label: string; estimate: boolean; revenue: number | null; op: number | null; net: number | null; opMargin: number | null; eps: number | null; roe: number | null }
export interface StockFinance { unit: string; periods: FinPeriod[] }

type Row = { title?: string; columns?: Record<string, { value?: string } | undefined> };
type Title = { key?: string; title?: string; isConsensus?: string };

/** "2026.09." · "2026.06.27" → "26.09" / 연간이면 "2026" */
function labelOf(t: string, annual: boolean) {
  const m = t.match(/(\d{4})\.(\d{2})/);
  if (!m) return t;
  return annual ? m[1] : `${m[1].slice(2)}.${m[2]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFinance(raw: any, annual: boolean): StockFinance {
  const src = raw?.financeInfo ?? raw;
  const titles: Title[] = Array.isArray(src?.trTitleList) ? src.trTitleList : [];
  const rows: Row[] = Array.isArray(src?.rowList) ? src.rowList : [];
  const unit = typeof raw?.unit === 'string' ? 'USD 백만' : '억원';
  const row = (...names: string[]) => rows.find((r) => r.title && names.includes(r.title.trim()));
  const val = (r: Row | undefined, key: string) => {
    const v = r?.columns?.[key]?.value;
    return v == null || v === '-' || v === '' ? null : numOf(v);
  };
  const rev = row('매출액'), op = row('영업이익', 'EBIT'), net = row('당기순이익'), om = row('영업이익률'), eps = row('EPS'), roe = row('ROE');
  const periods = titles.filter((t) => t.key).map((t) => {
    const k = String(t.key);
    const revenue = val(rev, k), opv = val(op, k);
    const margin = val(om, k) ?? (revenue && opv != null ? Math.round((opv / revenue) * 10000) / 100 : null);
    return { key: k, label: labelOf(String(t.title ?? k), annual), estimate: t.isConsensus === 'Y', revenue, op: opv, net: val(net, k), opMargin: margin, eps: val(eps, k), roe: val(roe, k) };
  }).filter((p) => p.revenue != null || p.op != null);
  return { unit, periods };
}

/** 같은 분기 1년 전 대비 증감률(분기) · 전년 대비(연간) — 표시용 */
export function yoy(periods: FinPeriod[], i: number, annual: boolean, field: 'revenue' | 'op' = 'op'): number | null {
  const back = annual ? 1 : 4;
  const cur = periods[i]?.[field], prev = periods[i - back]?.[field];
  if (cur == null || prev == null || prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

/* ── 종목 뉴스 · 공시(네이버 모바일) ───────────────────── */
export interface StockNewsItem { id: string; title: string; source: string; at: string; url: string }
export interface StockDisclosure { id: string; title: string; at: string; url: string }

/** "202610301654" → "2026-10-30 16:54" */
const dt = (s: unknown) => { const d = String(s ?? ''); return /^\d{12}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10)}` : d.replace('T', ' ').slice(0, 16); };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStockNews(raw: any): StockNewsItem[] {
  const groups: { items?: Record<string, unknown>[] }[] = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return groups.flatMap((g) => (g.items ?? []).slice(0, 1)).flatMap((it) => {
    const url = String(it.mobileNewsUrl ?? '');
    const title = String(it.titleFull ?? it.title ?? '').trim();
    if (!url.startsWith('https://') || !title || seen.has(url)) return [];
    seen.add(url);
    return [{ id: String(it.id ?? url), title, source: String(it.officeName ?? ''), at: dt(it.datetime), url }];
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseDisclosures(raw: any, code: string): StockDisclosure[] {
  const list: Record<string, unknown>[] = Array.isArray(raw) ? raw : [];
  return list.filter((d) => d.disclosureId != null && d.title).map((d) => ({
    id: String(d.disclosureId), title: String(d.title).trim(), at: dt(d.datetime),
    url: `https://m.stock.naver.com/domestic/stock/${code}/disclosure/${d.disclosureId}`,
  }));
}
