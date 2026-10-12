import { NextResponse } from 'next/server';
import { indicatorHistory, INDICATORS } from '@/lib/naverStock';
import { withCdn } from '@/lib/cdn';

// 시장지표(환율·금리·원자재) 단일 종목 일별 히스토리 — 상세 시트 차트·표용.
// code 는 INDICATORS 화이트리스트만 허용(오픈 프록시 방지), cat 도 거기서 가져온다.
export const preferredRegion = 'icn1';
const CAT = new Map(INDICATORS.map((d) => [d.code, d.cat]));

async function handler(req: Request) {
  const code = new URL(req.url).searchParams.get('code') ?? '';
  const cat = CAT.get(code);
  if (!cat) return NextResponse.json({ points: [] }, { status: 400 });
  const points = await indicatorHistory(cat, code);
  return NextResponse.json({ points });
}

export const GET = withCdn(handler, 600, 3600);
export const maxDuration = 20;
