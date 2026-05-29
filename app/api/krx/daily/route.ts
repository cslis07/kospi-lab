/**
 * KRX 일별매매정보 API
 * Spec 1 (KOSPI): /sto/stk_bydd_trd
 * Spec 2 (KOSDAQ): /sto/ksq_bydd_trd
 *
 * 사용법: GET /api/krx/daily?codes=005930,086520
 * 반환:  { "005930": { close, changeRate, volume, marketCap, ... } }
 */
import { NextRequest, NextResponse } from 'next/server';

const KRX_KEY  = process.env.KRX_API_KEY ?? 'A4812703746143C1BB6D826E1057EFD984251A32';
const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const DAILY_TTL = 60 * 60 * 1000; // 1시간 캐시

export interface KrxDailyData {
  date: string;
  name: string;
  market: string;
  close: number;        // 종가 (원)
  change: number;       // 전일대비 (원)
  changeRate: number;   // 등락률 (%)
  open: number;         // 시가
  high: number;         // 고가
  low: number;          // 저가
  volume: number;       // 거래량 (주)
  tradingValue: number; // 거래대금 (원)
  marketCap: number;    // 시가총액 (원) — KRX 단위: 백만원 → ×1,000,000
  shares: number;       // 상장주식수
}

// 파싱 헬퍼
function n(s: string): number {
  if (!s || s === '-') return 0;
  return Number(s.replace(/,/g, '')) || 0;
}

// ── 날짜 ────────────────────────────────────────────────────────────────────
function recentTradingDay(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  if (day === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── 캐시: 날짜 → Map<단축코드, KrxDailyData> ──────────────────────────────
const _dailyCache = new Map<string, { map: Map<string, KrxDailyData>; ts: number }>();

async function fetchDailyMarket(
  endpoint: string,
  basDd: string,
): Promise<Map<string, KrxDailyData>> {
  try {
    const res = await fetch(`${KRX_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'AUTH_KEY': KRX_KEY,
      },
      body: JSON.stringify({ basDd }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = json?.OutBlock_1 ?? [];
    const map = new Map<string, KrxDailyData>();
    for (const r of rows) {
      const code = r.ISU_CD ?? '';           // 일별매매정보의 ISU_CD = 단축코드
      if (!code || code.length !== 6) continue;
      map.set(code, {
        date:         r.BAS_DD    ?? '',
        name:         (r.ISU_NM  ?? '').trim(),
        market:       r.MKT_NM   ?? '',
        close:        n(r.TDD_CLSPRC),
        change:       n(r.CMPPREVDD_PRC),
        changeRate:   Number(r.FLUC_RT ?? 0),
        open:         n(r.TDD_OPNPRC),
        high:         n(r.TDD_HGPRC),
        low:          n(r.TDD_LWPRC),
        volume:       n(r.ACC_TRDVOL),
        tradingValue: n(r.ACC_TRDVAL),
        // KRX 시가총액 단위: 백만원
        marketCap:    n(r.MKTCAP) * 1_000_000,
        shares:       n(r.LIST_SHRS),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getDailyMap(basDd: string): Promise<Map<string, KrxDailyData>> {
  const cached = _dailyCache.get(basDd);
  if (cached && Date.now() - cached.ts < DAILY_TTL) return cached.map;

  const [kospi, kosdaq] = await Promise.all([
    fetchDailyMarket('sto/stk_bydd_trd', basDd),
    fetchDailyMarket('sto/ksq_bydd_trd', basDd),
  ]);
  const merged = new Map([...kospi, ...kosdaq]);
  if (merged.size > 0) _dailyCache.set(basDd, { map: merged, ts: Date.now() });
  return merged;
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const codes = (req.nextUrl.searchParams.get('codes') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (!codes.length) return NextResponse.json({});

  const basDd = recentTradingDay();
  const map   = await getDailyMap(basDd);

  const result: Record<string, KrxDailyData> = {};
  for (const code of codes) {
    const item = map.get(code);
    if (item) result[code] = item;
  }

  return NextResponse.json(result);
}
