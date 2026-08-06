/**
 * 성장주·기대주 스캔
 *
 * 1) GET /api/growth-scan?mode=universe&market=KOSPI|KOSDAQ|ALL&top=100
 *    KRX 전종목 일별매매정보(1h 캐시)에서 시총 상위 후보를 뽑는다.
 *    우선주(코드 끝자리 ≠ 0)·스팩·리츠는 제외.
 *
 * 2) GET /api/growth-scan?codes=005930,000660,...   (최대 15개)
 *    종목별 네이버 finance/annual(12h 캐시) → 성장 점수.
 *    전체 스캔은 클라이언트가 배치를 나눠 호출한다(진행률 표시 + 타임아웃 회피).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchKrxDailyMap, hasKrxKey } from '@/lib/krx';
import { fetchGrowthFinance, scoreGrowth } from '@/lib/growthScreener';

export const maxDuration = 30;
export const preferredRegion = 'icn1';   // 네이버·KRX 모두 한국 API

const BATCH_MAX = 15;
const CONCURRENCY = 6;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  /* ── 유니버스 ── */
  if (sp.get('mode') === 'universe') {
    if (!hasKrxKey()) return NextResponse.json({ configured: false, items: [] });
    const market = (sp.get('market') ?? 'ALL').toUpperCase();
    const top = Math.min(150, Math.max(20, parseInt(sp.get('top') ?? '100', 10) || 100));
    try {
      const { map, date } = await fetchKrxDailyMap();
      const items = [...map.entries()]
        .filter(([code, d]) => {
          if (code[5] !== '0') return false;                        // 우선주·전환주 제외
          if (/스팩|리츠|SPAC/i.test(d.name)) return false;
          if (market === 'KOSPI' && !/KOSPI/i.test(d.market)) return false;
          if (market === 'KOSDAQ' && !/KOSDAQ/i.test(d.market)) return false;
          return d.marketCap > 0;
        })
        .sort((a, b) => b[1].marketCap - a[1].marketCap)
        .slice(0, top)
        .map(([code, d]) => ({
          code, name: d.name, market: d.market,
          close: d.close, changeRate: d.changeRate,
          marketCap: d.marketCap, tradingValue: d.tradingValue,
        }));
      return NextResponse.json({ configured: true, date, count: items.length, items });
    } catch (e) {
      return NextResponse.json({ configured: true, items: [], error: String(e) }, { status: 502 });
    }
  }

  /* ── 배치 스캔 ── */
  const codes = (sp.get('codes') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, BATCH_MAX);
  if (!codes.length) {
    return NextResponse.json({ error: 'codes(6자리, 최대 15개) 또는 mode=universe 필요' }, { status: 400 });
  }

  // 동시 CONCURRENCY 로 제한 — 네이버 모바일 API 예의 + 안정성
  const results: Array<{ code: string; score: ReturnType<typeof scoreGrowth> } | null> = [];
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const chunk = codes.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map(async (code) => {
        const fin = await fetchGrowthFinance(code);
        if (!fin) return null;
        return { code, score: scoreGrowth(fin) };
      }),
    );
    for (const s of settled) results.push(s.status === 'fulfilled' ? s.value : null);
  }

  const ok = results.filter(Boolean) as Array<{ code: string; score: ReturnType<typeof scoreGrowth> }>;
  const failed = codes.filter((c) => !ok.some((r) => r.code === c));
  return NextResponse.json({ items: ok, failed });
}
