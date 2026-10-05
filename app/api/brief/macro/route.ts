import { NextResponse } from 'next/server';
import { marketMacro, type BriefMarket } from '@/lib/brief';

/**
 * 모닝 브리핑 수치 블록 — ?market=coin|kr|us. AI 요약과 분리해 **1분 단위로 갱신**한다
 * (요약은 1시간 캐시라 같이 묶으면 수치가 묵는다). 시세 원칙대로 CDN 짧게·swr 없음.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const MARKETS: BriefMarket[] = ['coin', 'kr', 'us'];

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get('market');
  const market: BriefMarket = (MARKETS as string[]).includes(m ?? '') ? (m as BriefMarket) : 'coin';
  const macro = await marketMacro(market).catch(() => []);
  return NextResponse.json(
    { market, asOf: new Date().toISOString(), macro },
    { headers: { 'Cache-Control': macro.length ? 's-maxage=45' : 's-maxage=10' } },
  );
}
