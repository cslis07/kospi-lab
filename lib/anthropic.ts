/**
 * Claude 브리핑 호출 공용 헬퍼.
 *
 * 주식·코인 분석 라우트가 같은 요청을 중복 구현하고 있었고, 실패 시 응답 본문을
 * 버려서 원인을 알 수 없었다. 여기서 본문은 서버 로그로만 남기고 클라이언트에는
 * 에러 종류(status·type)만 돌려준다.
 */

const MODEL = 'claude-haiku-4-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export interface BriefingResult {
  text?: string;
  error?: string;
}

/** 크레딧 소진은 400 invalid_request_error로 오므로 사용자에게 그대로 보여주면 원인을 알 수 없다. */
function friendlyError(status: number, body: string): string {
  if (/credit balance is too low/i.test(body)) {
    return 'AI 브리핑 비활성 — Anthropic 크레딧이 부족합니다. 룰 기반 분석만 표시됩니다.';
  }
  if (status === 401 || status === 403) return 'AI 브리핑 실패 — API 키 인증 오류.';
  if (status === 429) return 'AI 브리핑 실패 — 요청 한도 초과. 잠시 후 다시 시도하세요.';
  return `AI 브리핑 실패 (${status})`;
}

export async function claudeBriefing(
  prompt: string,
  maxTokens: number,
  tag: string,
): Promise<BriefingResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { error: 'ANTHROPIC_API_KEY 미설정 — 룰 기반 분석만 표시됩니다.' };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[${tag}] Anthropic ${res.status}: ${body.slice(0, 600)}`);
      return { error: friendlyError(res.status, body) };
    }

    const json = await res.json();
    const text: string = json?.content?.[0]?.text ?? '';
    if (!text) {
      console.error(`[${tag}] Anthropic 응답에 text 없음: stop_reason=${json?.stop_reason}`);
      return { error: 'AI 브리핑 실패 (빈 응답)' };
    }
    return { text };
  } catch (e) {
    console.error(`[${tag}] Anthropic 호출 예외`, e);
    return { error: 'AI 브리핑 실패 (호출 오류)' };
  }
}
