import { stableCard } from '@/lib/stablecoinCap';
import { krIndexLive, worldIndexLive, usdKrwLive, indexMinute, indexDaily, downsample, kstYmd, r2, type LiveQuote } from '@/lib/naverIndex';

/**
 * 홈 상단 지수 카드 — 코스피·코스닥·USD·S&P500·나스닥·다우존스 + 아시아·유럽 4종, **값은 전부 네이버 실시간**.
 * /api/home/indices 라우트와 홈 서버 첫 화면(app/page.tsx)이 같이 쓴다.
 * 스파크: 국내 = 당일(또는 최근 거래일) 분봉, 해외·환율 = 최근 1개월 일봉(+실시간 현재가를 끝점으로).
 * live=false 면 카드에 '장마감' 표기(해외는 한국 낮 시간엔 마감이 정상).
 *
 * `rv` = 실시간 값·분봉 fetch 의 데이터 캐시 초. 라우트는 기본(값 5초·분봉 20초),
 * ISR 페이지는 60 — 더 짧은 fetch 가 하나라도 있으면 페이지 재생성 주기가 그만큼 줄어든다.
 */
export interface IndexCard {
  code: string; name: string;
  value: number; change: number; changeRate: number;
  live: boolean;
  spark: number[]; sparkLabel: '오늘' | '1개월';
  week52High?: number | null; week52Low?: number | null;
  /** 값 뒤 단위(스테이블코인 시총 'B' = 십억 달러) · 상태 표기 대체('일간' — 실시간/장마감이 맞지 않는 하루 1회 집계) */
  unit?: string; tag?: string;
}

type Rv = { live?: number; minute?: number };

/** 52주 최고·최저(일봉 고가/저가 기준) */
function w52(rows: { h: number; l: number }[]): { week52High?: number; week52Low?: number } {
  if (!rows.length) return {};
  return { week52High: r2(Math.max(...rows.map((r) => r.h))), week52Low: r2(Math.min(...rows.map((r) => r.l))) };
}

const ymdOf = (tradedAt: string) => (/^\d{4}-\d{2}-\d{2}/.test(tradedAt) ? tradedAt.slice(0, 10).replace(/-/g, '') : kstYmd(0));

function card(code: string, name: string, q: LiveQuote, spark: number[], sparkLabel: IndexCard['sparkLabel']): IndexCard {
  return { code, name, value: r2(q.value), change: r2(q.change), changeRate: r2(q.changeRate), live: q.live, spark, sparkLabel };
}

async function kr(code: 'KOSPI' | 'KOSDAQ', name: string, rv: Rv): Promise<IndexCard | null> {
  const q = await krIndexLive(code, rv.live);
  if (!q || !q.value) return null;
  const [mins, days] = await Promise.all([indexMinute(code, ymdOf(q.tradedAt), rv.minute), indexDaily('domestic', code, 366)]);
  const spark = downsample(mins.map((m) => m.c), 80);
  if (spark.length) spark[spark.length - 1] = r2(q.value);
  return { ...card(code, name, q, spark, '오늘'), ...w52(days) };
}

async function world(code: string, name: string, rv: Rv): Promise<IndexCard | null> {
  const [q, days] = await Promise.all([worldIndexLive(code, rv.live), indexDaily('foreign', code, 366)]);
  if (!q || !q.value) return null;
  const spark = days.map((d) => d.c).slice(-22);
  if (spark.length && q.live) spark.push(r2(q.value));
  return { ...card(code, name, q, spark, '1개월'), ...w52(days) };
}

async function usd(rv: Rv): Promise<IndexCard | null> {
  const q = await usdKrwLive(rv.live);
  if (!q || !q.value) return null;
  // 환율 일봉은 네이버 차트가 없어 frankfurter(ECB) 1개월 + 실시간 끝점
  let series: number[] = [];
  try {
    const from = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10); // 1년(52주 계산)
    const res = await fetch(`https://api.frankfurter.app/${from}..?from=USD&to=KRW`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const j: { rates: Record<string, { KRW: number }> } = await res.json();
      series = Object.keys(j.rates).sort().map((d) => r2(j.rates[d].KRW));
    }
  } catch { /* 스파크 없이 */ }
  // 환율은 일봉 고저가 없어 종가 기준 52주(실시간 끝점 포함)
  const w = series.length ? { week52High: r2(Math.max(...series, r2(q.value))), week52Low: r2(Math.min(...series, r2(q.value))) } : {};
  const spark = series.slice(-22);
  spark.push(r2(q.value));
  return { ...card('USDKRW', '미국 USD', q, spark, '1개월'), ...w };
}

/** 풀 = 기본 6종 + 아시아·유럽 4종 + 스테이블코인 시총(레일 커스터마이즈로 표시 선택). 실패한 카드는 빠진다. */
export async function fetchHomeIndexCards(rv: Rv = {}): Promise<IndexCard[]> {
  return (await Promise.all([
    kr('KOSPI', '코스피', rv),
    kr('KOSDAQ', '코스닥', rv),
    usd(rv),
    world('.INX', 'S&P 500', rv),
    world('.IXIC', '나스닥 종합', rv),
    world('.DJI', '다우존스', rv),
    world('.N225', '닛케이225', rv),
    world('.HSI', '항셍', rv),
    world('.GDAXI', 'DAX', rv),
    world('.FTSE', 'FTSE 100', rv),
    stableCard().catch(() => null),
  ])).filter((x): x is IndexCard => !!x);
}
