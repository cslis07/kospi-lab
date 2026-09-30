import { NextResponse } from 'next/server';
import { krIndexLive, worldIndexLive, usdKrwLive, indexMinute, indexDaily, downsample, kstYmd, r2, type LiveQuote } from '@/lib/naverIndex';

/**
 * 홈 상단 지수 카드 — 코스피·코스닥·USD·S&P500·나스닥·다우존스, **값은 전부 네이버 실시간**(10초 캐시).
 * 스파크: 국내 = 당일(또는 최근 거래일) 분봉, 해외·환율 = 최근 1개월 일봉(+실시간 현재가를 끝점으로).
 * live=false 면 카드에 '장마감' 표기(해외는 한국 낮 시간엔 마감이 정상).
 */
export const dynamic = 'force-dynamic'; // 빌드 스냅샷(ISR) 대신 매 요청 실시간 — CDN 은 아래 s-maxage=10 으로 흡수

export interface IndexCard {
  code: string; name: string;
  value: number; change: number; changeRate: number;
  live: boolean;
  spark: number[]; sparkLabel: '오늘' | '1개월';
}

const ymdOf = (tradedAt: string) => (/^\d{4}-\d{2}-\d{2}/.test(tradedAt) ? tradedAt.slice(0, 10).replace(/-/g, '') : kstYmd(0));

function card(code: string, name: string, q: LiveQuote, spark: number[], sparkLabel: IndexCard['sparkLabel']): IndexCard {
  return { code, name, value: r2(q.value), change: r2(q.change), changeRate: r2(q.changeRate), live: q.live, spark, sparkLabel };
}

async function kr(code: 'KOSPI' | 'KOSDAQ', name: string): Promise<IndexCard | null> {
  const q = await krIndexLive(code);
  if (!q || !q.value) return null;
  const mins = await indexMinute(code, ymdOf(q.tradedAt));
  const spark = downsample(mins.map((m) => m.c), 80);
  if (spark.length) spark[spark.length - 1] = r2(q.value);
  return card(code, name, q, spark, '오늘');
}

async function world(code: string, name: string): Promise<IndexCard | null> {
  const [q, days] = await Promise.all([worldIndexLive(code), indexDaily('foreign', code, 45)]);
  if (!q || !q.value) return null;
  const spark = days.map((d) => d.c).slice(-22);
  if (spark.length && q.live) spark.push(r2(q.value));
  return card(code, name, q, spark, '1개월');
}

async function usd(): Promise<IndexCard | null> {
  const q = await usdKrwLive();
  if (!q || !q.value) return null;
  // 환율 일봉은 네이버 차트가 없어 frankfurter(ECB) 1개월 + 실시간 끝점
  let spark: number[] = [];
  try {
    const from = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(`https://api.frankfurter.app/${from}..?from=USD&to=KRW`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const j: { rates: Record<string, { KRW: number }> } = await res.json();
      spark = Object.keys(j.rates).sort().map((d) => r2(j.rates[d].KRW));
    }
  } catch { /* 스파크 없이 */ }
  spark.push(r2(q.value));
  return card('USDKRW', '미국 USD', q, spark, '1개월');
}

export async function GET() {
  const cards = (await Promise.all([
    kr('KOSPI', '코스피'),
    kr('KOSDAQ', '코스닥'),
    usd(),
    world('.INX', 'S&P 500'),
    world('.IXIC', '나스닥 종합'),
    world('.DJI', '다우존스'),
  ])).filter((x): x is IndexCard => !!x);
  return NextResponse.json(
    { cards, asOf: new Date().toISOString() },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=600' } },
  );
}
