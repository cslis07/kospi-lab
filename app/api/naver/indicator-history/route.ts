import { NextResponse } from 'next/server';
import { indicatorHistory, INDICATORS } from '@/lib/naverStock';
import { indexDaily } from '@/lib/naverIndex';
import { withCdn } from '@/lib/cdn';

// 시장지표(환율·금리·원자재) 단일 종목 일별 히스토리 — 상세 시트 차트·표용.
// code 는 INDICATORS 화이트리스트만 허용(오픈 프록시 방지), cat 도 거기서 가져온다.
// 홈 지수 레일 카드(코스피·해외 지수)도 같은 시트를 쓰므로 지수 화이트리스트를 함께 받는다(일봉 종가 약 9개월).
export const preferredRegion = 'icn1';
const CAT = new Map(INDICATORS.map((d) => [d.code, d.cat]));
const INDEX_MARKET: Record<string, 'domestic' | 'foreign'> = {
  KOSPI: 'domestic', KOSDAQ: 'domestic',
  '.INX': 'foreign', '.IXIC': 'foreign', '.DJI': 'foreign', '.N225': 'foreign', '.HSI': 'foreign', '.GDAXI': 'foreign', '.FTSE': 'foreign',
};

async function handler(req: Request) {
  const code = new URL(req.url).searchParams.get('code') ?? '';
  const market = INDEX_MARKET[code];
  if (market) {
    const rows = await indexDaily(market, code, 270);
    return NextResponse.json({ points: rows.map((r) => ({ date: r.d, value: r.c })) });
  }
  const cat = CAT.get(code);
  if (!cat) return NextResponse.json({ points: [] }, { status: 400 });
  const points = await indicatorHistory(cat, code);
  return NextResponse.json({ points });
}

export const GET = withCdn(handler, 600, 3600);
export const maxDuration = 20;
