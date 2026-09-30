/**
 * 홈 AI 브리핑용 LLM 호출 — Gemini(무료 티어) · ChatGPT(OpenAI, 키 있을 때만).
 * 둘 다 {headline, bullets[3]} JSON 한 형식으로 받는다. temperature 는 넣지 않는다(최신 모델 일부가 400).
 *
 * 비용·한도: 호출 빈도는 /api/home/briefing 의 탭별 1시간 캐시(메모리 + CDN s-maxage)로 억제한다.
 *  - Gemini: Google AI Studio 무료 티어. 모델 env GEMINI_MODEL(기본 gemini-3.6-flash → 3.5-flash → flash-lite-latest 폴백).
 *    ⚠️ gemini-2.5-flash 는 신규 사용자에게 폐기(404), flash-latest(최신) 는 수요 폭주 503 이 잦다(2026-09-30).
 *  - OpenAI: API 는 무료 한도가 없다(선불 크레딧). 키 없으면 'not_configured', 크레딧 0 이면 insufficient_quota.
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
  stale?: boolean;          // 새 생성 실패로 직전 성공본을 대신 표시 중
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

  // 2026-09-30 실측: flash-latest(=최신) 는 수요 폭주 503 이 잦음 → 3.6-flash 기본, 과부하·한도(모델별)면 다음 모델로.
  // 품질 우선 3.6-flash → 붐비면 빠르고 안정적인 flash-lite(1초대) → 3.5-flash
  const models = [process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
  const t0 = Date.now();
  let lastErr = '';
  // ⚠️ Gemini 3.x 는 생각(thinking) 토큰이 maxOutputTokens 를 먹는다 — 1024 로 두면 생각 983개에 답이 잘려
  //    MAX_TOKENS(JSON 조각)로 끝났다(실측). 요약엔 생각이 필요 없으니 thinkingLevel 'minimal'(2.4초·생각 0) + 여유 4096.
  const call = (model: string, withThinking: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json', maxOutputTokens: 4096,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
        },
      }),
      // 한 모델이 예산을 다 먹지 않게 — 첫 시도 10초, 이후는 남은 예산(총 22초) 안에서
      signal: AbortSignal.timeout(Math.max(3000, Math.min(10000, 22000 - (Date.now() - t0)))),
    });

  for (const model of [...new Set(models)]) {
    if (Date.now() - t0 > 19000) break; // 라우트 maxDuration(30s) 안에서 끝내기
    try {
      let res = await call(model, true);
      if (res.status === 400) {
        const b = await res.text();
        if (/thinking/i.test(b)) res = await call(model, false); // 이 모델이 옵션 미지원이면 옵션 없이 1회 재시도
        else { console.error('[gemini]', model, 400, b.slice(0, 300)); return { ...base, model, error: friendly(400) }; }
      }
      if (!res.ok) {
        lastErr = res.status === 503 ? '모델 과부하 — 잠시 후 다시 생성됩니다' : friendly(res.status);
        console.error('[gemini]', model, res.status, (await res.text()).slice(0, 300));
        if ([404, 429, 500, 503].includes(res.status)) continue; // 다른 모델로 폴백(한도는 모델별)
        return { ...base, model, error: lastErr };
      }
      const j = await res.json();
      const text: string = j?.candidates?.[0]?.content?.parts
        ?.filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? '').join('') ?? '';
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
      const body = await res.text();
      console.error('[openai]', model, res.status, body.slice(0, 300));
      // 키는 유효하지만 선불 크레딧 0 → 429 insufficient_quota (2026-09-30 실측). '잠시 후'가 아니라 결제가 필요.
      if (body.includes('insufficient_quota')) return { ...base, model, error: 'OpenAI 크레딧 없음 — 결제(충전) 후 자동 표시' };
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
