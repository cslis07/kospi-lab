/**
 * 경제지표(거시) — FRED 공식 시계열로 실제값·이전값·변화·히스토리를 모은다.
 * 인베스팅 지표 페이지 스타일(발표치·추세)이되, '예상치(컨센서스)'는 무료 소스가 없어 생략하고
 * 전월/전년 대비·추세로 대신한다. FRED 는 공식 발표치라 실시간이 아님(기준일 표기).
 */

export type Periodicity = 'monthly' | 'daily';

export interface MacroPoint { date: string; value: number }

export interface MacroIndicator {
  id: string;
  fred: string;
  label: string;
  country: 'US' | 'KR';
  unit: string;
  periodicity: Periodicity;
  decimals: number;
  desc: string;        // 지표 설명
  impact: string;      // 코인·주식에 주는 영향(앱 프레이밍)
  schedule: string;    // 발표 주기(큐레이션 — FRED는 발표일정 API가 따로라 문구로)
  latest: MacroPoint | null;
  prev: MacroPoint | null;
  changePct: number | null;   // 월간 = 바로 앞 달 대비 %(앞 달이 비면 null), 일간 = 직전 영업일 대비 %
  yoyPct: number | null;      // 전년동월대비 %(월간만) — 날짜로 12개월 전 같은 달을 찾는다(빈 달이 있어도 어긋나지 않게)
  /** yoyPct 계산 계열: 'nsa' = 계절조정 전 계열(BLS 헤드라인과 같은 기준), 'same' = 표시 지수와 같은 계열 */
  yoyBasis: 'nsa' | 'same' | null;
  history: MacroPoint[];      // 과거→최신(차트·표용)
}

interface Cfg {
  id: string; fred: string; label: string; country: 'US' | 'KR';
  unit: string; periodicity: Periodicity; decimals: number;
  desc: string; impact: string; schedule: string;
  /** 전년동월대비 전용 계열(계절조정 전) — 공식 헤드라인 YoY 와 같은 기준. 없으면 표시 계열로 계산 */
  yoyFred?: string;
}

export const MACRO_CFG: Cfg[] = [
  {
    id: 'cpi', fred: 'CPIAUCSL', yoyFred: 'CPIAUCNS', label: '미국 소비자물가 (CPI)', country: 'US',
    unit: '지수', periodicity: 'monthly', decimals: 2,
    desc: '미국 소비자가 사는 상품·서비스의 평균 물가 수준(지수, 계절조정). 흔히 말하는 물가상승률은 1년 전 같은 달 대비(YoY)이며, 여기서는 BLS 헤드라인과 같은 계절조정 전 지수로 계산한다.',
    impact: '예상보다 높으면 금리 인상·고금리 장기화 압력 → 코인·주식에 맞바람. 낮으면 인하 기대 → 순풍.',
    schedule: '매월 중순, 미 노동통계국(BLS)이 전월분 발표',
  },
  {
    id: 'ppi', fred: 'PPIFIS', yoyFred: 'PPIFID', label: '미국 생산자물가 (PPI)', country: 'US',
    unit: '지수', periodicity: 'monthly', decimals: 2,
    desc: '생산자가 출하할 때 받는 가격(최종수요 기준). 기업 비용 → 소비자물가로 전이돼 CPI의 선행 성격을 띤다.',
    impact: 'CPI와 함께 물가·금리 경로를 가늠. 서프라이즈면 금리 기대가 움직이며 위험자산에 파급된다.',
    schedule: '매월 중순(CPI 전후), BLS가 전월분 발표',
  },
  {
    id: 'dxy', fred: 'DTWEXBGS', label: '달러지수 (광의, Fed)', country: 'US',
    unit: '지수', periodicity: 'daily', decimals: 2,
    desc: '주요 교역국 통화 대비 달러 가치(연준 광의 달러지수). ICE DXY와 구성은 다르지만 방향은 유사하다.',
    impact: '달러 강세는 보통 위험자산·원자재·신흥국에 맞바람이고, 비트코인에도 역방향 경향이 있다.',
    schedule: '영업일 일별 갱신(FRED 기준 1~2일 지연)',
  },
  {
    id: 'wti', fred: 'DCOILWTICO', label: '국제유가 (WTI)', country: 'US',
    unit: 'USD/배럴', periodicity: 'daily', decimals: 2,
    desc: '서부텍사스산 원유 현물가격. 에너지·물가·운송비의 바로미터이며 지정학 리스크에 민감하다.',
    impact: '유가 급등은 인플레를 자극해 금리 부담으로, 급락은 수요 둔화(경기) 신호일 수 있다.',
    schedule: '영업일 일별 갱신(FRED 기준 1~5일 지연)',
  },
  {
    id: 'usdkrw', fred: 'DEXKOUS', label: '원/달러 환율', country: 'KR',
    unit: '원', periodicity: 'daily', decimals: 2,
    desc: '1달러당 원화 가치. 외국인 자금 유출입·수출입·국내 증시 수급과 직접 연결된다.',
    impact: '환율 급등(원 약세)은 외국인 매도·증시 부담 요인, 급락(원 강세)은 그 반대다.',
    schedule: '영업일 일별 갱신(FRED 기준 1~2일 지연)',
  },
  {
    id: 'nasdaq', fred: 'NASDAQCOM', label: '나스닥 종합지수', country: 'US',
    unit: '포인트', periodicity: 'daily', decimals: 2,
    desc: '미국 나스닥 시장 전체 종목의 시가총액 가중 지수. 애플·엔비디아 등 기술주 비중이 커 위험자산·성장주 심리의 바로미터다.',
    impact: '나스닥 강세는 위험 선호(코인·성장주 순풍), 급락은 위험 회피 신호. 금리·달러와 함께 보면 시장 맥락이 잡힌다.',
    schedule: '미국 증시 영업일 마감치(FRED 기준 1~2일 지연)',
  },
];

