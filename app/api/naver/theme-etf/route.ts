import { NextResponse } from 'next/server';
import { etfThemes, themeEtfs, naverCache } from '@/lib/naverStock';

/**
 * 테마 ETF — ?region=kr|us &theme=중분류코드(없으면 기본 테마).
 * 국내 = 1주 수익률 순(notableETF), 미국 = 1주 수익률 필드가 없어 거래대금 순(화면에 명시).
 */
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

// 기본 선택 — 네이버 홈이 보여주던 '관심 집중 장기채' 류 대신, 누구나 이해하기 쉬운 대표 테마
const DEFAULT_THEME = { kr: '0101001', us: '0101001' }; // 대형주

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const region = sp.get('region') === 'us' ? 'us' : 'kr';
  const themes = await etfThemes(region);
  const theme = sp.get('theme') && themes.some((t) => t.code === sp.get('theme')) ? sp.get('theme')! : (themes.find((t) => t.code === DEFAULT_THEME[region])?.code ?? themes[0]?.code ?? '');
  const etfs = theme ? await themeEtfs(region, theme, 8) : [];
  return NextResponse.json({ region, theme, themes, etfs, sortedBy: region === 'kr' ? '1주 수익률' : '거래대금', asOf: new Date().toISOString() },
    { headers: naverCache('theme-etf', themes.length === 0, 's-maxage=300, stale-while-revalidate=86400') });
}
