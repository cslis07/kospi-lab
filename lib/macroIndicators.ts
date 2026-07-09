/**
 * 필수 경제지표 실측값 자동 수집.
 *  - 미국 CPI: BLS 공개 API (키 불필요, YoY 계산)
 *  - 가계부채: 한국은행 ECOS 가계신용 (ECOS_API_KEY 없으면 sample 키)
 *  - 부동산: 한국은행 ECOS 주택매매가격지수(KB)
 *  - 반도체 수출: 관세청 수출입실적 (CUSTOMS_API_KEY 필요, 없으면 null)
 *
 * 월/분기 데이터라 6시간 캐시. 실패 시 null → UI는 "체크필요"로 폴백.
 */

export interface MacroValue {
  value: number;          // 대표값
  unit: string;           // 표시 단위
  label: string;          // 기준 시점 (예: "2026.05")
  change: number | null;  // 전기 대비 변화(%)
  changeLabel: string;    // "YoY" | "MoM" | "QoQ"
  source: string;
}

const CACHE_TTL = 6 * 60 * 60 * 1000;
const _cache = new Map<string, { v: MacroValue | null; ts: number }>();
async function cached(key: string, fn: () => Promise<MacroValue | null>): Promise<MacroValue | null> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.v;
  const v = await fn().catch(() => null);
  _cache.set(key, { v, ts: Date.now() });
  return v;
}

/* ── 미국 CPI (BLS 공개 API, 키 불필요) ──────────────── */
async function _usCpi(): Promise<MacroValue | null> {
  const res = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0', {
    cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  const j = await res.json();
  const data = j?.Results?.series?.[0]?.data ?? [];
  if (data.length < 13) return null;
  const latest = data[0], yearAgo = data[12];
  const yoy = (Number(latest.value) / Number(yearAgo.value) - 1) * 100;
  const monthNum = String(latest.period).replace('M', '');
  return {
    value: Math.round(yoy * 100) / 100, unit: '% YoY',
    label: `${latest.year}.${monthNum}`, change: null, changeLabel: 'YoY',
    source: 'BLS',
  };
}

/* ── ECOS 공통 ───────────────────────────────────────── */
const ECOS_KEY = process.env.ECOS_API_KEY || 'sample';
async function ecosRows(statCode: string, cycle: 'Q' | 'M', start: string, end: string, count = 10) {
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${ECOS_KEY}/json/kr/1/${count}/${statCode}/${cycle}/${start}/${end}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const j = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (j?.StatisticSearch?.row ?? []) as any[];
}

/* 가계부채 = 가계신용 총액(십억원 → 조원). sample키 10건 제한 → 최댓값 행이 총액 */
async function _householdDebt(): Promise<MacroValue | null> {
  const now = new Date();
  const yy = now.getFullYear();
  const rows = await ecosRows('151Y001', 'Q', `${yy - 1}Q1`, `${yy}Q4`, 10);
  if (!rows.length) return null;
  // 최신 분기의 행들 중 최댓값 = 가계신용 총액
  const times = [...new Set(rows.map((r) => r.TIME))].sort();
  const latestTime = times[times.length - 1];
  const prevTime = times[times.length - 2];
  const maxAt = (t: string) => Math.max(...rows.filter((r) => r.TIME === t).map((r) => Number(r.DATA_VALUE) || 0));
  const cur = maxAt(latestTime); const prev = prevTime ? maxAt(prevTime) : null;
  if (!cur) return null;
  const q = String(latestTime).slice(4);
  return {
    value: Math.round(cur / 1000), unit: '조원',
    label: `${String(latestTime).slice(0, 4)} ${q}`,
    change: prev ? Math.round(((cur / prev - 1) * 100) * 100) / 100 : null, changeLabel: 'QoQ',
    source: '한국은행 ECOS',
  };
}

/* 부동산 = 주택매매가격지수(KB) 총지수 */
async function _realEstate(): Promise<MacroValue | null> {
  const now = new Date();
  const ym = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const start = new Date(now); start.setMonth(start.getMonth() - 14);
  const rows = await ecosRows('901Y062', 'M', ym(start), ym(now), 10);
  const tot = rows.filter((r) => String(r.ITEM_NAME1).includes('총지수'));
  if (tot.length < 1) return null;
  const sorted = tot.sort((a, b) => (a.TIME < b.TIME ? -1 : 1));
  const cur = sorted[sorted.length - 1]; const prev = sorted[sorted.length - 2];
  const t = String(cur.TIME);
  return {
    value: Math.round(Number(cur.DATA_VALUE) * 100) / 100, unit: '지수',
    label: `${t.slice(0, 4)}.${t.slice(4, 6)}`,
    change: prev ? Math.round((Number(cur.DATA_VALUE) / Number(prev.DATA_VALUE) - 1) * 100 * 100) / 100 : null, changeLabel: 'MoM',
    source: '한국은행 ECOS(KB)',
  };
}

/* 반도체 수출 = 관세청 품목별 수출실적(HS 8542). 키 없으면 null */
async function _semiconExport(): Promise<MacroValue | null> {
  const key = process.env.CUSTOMS_API_KEY;
  if (!key) return null;
  const now = new Date();
  const ym = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const start = new Date(now); start.setMonth(start.getMonth() - 13);
  const url = `https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList?serviceKey=${encodeURIComponent(key)}&strtYymm=${ym(start)}&endYymm=${ym(now)}&hsSgn=8542&type=json`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const j = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (j?.response?.body?.items?.item ?? []) as any[];
  const monthly = items.filter((x) => x.year && String(x.year).length === 6).sort((a, b) => (a.year < b.year ? -1 : 1));
  if (monthly.length < 2) return null;
  const cur = monthly[monthly.length - 1];
  const yearAgo = monthly.find((x) => Number(x.year) === Number(cur.year) - 100);
  const expUsd = Number(cur.expDlr) || 0; // 수출 달러
  if (!expUsd) return null;
  const yoy = yearAgo && Number(yearAgo.expDlr) ? (expUsd / Number(yearAgo.expDlr) - 1) * 100 : null;
  return {
    value: Math.round(expUsd / 1e8) / 10, unit: '억달러',
    label: `${String(cur.year).slice(0, 4)}.${String(cur.year).slice(4, 6)}`,
    change: yoy !== null ? Math.round(yoy * 10) / 10 : null, changeLabel: 'YoY',
    source: '관세청',
  };
}

/* ── 통합 ────────────────────────────────────────────── */
export async function fetchMacroIndicators(): Promise<{
  usCpi: MacroValue | null; householdDebt: MacroValue | null;
  realEstate: MacroValue | null; semiconExport: MacroValue | null;
}> {
  const [usCpi, householdDebt, realEstate, semiconExport] = await Promise.all([
    cached('uscpi', _usCpi),
    cached('hhdebt', _householdDebt),
    cached('realestate', _realEstate),
    cached('semicon', _semiconExport),
  ]);
  return { usCpi, householdDebt, realEstate, semiconExport };
}
