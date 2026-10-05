import { NextResponse } from 'next/server';
import { fetchNews, fetchNaverMainNews } from '@/lib/newsFeeds';
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';
import { geminiBrief } from '@/lib/llmBriefing';
import {
  marketMacro, pickNews, warNews, todayEvents, buildBriefPrompt,
  type BriefMarket, type BriefData, type BriefAi,
} from '@/lib/brief';
import type { NewsItem } from '@/lib/types';

/**
 * 모닝 브리핑 — ?market=coin|kr|us. 거시 수치(FRED·네이버) + 뉴스(RSS·네이버) + 오늘 일정 + Gemini 요약.
 * 매수·매도·방향 예측 금지(앱 원칙). 아침 07:30 크론(brief-warm.yml)이 미리 데워 사용자 대기 제거.
 *
 * 캐시: 시장별 2시간 메모리 캐시 + CDN s-maxage=7200 swr=86400, 동시 요청은 한 번의 생성으로 합침.
 * AI 실패 시 6시간 이내 직전 성공 요약을 stale 로 대신 보여준다(빈 요약보다 낫다).
 */
export const maxDuration = 60;
export const revalidate = 0;

const MARKETS: BriefMarket[] = ['coin', 'kr', 'us'];
const TTL_OK = 2 * 60 * 60 * 1000;
const TTL_FAIL = 5 * 60 * 1000;
const STALE_MAX = 6 * 60 * 60 * 1000;

const cache = new Map<BriefMarket, { data: BriefData; exp: number }>();
const inflight = new Map<BriefMarket, Promise<BriefData>>();
const lastAi = new Map<BriefMarket, { ai: BriefAi; at: number }>();

/** ms 안에 안 오는 근거는 fallback — 요약 시간을 잡아먹지 않게 */
const within = <T,>(p: Promise<T>, ms: number, fb: T): Promise<T> =>
  Promise.race([p.catch(() => fb), new Promise<T>((r) => setTimeout(() => r(fb), ms))]);

async function collectNews(): Promise<NewsItem[]> {
  const [intl, kr] = await Promise.all([
    within(fetchNews('international', 50), 6000, [] as NewsItem[]),
    within(fetchNaverMainNews(30), 5000, [] as NewsItem[]),
  ]);
  return [...kr, ...intl];
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
    collectNews(),
  ]);
  const news = pickNews(allNews, market, 8);
  const war = warNews(allNews, 4);
  const events = todayEvents(CALENDAR_EVENTS, market, 3);

  const prompt = buildBriefPrompt(market, macro, news, war, events);
  const r = await geminiBrief(prompt, deadline);
  const ai: BriefAi = r.ok && r.brief
    ? { headline: r.brief.headline, bullets: r.brief.bullets, model: r.model }
    : { headline: '', bullets: [], error: r.error, notConfigured: r.notConfigured };

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
    headers: { 'Cache-Control': freshOk(data) ? 's-maxage=7200, stale-while-revalidate=86400' : 's-maxage=300' },
  });
}
