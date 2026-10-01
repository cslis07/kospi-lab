import { NextRequest, NextResponse } from 'next/server';
import { industryNameMap, stockIndustryCode } from '@/lib/naverStock';
import { withCdn } from '@/lib/cdn';

/**
 * 국내 종목 업종명 — GET /api/stock/sectors?codes=005930,000660 → { "005930": "반도체와반도체장비", ... }
 * 보유 비중의 '업종 쏠림' 판정용. 모바일 증권 integration 의 industryCode(하루 캐시) → 업종 순위 API 의 코드→이름(하루 캐시).
 * 모르는 종목은 키를 빼고 돌려준다(화면에서 '업종 미확인').
 */
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest) {
  const codes = [...new Set((req.nextUrl.searchParams.get('codes') ?? '').split(',').map((c) => c.trim()).filter((c) => /^[0-9A-Z]{6}$/.test(c)))].slice(0, 30);
  if (!codes.length) return NextResponse.json({});
  const [names, inds] = await Promise.all([industryNameMap(), Promise.all(codes.map(stockIndustryCode))]);
  const out: Record<string, string> = {};
  codes.forEach((c, i) => { const n = names.get(inds[i]); if (n) out[c] = n; });
  return NextResponse.json(out);
}

// 업종은 거의 안 바뀐다 — CDN 1시간 + 만료 후 하루까지 직전 값
export const GET = withCdn(handler, 3600, 86400);
