/**
 * Claude 브리핑 호출 공용 헬퍼.
 *
 * 주식·코인 분석 라우트가 같은 요청을 중복 구현하고 있었고, 실패 시 응답 본문을
 * 버려서 원인을 알 수 없었다. 여기서 본문은 서버 로그로만 남기고 클라이언트에는
 * 분류된 메시지만 돌려준다.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export interface BriefingModel {
  id: string;
  label: string;
  hint: string;
  /** 모델별 추가 요청 파라미터 (thinking·effort는 지원 모델이 다르다) */
  params: Record<string, unknown>;
  timeoutMs: number;
}

/**
 * 브리핑은 수 문장짜리 요약이라 사고(thinking)가 필요 없다.
 * Sonnet 5는 thinking 필드를 생략하면 adaptive로 동작해 응답이 느려지므로 명시적으로 끈다.
 * effort는 Sonnet 5·Opus 4.8에서만 유효하고 Haiku 4.5에서는 오류가 난다.
 */
export const BRIEFING_MODELS: BriefingModel[] = [
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    hint: '가장 빠르고 저렴',
    params: {},
    timeoutMs: 20000,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    hint: '균형 (기본값)',
    params: { thinking: { type: 'disabled' }, output_config: { effort: 'low' } },
    timeoutMs: 25000,
  },
  {
    id: 'claude-opus-4-8',
    label: 'Opus 4.8',
    hint: '가장 정확·느리고 비쌈',
    params: { thinking: { type: 'disabled' }, output_config: { effort: 'medium' } },
    timeoutMs: 25000,
  },
];

export const DEFAULT_BRIEFING_MODEL = 'claude-sonnet-5';

export function resolveBriefingModel(id: string | null | undefined): BriefingModel {
  return (
    BRIEFING_MODELS.find((m) => m.id === id) ??
    BRIEFING_MODELS.find((m) => m.id === DEFAULT_BRIEFING_MODEL)!
  );
}

export interface BriefingResult {
  text?: string;
  error?: string;
  /** 실제로 사용된 모델 id */
  model?: string;
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
  modelId?: string | null,
): Promise<BriefingResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { error: 'ANTHROPIC_API_KEY 미설정 — 룰 기반 분석만 표시됩니다.' };

  const model = resolveBriefingModel(modelId);

  // thinking을 끈 상태의 Opus·Sonnet은 사고 과정을 본문에 풀어 쓰는 경향이 있다.
  const body = model.params.thinking
    ? `${prompt}\n\n탐색적 사고 과정이나 검토 중 폐기한 안은 쓰지 말고 최종 답변만 출력하세요.`
    : prompt;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: body }],
        ...model.params,
      }),
      signal: AbortSignal.timeout(model.timeoutMs),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[${tag}] Anthropic ${res.status} (${model.id}): ${errBody.slice(0, 600)}`);
      return { error: friendlyError(res.status, errBody), model: model.id };
    }

    const json = await res.json();
    const text: string = json?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    if (!text) {
      console.error(`[${tag}] Anthropic 응답에 text 없음 (${model.id}): stop_reason=${json?.stop_reason}`);
      return { error: 'AI 브리핑 실패 (빈 응답)', model: model.id };
    }
    return { text, model: model.id };
  } catch (e) {
    console.error(`[${tag}] Anthropic 호출 예외 (${model.id})`, e);
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    return {
      error: timedOut
        ? `AI 브리핑 실패 — ${model.label} 응답 시간 초과. 더 빠른 모델을 선택해보세요.`
        : 'AI 브리핑 실패 (호출 오류)',
      model: model.id,
    };
  }
}
