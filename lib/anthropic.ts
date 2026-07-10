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

/**
 * OAuth 토큰(sk-ant-oat…)은 x-api-key로 인증되지 않는다.
 * Authorization: Bearer + anthropic-beta 헤더를 써야 한다.
 */
function authHeaders(key: string): Record<string, string> {
  if (key.startsWith('sk-ant-oat')) {
    return { authorization: `Bearer ${key}`, 'anthropic-beta': 'oauth-2025-04-20' };
  }
  return { 'x-api-key': key };
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
        ...authHeaders(key),
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
      let type = '';
      try {
        type = JSON.parse(body)?.error?.type ?? '';
      } catch {
        /* 본문이 JSON이 아니면 종류 없이 상태코드만 */
      }
      return { error: `AI 브리핑 실패 (${res.status}${type ? ` ${type}` : ''})` };
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