async function fredObs(id: string, limit: number): Promise<MacroPoint[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`,
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { observations?: { date: string; value: string }[] };
    return (j.observations ?? [])
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((o) => Number.isFinite(o.value))
      .reverse(); // 과거→최신
  } catch {
    return [];
  }
}

/** 'YYYY-MM' 을 n개월 옮긴 'YYYY-MM' */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** 월간 계열에서 'YYYY-MM' 관측치(없으면 null) — 배열 위치가 아니라 날짜로 찾는다 */
export function pointAtMonth(points: MacroPoint[], ym: string): MacroPoint | null {
  return points.find((p) => p.date.slice(0, 7) === ym) ?? null;
}
const pct = (a: number, b: number) => (b !== 0 && Number.isFinite(a) && Number.isFinite(b) ? ((a - b) / b) * 100 : null);

/**
 * ⚠ 월간 계열은 발표가 빠진 달이 있다(예: 2025-10 CPI — 미 정부 셧다운으로 미발표, FRED 값 '.').
 *   인덱스(-2, -13)로 비교하면 빈 달 때문에 2개월 전·13개월 전과 비교하게 된다 → 반드시 날짜로 맞춘다.
 */
export function buildIndicator(cfg: Cfg, points: MacroPoint[], yoyPoints?: MacroPoint[]): MacroIndicator {
  const chartN = cfg.periodicity === 'monthly' ? 24 : 60;
  const history = points.slice(-chartN);
  const latest = points.at(-1) ?? null;
  let prev: MacroPoint | null;
  let yoyPct: number | null = null;
  let yoyBasis: MacroIndicator['yoyBasis'] = null;
  if (cfg.periodicity === 'monthly' && latest) {
    const ym = latest.date.slice(0, 7);
    prev = pointAtMonth(points, shiftMonth(ym, -1));
    const base = yoyPoints?.length ? yoyPoints : points;
    const now = pointAtMonth(base, ym), ago = pointAtMonth(base, shiftMonth(ym, -12));
    if (now && ago) { yoyPct = pct(now.value, ago.value); yoyBasis = yoyPoints?.length ? 'nsa' : 'same'; }
  } else {
    prev = points.at(-2) ?? null;
  }
  const changePct = latest && prev ? pct(latest.value, prev.value) : null;
  return { ...cfg, latest, prev, changePct, yoyPct, yoyBasis, history };
}

/** 5개 지표 전부 수집(실패한 지표는 데이터 없이 반환 — 그레이스풀) */
export async function fetchMacroIndicators(): Promise<MacroIndicator[]> {
  const jobs = MACRO_CFG.map(async (cfg) => {
    const limit = cfg.periodicity === 'monthly' ? 36 : 120;
    const [pts, yoyPts] = await Promise.all([fredObs(cfg.fred, limit), cfg.yoyFred ? fredObs(cfg.yoyFred, limit) : Promise.resolve(undefined)]);
    return buildIndicator(cfg, pts, yoyPts);
  });
  return Promise.all(jobs);
}
