import { NextResponse } from 'next/server';
import { withCdn } from '@/lib/cdn';
import { fetchChartData } from '@/lib/naver';
import { corrMatrix, type Series } from '@/lib/correlation';

/**
 * 자산 상관관계 행렬 — ?ids=kr:005930,us:AAPL,cx:BTC,ix:KOSPI &days=90|180
 * 국내 종목 = 네이버 fchart 일봉 · 해외·지수·코인 = Yahoo 일봉(무키). 종목 코드만 받고 개인 수량·평단은 받지 않는다.
 * 실패한 자산은 ok:false 로 남기고(행렬엔 null) 나머지로 계산.
 */
export const preferredRegion = 'icn1';

const INDEX: Record<string, { y: string; label: string }> = {
  KOSPI: { y: '^KS11', label: '코스피' }, KOSDAQ: { y: '^KQ11', label: '코스닥' },
  SP500: { y: '^GSPC', label: 'S&P 500' }, NASDAQ: { y: '^IXIC', label: '나스닥' },
  USDKRW: { y: 'KRW=X', label: '달러/원' }, GOLD: { y: 'GC=F', label: '금' },
};
const MAX_IDS = 14;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function yahoo(symbol: string, range: string): Promise<Map<string, number>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  let res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) res = await fetch(url.replace('query1', 'query2'), { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json() as { chart?: { result?: { meta?: { gmtoffset?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] } };
  const r = j.chart?.result?.[0];
  const off = r?.meta?.gmtoffset ?? 0;
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const m = new Map<string, number>();
  (r?.timestamp ?? []).forEach((t, i) => { const c = closes[i]; if (c != null && c > 0) m.set(new Date((t + off) * 1000).toISOString().slice(0, 10), c); });
  return m;
}

async function krStock(code: string, days: number): Promise<Map<string, number>> {
  const end = new Date(), start = new Date(end.getTime() - (days + 20) * 86400000);
  const txt = await fetchChartData(code, ymd(start), ymd(end));
  const m = new Map<string, number>();
  for (const row of txt.matchAll(/\["(\d{8})",\s*[\d.]+,\s*[\d.]+,\s*[\d.]+,\s*([\d.]+)/g)) {
    const c = Number(row[2]);
    if (c > 0) m.set(`${row[1].slice(0, 4)}-${row[1].slice(4, 6)}-${row[1].slice(6)}`, c);
  }
  return m;
}

/** 최근 days 일만 남긴다(달력일 기준) */
function clip(m: Map<string, number>, days: number) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return new Map([...m].filter(([d]) => d >= from));
}

async function load(id: string, days: number): Promise<{ label: string; closes: Map<string, number> }> {
  const [kind, raw] = id.split(':');
  const range = days > 120 ? '1y' : '6mo';
  if (kind === 'kr' && /^[0-9A-Z]{6}$/.test(raw)) return { label: raw, closes: await krStock(raw, days) };
  if (kind === 'us' && /^[A-Z0-9.\-]{1,12}$/.test(raw)) return { label: raw, closes: await yahoo(raw, range) };
  if (kind === 'cx' && /^[A-Z0-9]{2,12}$/.test(raw)) return { label: raw, closes: await yahoo(`${raw}-USD`, range) };
  if (kind === 'ix' && INDEX[raw]) return { label: INDEX[raw].label, closes: await yahoo(INDEX[raw].y, range) };
  throw new Error('bad id');
}

async function handler(req: Request) {
  const sp = new URL(req.url).searchParams;
  const days = sp.get('days') === '180' ? 180 : 90;
  const ids = [...new Set((sp.get('ids') ?? '').split(',').map((s) => s.trim().toUpperCase().replace(/^(KR|US|CX|IX):/, (k) => k.toLowerCase())).filter(Boolean))].slice(0, MAX_IDS);
  if (ids.length < 2) return NextResponse.json({ error: '자산을 2개 이상 고르세요' }, { status: 400 });
  const got = await Promise.all(ids.map(async (id) => {
    try { const x = await load(id, days); return { id, label: x.label, ok: x.closes.size > 0, closes: clip(x.closes, days) }; }
    catch { return { id, label: id.split(':')[1] ?? id, ok: false, closes: new Map<string, number>() }; }
  }));
  const series: Series[] = got.map((g) => ({ id: g.id, closes: g.closes }));
  const m = corrMatrix(series);
  // 기간 수익률(표시용) — 첫 종가 대비 마지막 종가
  const assets = got.map((g) => {
    const ds = [...g.closes.keys()].sort();
    const ret = ds.length > 1 ? Math.round((g.closes.get(ds[ds.length - 1])! / g.closes.get(ds[0])! - 1) * 1000) / 10 : null;
    return { id: g.id, label: g.label, ok: g.ok, points: g.closes.size, ret };
  });
  return NextResponse.json({ days, assets, r: m.r, n: m.n, asOf: new Date().toISOString() });
}

// 일봉 기준이라 1시간 캐시면 충분(같은 ids 조합끼리만 공유 — 코드만 들어 있어 개인정보 없음)
export const GET = withCdn(handler, 3600, 21600);
