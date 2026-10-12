import { NextResponse } from 'next/server';
import { fetchMacroIndicators } from '@/lib/macroData';
import { withCdn } from '@/lib/cdn';

// 경제지표(FRED) — 발표치라 자주 안 바뀜: 30분 신선 + 2시간 stale-while-revalidate
async function handler() {
  const data = await fetchMacroIndicators();
  return NextResponse.json(data);
}

export const GET = withCdn(handler, 1800, 7200);
export const maxDuration = 30;
