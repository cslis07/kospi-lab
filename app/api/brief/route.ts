import { NextResponse } from 'next/server';
import { fetchNews, fetchNaverMainNews } from '@/lib/newsFeeds';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import { geminiBrief } from '@/lib/llmBriefing';
import {
  marketMacro, rankNews, warNews, todayEvents, buildBriefPrompt, fetchCryptoNews, verifyAi,
  type BriefMarket, type BriefData, type BriefAi,
} from '@/lib/brief';
import type { NewsItem } from '@/lib/types';

/**
 * 모닝 브리핑 — ?market=coin|kr|us. 뉴스 선별 + 오늘 일정 + Gemini 요약(+생성 시점 수치).
 * 매수·매도·방향 예측 금지(앱 원칙). 아침 07:30 크론(brief-warm.yml)이 미리 데워 사용자 대기 제거.
 *
 * 수치는 화면에서 /api/brief/macro(1분 캐시)로 따로 갱신한다 — 여기 실린 macro 는 '요약이 본 시점' 기록.
 * 캐시: 시장별 1시간 메모리 캐시 + CDN s-maxage=3600 swr=43200, 동시 요청은 한 번의 생성으로 합침(무료 한도 보호).
 * AI 실패 시 6시간 이내 직전 성공 요약을 stale 로 대신 보여준다.
 */
export const maxDuration = 60;
export const revalidate = 0;

const MARKETS: BriefMarket[] = ['coin', 'kr', 'us'];
const TTL_OK = 60 * 60 * 1000;
const TTL_FAIL = 5 * 60 * 1000;
const STALE_MAX = 6 * 60 * 60 * 1000;

const cache = new Map<BriefMarket, { data: BriefData; exp: number }>();
const inflight = new Map<BriefMarket, Promise<BriefData>>();
const lastAi = new Map<BriefMarket, { ai: BriefAi; at: number }>();

/** ms 안에 안 오는 근거는 fallback — 요약 시간을 잡아먹지 않게 */
const within = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
  Promise.race([p.catch(() => fb), new Promise<T>((r) => setTimeout(() => r(fb), ms))]);

/** 뉴스 풀 — 선별(점수·중복 제거·매체 상한)은 rankNews 가 하므로 순서는 상관없다 */
async function collectNews(market: BriefMarket): Promise<NewsItem[]> {
  const [intl, kr, crypto] = await Promise.all([
    within(fetchNews('international', 60), 6000, [] as NewsItem[]),
    within(fetchNaverMainNews(40), 5000, [] as NewsItem[]),
    market === 'coin' ? within(fetchCryptoNews(10), 6000, [] as NewsItem[]) : Promise.resolve([] as NewsItem[]),
  ]);
  return [...crypto, ...intl, ...kr];
}

/** AI 실패 시 직전 성공본으로 대체(6시간 이내), 성공본은 기록 */
function withStale(market: BriefMarket, ai: BriefAi): BriefAi {
  if (ai.headline && !ai.error) { lastAi.set(market, { ai, at: Date.now() }); return ai; }
  const g = lastAi.get(market);
  if (g && Date.now() - g.at < STALE_MAX && !ai.notConfigured) {
    const mins = Math.round((Date.now() - g.at) / 60000);
    return { ...g.ai, stale: true, error: `최신 생성 실패(${ai.error ?? '오류'}) — ${mins}분 전 요약` };
  }
  return ai;
}

async function generate(market: BriefMarket): Promise<BriefData> {
  const deadline = Date.now() + 50_000;
  const [macro, allNews] = await Promise.all([
    marketMacro(market).catch(() => []),
    collectNews(market),
  ]);
  const news = rankNews(allNews, market, 8);
  const war = warNews(allNews, 4);
  const events = todayEvents(CALENDAR_EVENTS, market, 3);

  const prompt = buildBriefPrompt(market, macro, news, war, events);
  const r = await geminiBrief(prompt, deadline);
  let ai: BriefAi;
  if (r.ok && r.brief) {
    // 근거(수치·헤드라인)에 없는 숫자를 쓴 문장은 버린다
    const evidence = [...macro.map((m) => `${m.label} ${m.value} ${m.changeText}`), ...news.map((n) => n.title), ...war.map((n) => n.title), ...events.map((e) => `${e.date} ${e.title}`)].join('\n');
    const v = verifyAi(r.brief.headline, r.brief.bullets, evidence);
    ai = v.bullets.length
      ? { headline: v.headline, bullets: v.bullets, model: r.model, dropped: v.dropped, at: new Date().toISOString() }
      : { headline: '', bullets: [], error: '수치 대조에서 모든 문장이 걸러졌습니다', dropped: v.dropped };
  } else {
    ai = { headline: '', bullets: [], error: r.error, notConfigured: r.notConfigured };
  }

  return { market, asOf: new Date().toISOString(), macro, news, war, events, ai: withStale(market, ai) };
}

const freshOk = (d: BriefData) => !!d.ai.headline && !d.ai.stale;

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get('market');
  const market: BriefMarket = (MARKETS as string[]).includes(m ?? '') ? (m as BriefMarket) : 'coin';

  const hit = cache.get(market);
  let data: BriefData;
  if (hit && hit.exp > Date.now()) {
    data = hit.data;
  } else {
    let p = inflight.get(market);
    if (!p) {
      p = generate(market).finally(() => inflight.delete(market));
      inflight.set(market, p);
    }
    data = await p;
    cache.set(market, { data, exp: Date.now() + (freshOk(data) ? TTL_OK : TTL_FAIL) });
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': freshOk(data) ? 's-maxage=3600, stale-while-revalidate=43200' : 's-maxage=300' },
  });
}
