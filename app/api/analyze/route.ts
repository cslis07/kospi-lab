import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? '';

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  // 인증은 middleware가 담당. 여기서는 인증된 클라이언트의 반복 호출로 인한 과금을 막는다.
  const gate = rateLimit(`analyze:${clientIp(req)}`, 10, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: `요청이 너무 잦습니다. ${gate.retryAfter}초 후 다시 시도하세요.` },
      { status: 429, headers: { 'retry-after': String(gate.retryAfter) } }
    );
  }

  const body = await req.json();
  const { name, ticker, price, change, changeRate, high52w, low52w, marketCap, volume } = body;

  const prompt = `당신은 주식 분석 전문가입니다. 아래 데이터를 바탕으로 ${name}(${ticker}) 종목을 간결하게 분석해주세요.

## 현재 데이터
- 현재가: ${price?.toLocaleString()}원
- 등락: ${change > 0 ? '+' : ''}${change?.toLocaleString()}원 (${changeRate?.toFixed(2)}%)
- 52주 최고: ${high52w?.toLocaleString() ?? '-'}원
- 52주 최저: ${low52w?.toLocaleString() ?? '-'}원
- 시가총액: ${marketCap ?? '-'}
- 거래량: ${volume ?? '-'}

## 분석 요청
1. **현재 포지션**: 52주 범위 내 현재 위치 (상단/중단/하단)
2. **기술적 신호**: 현재 가격 흐름 해석
3. **투자 유의사항**: 리스크 요인 1-2가지
4. **한 줄 요약**: 현 시점 투자 판단

3~5문장 이내로 간결하게 답해주세요. 한국어로 작성하되 투자 권유가 아닌 참고 정보임을 명시하세요.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '분석 결과를 가져올 수 없습니다.';
    return NextResponse.json({ analysis: text });
  } catch (e) {
    console.error('[analyze]', e);
    return NextResponse.json({ error: 'AI 분석을 가져오지 못했습니다.' }, { status: 502 });
  }
}
