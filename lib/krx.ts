/**
 * KRX 공식 오픈API 클라이언트 (data-dbg.krx.co.kr/svc/apis)
 * 인증: env KRX_API_KEY 필요. 키 없거나 만료 시 빈 결과 → 호출부에서 graceful 처리.
 *
 * 일별매매정보: /sto/stk_bydd_trd (KOSPI), /sto/ksq_bydd_trd (KOSDAQ)
 * 필드는 KRX _bydd_trd 계열 공통 규약: ISU_CD, ISU_NM, TDD_CLSPRC, FLUC_RT, ACC_TRDVAL ...
 */
const KRX_BASE  = 'https://data-dbg.krx.co.kr/svc/apis';
const KRX_KEY   = () => process.env.KRX_API_KEY ?? '';
const DAILY_TTL = 60 * 60 * 1000; // 1시간

export interface KrxDailyData {
  date: string;
  name: string;
  market: string;
  close: number;        // 종가 (원)
  change: number;       // 전일대비 (원)
  changeRate: number;   // 등락률 (%)
  open: number;
  high: number;
  low: number;
  volume: number;       // 거래량 (주)
  tradingValue: number; // 거래대금 (원)
  marketCap: number;    // 시가총액 (원) — KRX 단위 백만원 → ×1e6
  shares: number;
}

export function hasKrxKey(): boolean {
  return Boolean(process.env.KRX_API_KEY);
}

function n(s: unknown): number {
  if (s == null || s === '' || s === '-') return 0;
  return Number(String(s).replace(/,/g, '')) || 0;
}

