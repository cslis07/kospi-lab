/**
 * 홈 AI 브리핑용 LLM 호출 — Gemini(무료 티어) · ChatGPT(OpenAI, 키 있을 때만).
 * 둘 다 {headline, bullets[3]} JSON 한 형식으로 받는다. temperature 는 넣지 않는다(최신 모델 일부가 400).
 *
 * 비용·한도: 호출 빈도는 /api/home/briefing 의 탭별 1시간 캐시(메모리 + CDN s-maxage)로 억제한다.
 *  - Gemini: Google AI Studio 무료 티어. 모델 env GEMINI_MODEL(기본 gemini-flash-latest → 실패 시 gemini-3.6-flash).
 *    ⚠️ gemini-2.5-flash 는 신규 사용자에게 폐기(404) — 고정 ID 대신 alias 를 기본으로.
 *  - OpenAI: API 는 무료 한도가 없다(선불 크레딧). OPENAI_API_KEY 없으면 호출하지 않고 'not_configured'.
 */

export interface LlmBrief { headline: string; bullets: string[] }
export interface ProviderResult {
  id: 'gemini' | 'openai';
  name: string;
  ok: boolean;
  brief?: LlmBrief;
  model?: string;
  error?: string;           // 사용자에게 보여줄 짧은 사유
  notConfigured?: boolean;  // 키 미설정(연결 대기)
}

function parseBrief(text: string): LlmBrief | null {
  try {
    const s = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const j = JSON.parse(s);
    const headline = String(j.headline ?? '').trim();
    const bullets = Array.isArray(j.bullets) ? j.bullets.map((b: unknown) => String(b).trim()).filter(Boolean).slice(0, 3) : [];
    return headline ? { headline, bullets } : null;
  } catch {
    return null;
  }
}

function friendly(status: number): string {
  if (status === 429) return '무료 한도 초과 — 잠시 후 다시 생성됩니다';
  if (status === 401 || status === 403) return 'API 키 확인 필요';
  if (status === 404) return '모델을 찾을 수 없음';
  if (status >= 500) return '제공사 서버 오류';
  return `요청 실패(${status})`;
}

export async function geminiBrief(prompt: string): Promise<ProviderResult> {
  const base: ProviderResult = { id: 'gemini', name: 'Gemini', ok: false };
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { ...base, notConfigured: true, error: 'GEMINI_API_KEY 미설정' };

  const models = [process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest', 'gemini-3.6-flash'];
  let lastErr = '';
  for (const model of [...new Set(models)]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        lastErr = friendly(res.status);
        console.error('[gemini]', model, res.status, (await res.text()).slice(0, 300));
        if (res.status === 404) continue; // 다음 모델로
        return { ...base, model, error: lastErr };
      }
      const j = await res.json();
      const text: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
      const brief = parseBrief(text);
      if (!brief) return { ...base, model, error: '응답 형식 오류' };
      return { ...base, ok: true, brief, model };
    } catch (e) {
      lastErr = (e as Error).name === 'TimeoutError' ? '응답 지연(시간 초과)' : '네트워크 오류';
    }
  }
  return { ...base, error: lastErr || '실패' };
}

export async function openaiBrief(prompt: string): Promise<ProviderResult> {
  const base: ProviderResult = { id: 'openai', name: 'ChatGPT', ok: false };
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { ...base, notConfigured: true, error: 'OPENAI_API_KEY 미설정' };
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 1200,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error('[openai]', model, res.status, (await res.text()).slice(0, 300));
      return { ...base, model, error: friendly(res.status) };
    }
    const j = await res.json();
    const brief = parseBrief(j?.choices?.[0]?.message?.content ?? '');
    if (!brief) return { ...base, model, error: '응답 형식 오류' };
    return { ...base, ok: true, brief, model };
  } catch (e) {
    return { ...base, model, error: (e as Error).name === 'TimeoutError' ? '응답 지연(시간 초과)' : '네트워크 오류' };
  }
}
