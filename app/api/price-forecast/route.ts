// CPI·PPI 예상치 비교 — 시장 예상치(경제 캘린더) + 우리 수치 모델 + 저장된 AI 기사 보정. 게이트 뒤(Nowflation 중계 포함).
import { NextResponse } from 'next/server';
import { buildPayload } from '@/lib/priceForecastData';
import { PRIVATE } from '@/lib/cdn';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  try {
    const p = await buildPayload();
    // 일부 지표를 못 받아 빈 값이 있으면 브라우저에 붙잡아 두지 않는다(다시 열면 바로 재시도)
    const whole = p.items.every((t) => t.mom != null);
    return NextResponse.json(p, { headers: { 'Cache-Control': whole ? PRIVATE(300) : 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