// 최근 영업일 후보 (주말 제외) — 발표 지연·휴장 대비 여러 날 재시도
function candidateDays(count = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (out.length < count) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

async function fetchMarket(endpoint: string, basDd: string): Promise<Map<string, KrxDailyData>> {
  const map = new Map<string, KrxDailyData>();
  try {
    const res = await fetch(`${KRX_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'AUTH_KEY': KRX_KEY() },
      body: JSON.stringify({ basDd }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return map;
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = json?.OutBlock_1 ?? [];
    for (const r of rows) {
      const code = (r.ISU_CD ?? '').trim();
      if (!code || code.length !== 6) continue;
      map.set(code, {
        date:         r.BAS_DD ?? basDd,
        name:         (r.ISU_NM ?? '').trim(),
        market:       r.MKT_NM ?? '',
        close:        n(r.TDD_CLSPRC),
        change:       n(r.CMPPREVDD_PRC),
        changeRate:   Number(r.FLUC_RT ?? 0),
        open:         n(r.TDD_OPNPRC),
        high:         n(r.TDD_HGPRC),
        low:          n(r.TDD_LWPRC),
        volume:       n(r.ACC_TRDVOL),
        tradingValue: n(r.ACC_TRDVAL),
        marketCap:    n(r.MKTCAP), // KRX MKTCAP은 원 단위 (full)
        shares:       n(r.LIST_SHRS),
      });
    }
  } catch { /* 빈 맵 반환 */ }
  return map;
}

let _cache: { map: Map<string, KrxDailyData>; date: string; ts: number } | null = null;

/** 전종목(KOSPI+KOSDAQ) 최근 영업일 일별매매정보. 키 없거나 실패 시 빈 맵. */
export async function fetchKrxDailyMap(): Promise<{ map: Map<string, KrxDailyData>; date: string }> {
  if (_cache && Date.now() - _cache.ts < DAILY_TTL) {
    return { map: _cache.map, date: _cache.date };
  }
  if (!KRX_KEY()) return { map: new Map(), date: '' };

  for (const basDd of candidateDays(6)) {
    const [kospi, kosdaq] = await Promise.all([
      fetchMarket('sto/stk_bydd_trd', basDd),
      fetchMarket('sto/ksq_bydd_trd', basDd),
    ]);
    const merged = new Map([...kospi, ...kosdaq]);
    if (merged.size > 0) {
      _cache = { map: merged, date: basDd, ts: Date.now() };
      return { map: merged, date: basDd };
    }
  }
  return { map: new Map(), date: '' };
}

// ── 랭킹 ──────────────────────────────────────────────────────────────────────
export interface KrxRankItem {
  code: string;
  name: string;
  market: string;
  close: number;
  change: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
  marketCap: number;
}

export type RankKey = 'gainers' | 'losers' | 'value' | 'volume' | 'marketcap';

export interface KrxRankings {
  date: string;
  count: number;                          // 전체 종목 수
  rankings: Record<RankKey, KrxRankItem[]>;
}

function toItem(d: KrxDailyData, code: string): KrxRankItem {
  return {
    code, name: d.name, market: d.market,
    close: d.close, change: d.change, changeRate: d.changeRate,
    volume: d.volume, tradingValue: d.tradingValue, marketCap: d.marketCap,
  };
}

export async function fetchKrxRankings(top = 30): Promise<KrxRankings> {
  const { map, date } = await fetchKrxDailyMap();
  const all = [...map.entries()]
    .map(([code, d]) => toItem(d, code))
    .filter((x) => x.close > 0);

  // 상승/하락은 거래대금 1억 이상만 (동전주 노이즈 제거)
  const liquid = all.filter((x) => x.tradingValue >= 100_000_000);
  const byRate = liquid.length >= top ? liquid : all;

  return {
    date,
    count: all.length,
    rankings: {
      gainers:   [...byRate].sort((a, b) => b.changeRate - a.changeRate).slice(0, top),
      losers:    [...byRate].sort((a, b) => a.changeRate - b.changeRate).slice(0, top),
      value:     [...all].sort((a, b) => b.tradingValue - a.tradingValue).slice(0, top),
      volume:    [...all].sort((a, b) => b.volume - a.volume).slice(0, top),
      marketcap: [...all].sort((a, b) => b.marketCap - a.marketCap).slice(0, top),
    },
  };
}

// ── 범용 GET 호출 + 최근영업일 재시도 (지수·ETF·상품용) ─────────────────────
const _rawCache = new Map<string, { rows: Record<string, string>[]; date: string; ts: number }>();

async function krxRaw(path: string, basDd: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(`${KRX_BASE}/${path}?basDd=${basDd}`, {
      headers: { AUTH_KEY: KRX_KEY() },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.OutBlock_1 as Record<string, string>[]) ?? [];
  } catch { return []; }
}

async function krxRawRecent(path: string): Promise<{ rows: Record<string, string>[]; date: string }> {
  const c = _rawCache.get(path);
  if (c && Date.now() - c.ts < DAILY_TTL) return { rows: c.rows, date: c.date };
  if (!KRX_KEY()) return { rows: [], date: '' };
  for (const d of candidateDays(6)) {
    const rows = await krxRaw(path, d);
    if (rows.length) {
      _rawCache.set(path, { rows, date: d, ts: Date.now() });
      return { rows, date: d };
    }
  }
  return { rows: [], date: '' };
}

// ── 주요 지수 ──────────────────────────────────────────────────────────────────
export interface KrxIndex {
  name: string; close: number; change: number; changeRate: number;
  open: number; high: number; low: number; tradingValue: number;
}
const MAJOR_INDICES = ['코스피', '코스피 200', '코스닥', '코스닥 150', 'KRX 300', 'KRX 100'];

let _idxCache: { list: KrxIndex[]; date: string; ts: number } | null = null;

export async function fetchKrxIndices(): Promise<{ list: KrxIndex[]; date: string }> {
  if (!KRX_KEY()) return { list: [], date: '' };
  if (_idxCache && Date.now() - _idxCache.ts < DAILY_TTL) {
    return { list: _idxCache.list, date: _idxCache.date };
  }
  for (const d of candidateDays(6)) {
    const [kospi, kosdaq, krx] = await Promise.all([
      krxRaw('idx/kospi_dd_trd', d),
      krxRaw('idx/kosdaq_dd_trd', d),
      krxRaw('idx/krx_dd_trd', d),
    ]);
    const all = [...kospi, ...kosdaq, ...krx];
    if (!all.length) continue;
    const list: KrxIndex[] = [];
    for (const nm of MAJOR_INDICES) {
      const r = all.find((x) => (x.IDX_NM ?? '').trim() === nm);
      if (!r) continue;
      list.push({
        name: nm,
        close: n(r.CLSPRC_IDX), change: n(r.CMPPREVDD_IDX), changeRate: Number(r.FLUC_RT ?? 0),
        open: n(r.OPNPRC_IDX), high: n(r.HGPRC_IDX), low: n(r.LWPRC_IDX),
        tradingValue: n(r.ACC_TRDVAL),
      });
    }
    _idxCache = { list, date: d, ts: Date.now() };
    return { list, date: d };
  }
  return { list: [], date: '' };
}

// ── ETF 랭킹 ──────────────────────────────────────────────────────────────────
export interface KrxEtfItem {
  code: string; name: string; close: number; changeRate: number;
  nav: number; tradingValue: number; netAsset: number; baseIndex: string;
}
export async function fetchKrxEtf(top = 30): Promise<{ value: KrxEtfItem[]; gainers: KrxEtfItem[]; losers: KrxEtfItem[]; count: number; date: string }> {
  const { rows, date } = await krxRawRecent('etp/etf_bydd_trd');
  const items: KrxEtfItem[] = rows.map((r) => ({
    code: (r.ISU_CD ?? '').trim(),
    name: (r.ISU_NM ?? '').trim(),
    close: n(r.TDD_CLSPRC),
    changeRate: Number(r.FLUC_RT ?? 0),
    nav: n(r.NAV),
    tradingValue: n(r.ACC_TRDVAL),
    netAsset: n(r.INVSTASST_NETASST_TOTAMT),
    baseIndex: (r.IDX_IND_NM ?? '').trim(),
  })).filter((x) => x.close > 0);
  return {
    value:   [...items].sort((a, b) => b.tradingValue - a.tradingValue).slice(0, top),
    gainers: [...items].sort((a, b) => b.changeRate - a.changeRate).slice(0, top),
    losers:  [...items].sort((a, b) => a.changeRate - b.changeRate).slice(0, top),
    count: items.length, date,
  };
}

// ── 일반상품 (금·석유) ────────────────────────────────────────────────────────
export interface KrxCommodity { name: string; price: number; changeRate: number; tradingValue: number }
export async function fetchKrxCommodities(): Promise<{ gold: KrxCommodity[]; oil: KrxCommodity[]; date: string }> {
  const [g, o] = await Promise.all([
    krxRawRecent('gen/gold_bydd_trd'),
    krxRawRecent('gen/oil_bydd_trd'),
  ]);
  const gold: KrxCommodity[] = g.rows.map((r) => ({
    name: (r.ISU_NM ?? '').trim(), price: n(r.TDD_CLSPRC),
    changeRate: Number(r.FLUC_RT ?? 0), tradingValue: n(r.ACC_TRDVAL),
  })).filter((x) => x.price > 0);
  const oil: KrxCommodity[] = o.rows.map((r) => ({
    name: (r.OIL_NM ?? '').trim(), price: n(r.WT_AVG_PRC),
    changeRate: 0, tradingValue: n(r.ACC_TRDVAL),
  })).filter((x) => x.price > 0);
  return { gold, oil, date: g.date || o.date };
}
