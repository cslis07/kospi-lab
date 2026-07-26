/**
 * KRX 종목기본정보 API를 이용한 전체 종목 검색
 * Spec 5 (KOSPI): /sto/stk_isu_base_info
 * Spec 6 (KOSDAQ): /sto/ksq_isu_base_info
 *
 * 사용법: GET /api/krx/stock-list?q=삼성전자
 */
import { NextRequest, NextResponse } from 'next/server';

const KRX_KEY  = () => process.env.KRX_API_KEY ?? '';   // 하드코딩 폴백 금지 — 키는 env에서만
const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const LIST_TTL = 12 * 60 * 60 * 1000; // 12시간 캐시

// ── 종목 항목 ─────────────────────────────────────────────────────────────────
export interface KrxStockEntry {
  ticker: string;   // Yahoo Finance 형식: 005930.KS / 086520.KQ
  name: string;     // 한글 종목명
  abbr: string;     // 한글 종목약명
  engName: string;  // 영문 종목명
  code: string;     // 단축코드 6자리
  market: 'KOSPI' | 'KOSDAQ';
}

// ── 모듈 레벨 캐시 (Lambda warm 상태 유지) ───────────────────────────────────
let _cache: KrxStockEntry[] = [];
let _cacheTs = 0;
let _fetchingPromise: Promise<KrxStockEntry[]> | null = null;

// ── 최근 거래일 계산 (주말이면 금요일로) ──────────────────────────────────────
function recentTradingDay(): string {
  const d = new Date();
  // KRX는 당일 데이터를 장 마감 후 제공 → 전일 기준
  d.setDate(d.getDate() - 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2); // 일 → 금
  if (day === 6) d.setDate(d.getDate() - 1); // 토 → 금
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── KRX API 호출 ──────────────────────────────────────────────────────────────
async function fetchKrx(
  endpoint: string,
  suffix: 'KS' | 'KQ',
  basDd: string,
): Promise<KrxStockEntry[]> {
  if (!KRX_KEY()) return [];   // 키 없으면 빈 결과 — 호출부가 graceful 처리
  try {
    const res = await fetch(`${KRX_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'AUTH_KEY': KRX_KEY(),
      },
      body: JSON.stringify({ basDd }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = json?.OutBlock_1 ?? [];
    return rows
      .filter((r) => r.ISU_SRT_CD?.length === 6 && r.ISU_NM)
      .map((r) => ({
        ticker:  `${r.ISU_SRT_CD}.${suffix}`,
        name:    (r.ISU_NM    ?? '').trim(),
        abbr:    (r.ISU_ABBRV ?? '').trim(),
        engName: (r.ISU_ENG_NM ?? '').trim(),
        code:    r.ISU_SRT_CD,
        market:  suffix === 'KS' ? 'KOSPI' : 'KOSDAQ',
      }));
  } catch {
    return [];
  }
}

// ── 캐시 열기 (동시 요청 중복 방지) ──────────────────────────────────────────
async function getList(): Promise<KrxStockEntry[]> {
  if (_cache.length && Date.now() - _cacheTs < LIST_TTL) return _cache;

  // 이미 fetch 중이면 기다림
  if (_fetchingPromise) return _fetchingPromise;

  _fetchingPromise = (async () => {
    const basDd = recentTradingDay();
    const [kospi, kosdaq] = await Promise.all([
      fetchKrx('sto/stk_isu_base_info', 'KS', basDd),
      fetchKrx('sto/ksq_isu_base_info', 'KQ', basDd),
    ]);
    const merged = [...kospi, ...kosdaq];
    if (merged.length > 0) {
      _cache   = merged;
      _cacheTs = Date.now();
    }
    _fetchingPromise = null;
    return _cache;
  })();

  return _fetchingPromise;
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  const list = await getList();

  if (!q) {
    return NextResponse.json({ count: list.length, ready: list.length > 0 });
  }

  const lower = q.toLowerCase();
  const results = list.filter((s) =>
    s.name.includes(q) ||
    s.abbr.includes(q) ||
    s.code.startsWith(q) ||
    s.name.toLowerCase().includes(lower) ||
    s.engName.toLowerCase().includes(lower)
  ).slice(0, 8);

  return NextResponse.json(
    results.map((s) => ({ ticker: s.ticker, name: s.name, code: s.code, market: s.market }))
  );
}
