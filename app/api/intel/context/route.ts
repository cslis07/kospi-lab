import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { stableSeries } from '@/lib/stablecoinCap';
import { getEtfFlows, etfBiasFor, type EtfFlow } from '@/lib/etfFlow';
import { fetchNews } from '@/lib/newsFeeds';
import { parseFedRss, type FedItem, type FedKind, type RawNews } from '@/lib/intel/newsEvents';
import { stableChange, type EtfLite, type IntelContext, type ReleaseLite } from '@/lib/intel/liquidity';
import { calendarWithOfficial } from '@/lib/officialSchedule';
import { releaseTs } from '@/lib/calendarOfficial';

/** 코인에 영향 큰 미국 발표 — 중요도 '높음'이거나 물가·고용·성장·FOMC(캘린더에서 PPI 는 '중간'이라 분석 응답 이벤트에서 빠진다) */
const KEY_RELEASE = /CPI|PPI|PCE|FOMC|GDP|고용|비농업|실업|소비자물가|생산자물가|개인소비|소매판매/;

async function releases(now: number): Promise<ReleaseLite[] | null> {
  try {
    const ev = await calendarWithOfficial(3000);
    if (!ev.length) return null;
    return ev
      .filter((e) => e.country === 'US' && (e.category === 'fomc' || e.category === 'indicator') && (e.importance === 'high' || KEY_RELEASE.test(e.title)))
      .map((e) => ({ title: e.title, at: releaseTs(e), importance: e.importance }))
      .filter((e) => Number.isFinite(e.at) && e.at >= now - 2 * 3_600_000 && e.at <= now + 48 * 3_600_000)
      .sort((a, b) => a.at - b.at)
      .map((e) => ({ title: e.title, at: new Date(e.at).toISOString(), importance: e.importance }));
  } catch { return null; }
}

/**
 * 🧪 의사결정 엔진 Phase 2 입력 — 유동성(스테이블코인·ETF)·연준 공식 RSS·해외 뉴스 제목.
 * 공개 데이터만(개인 데이터 없음) → CDN 캐시. 코인 분석 화면에서 엔진 패널이 보일 때만 부른다(주기 깨우기 없음).
 * 받기 실패는 null + health.ok=false — 0 이나 다른 값으로 메우지 않는다.
 */
export const preferredRegion = 'icn1';
export const maxDuration = 20;

const FED_FEEDS: { kind: FedKind; url: string }[] = [
  { kind: 'speech', url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
  { kind: 'testimony', url: 'https://www.federalreserve.gov/feeds/testimony.xml' },
  { kind: 'monetary', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml' },
];

async function fedItems(): Promise<FedItem[] | null> {
  const got = await Promise.all(FED_FEEDS.map(async (f) => {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0)' }, signal: AbortSignal.timeout(7000), next: { revalidate: 600 } });
      return res.ok ? parseFedRss(await res.text(), f.kind) : null;
    } catch { return null; }
  }));
  if (got.every((x) => x == null)) return null;
  const cut = Date.now() - 7 * 86_400_000;
  return got.flatMap((x) => x ?? []).filter((x) => Date.parse(x.publishedAt) >= cut)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function etfLite(f: EtfFlow | null, tag: 'BTC' | 'ETH', all: { BTC: EtfFlow | null; ETH: EtfFlow | null }): EtfLite | null {
  if (!f) return null;
  return {
    latestDate: f.latest.date, latestNetUsd: f.latest.netUsd, recent: f.recent.slice(0, 5).map((r) => ({ date: r.date, netUsd: r.netUsd })),
    streak: f.streak, recent3: Math.round(f.recent3), bias: etfBiasFor(all, tag), stale: f.stale,
  };
}

async function handler() {
  const now = Date.now();
  const [points, flows, fed, news, rel] = await Promise.all([
    stableSeries().catch(() => []),
    getEtfFlows().catch(() => null),
    fedItems(),
    fetchNews('international', 80).catch(() => [] as Awaited<ReturnType<typeof fetchNews>>),
    releases(now),
  ]);
  const stable = stableChange(points, now);
  const cut = now - 36 * 3_600_000;
  const recentNews: RawNews[] = news
    .filter((n) => n.pubDate && Date.parse(n.pubDate) >= cut)
    .map((n) => ({ title: n.title, link: n.link, source: n.source, pubDate: new Date(Date.parse(n.pubDate!)).toISOString() }));
  const body: IntelContext = {
    ingestedAt: now,
    stable,
    etf: { BTC: flows ? etfLite(flows.BTC, 'BTC', flows) : null, ETH: flows ? etfLite(flows.ETH, 'ETH', flows) : null },
    fed: fed ?? [],
    news: recentNews,
    releases: rel ?? [],
    health: {
      calendar: rel ? { ok: true } : { ok: false, note: '공식 일정 받기 실패' },
      stable: stable ? { ok: true } : { ok: false, note: 'DefiLlama 받기 실패' },
      etf: flows?.BTC || flows?.ETH ? { ok: true, note: flows.BTC?.stale || flows.ETH?.stale ? '집계 지연' : undefined } : { ok: false, note: 'SoSoValue 받기 실패(키·응답)' },
      fed: fed ? { ok: true } : { ok: false, note: '연준 RSS 받기 실패' },
      news: recentNews.length ? { ok: true, note: `${new Set(recentNews.map((n) => n.source)).size}개 매체 ${recentNews.length}건` } : { ok: false, note: '해외 뉴스 0건(받기 실패 또는 시각 없음)' },
    },
  };
  return NextResponse.json(body);
}

// 5분 신선 · 30분 동안 직전 값 즉시 응답
export const GET = withCdn(handler, 300, 1800);
