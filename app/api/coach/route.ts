/**
 * AI 복기 코치 — 과거 매매 통계로 '규율' 피드백을 준다.
 *
 * ⚠ 이 라우트의 존재 이유이자 유일한 제약: **방향을 절대 말하지 않는다.**
 *   이 앱의 엔진은 방향을 못 맞힌다는 게 측정으로 확인됐다. 그래서 AI 도 "오를 것/사라"를
 *   말하면 안 된다. 습관(계획·틸트·편향·시간대·손실관리)만 다룬다.
 * Anthropic 실과금이라 middleware 게이트 뒤(/api/coach). 요청 본문은 집계된 통계뿐(원문 저널 아님).
 */
import { NextRequest, NextResponse } from 'next/server';
import { claudeBriefing } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { retro?: unknown; breaker?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!body.retro) return NextResponse.json({ error: 'retro 통계가 필요합니다.' }, { status: 400 });

  const prompt = [
    '당신은 트레이더의 "규율 코치"다. 시장 분석가가 아니다.',
    '아래는 한 사용자의 과거 청산 매매를 집계한 통계다. 이 통계만 근거로 행동·습관 피드백을 한국어로 준다.',
    '',
    '■ 절대 금지(어기면 실패):',
    '- 특정 종목·방향(매수/매도/롱/숏) 추천, 진입/청산 타이밍 제안',
    '- 시장 예측, "오를 것/내릴 것" 같은 방향성 표현',
    '- (이 앱의 엔진은 대규모 측정에서 방향 예측 우위가 없음이 확인됨 — 방향 조언은 근거가 없다)',
    '',
    '■ 집중할 것:',
    '- 계획(손절·사이징) 있는 매매 vs 없는 매매의 성적 차이',
    '- 틸트: 연속 손절 후 복구 매매 습관',
    '- 방향/시간대 편향 같은 반복 패턴',
    '- 손실 관리·규율',
    '',
    '■ 형식: 위로 말고 실행 가능한 조언으로. 3~5문장. 통계의 구체적 숫자를 인용. 마지막에 "다음 매매에서 할 한 가지"를 한 줄로.',
    '',
    '통계(JSON):',
    JSON.stringify(body.retro),
    body.breaker ? `\n서킷브레이커 상태(JSON): ${JSON.stringify(body.breaker)}` : '',
  ].join('\n');

  const r = await claudeBriefing(prompt, 700, 'coach');
  if (r.error) return NextResponse.json({ error: r.error }, { status: 200 });
  return NextResponse.json({ text: r.text });
}
