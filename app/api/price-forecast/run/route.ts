/**
 * CPI·PPI 예상치 — AI 기사 보정 실행(버튼). Anthropic 실과금이라 middleware 게이트 뒤.
 * 수치 모델 값은 그대로 두고, 기사 제목을 근거로 ±AI_ADJ_MAX %p 안에서만 조정해 Supabase 에 남긴다(발표 뒤 채점).
 */
import { NextRequest, NextResponse } from 'next/server';
import { claudeBriefing } from '@/lib/anthropic';
import { geminiRaw } from '@/lib/llmBriefing';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { buildPayload, priceHeadlines, saveRun } from '@/lib/priceForecastData';
import { AI_ADJ_MAX, parseAiAdjust, type ForecastRun } from '@/lib/priceForecast';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const f2 = (x: number | null | undefined) => (x == null ? '없음' : `${x.toFixed(2)}%`);

export async function POST(req: NextRequest) {
  const rl = rateLimit(`price-forecast:${clientIp(req)}`, 3, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `잠시 후 다시 시도하세요(${rl.retryAfter}초).` }, { status: 429 });

  const [base, news] = await Promise.all([buildPayload(), priceHeadlines()]);
  if (!base.items.some((t) => t.mom != null)) return NextResponse.json({ error: '수치 모델 값이 없어 보정할 수 없습니다(FRED 응답 없음).' }, { status: 502 });

  const lines = base.items.map((t) => [
    `- ${t.key} | ${t.label} | 대상 ${t.month}${t.partial ? '(월 진행 중)' : ''} | 직전 발표 전월비 ${f2(t.prevMom)}`,
    `  수치 모델 전월비 ${f2(t.mom)} | 시장 예상 전월비 ${f2(t.consensus.mom?.estimate)}`,
    `  모델 요인: ${t.drivers.slice(0, 5).map((d) => `${d.label} ${d.x.toFixed(2)}${d.unit}(기여 ${d.contrib >= 0 ? '+' : ''}${d.contrib.toFixed(3)}%p)`).join(', ')}`,
  ].join('\n')).join('\n');

  const prompt = [
    '당신은 미국 물가 지표(CPI·PPI) 전월비를 예측하는 이코노미스트다.',
    '아래 "수치 모델"은 휘발유·경유·유가·천연가스·달러·임금·기대인플레와 최근 근원 물가 흐름으로 계산한 전월비(계절조정, %) 예상이다.',
    '당신의 일: 최근 기사 제목에서 **모델이 아직 반영하지 못한 정보**(관세·공급 차질·에너지 급변·특정 품목 가격·일회성 요인 등)를 찾아 전월비 예상을 소폭 보정한다.',
    '',
    '■ 규칙',
    `- 보정은 지표별 -${AI_ADJ_MAX} ~ +${AI_ADJ_MAX} %p, 0.01 단위. 근거 기사가 없으면 0.`,
    '- 연준 인사의 금리 발언은 이번 달 물가 수치를 바꾸지 않는다 — 발언이 물가 자료·요인을 구체적으로 언급할 때만 근거로 쓴다(그 외엔 effect 를 neutral 로 분류).',
    '- 모델이 이미 쓴 요인(휘발유·유가·달러 등 월평균)을 중복 반영하지 않는다. 월말 급변처럼 월평균에 덜 잡힌 부분만.',
    '- 시장 예상치를 따라가려고 보정하지 않는다. 기사 근거로만.',
    '- 주가·코인 방향이나 매매 판단은 쓰지 않는다.',
    '',
    '■ 지표',
    lines,
    '',
    `■ 최근 7일 기사 제목(${news.length}건, 날짜는 한국시간 월-일)`,
    news.map((n, i) => `${i + 1}. [${n.date}] ${n.title} — ${n.source}`).join('\n') || '(수집된 기사 없음)',
    '',
    '■ 출력: 아래 JSON 한 덩어리만(코드블록·설명 금지). 문장은 한국어.',
    '{"adjust":{"cpi":0,"coreCpi":0,"ppi":0,"corePpi":0},',
    ' "reasons":{"cpi":"보정 이유 한두 문장(0이면 왜 0인지)","coreCpi":"…","ppi":"…","corePpi":"…"},',
    ' "summary":"기사 흐름 요약 2~3문장",',
    ' "articles":[{"title":"근거로 본 기사 제목(원문 그대로)","effect":"up|down|neutral","why":"물가 수치에 주는 영향 한 문장"}]}',
    'articles 는 중요한 순서로 최대 8건.',
  ].join('\n');

  // 점검용 — AI 를 부르지 않고 모은 기사와 지시문만 돌려준다(과금 없음)
  if (req.nextUrl.searchParams.get('dry') === '1') return NextResponse.json({ dry: true, newsCount: news.length, prompt });

  // Claude 가 안 되면(크레딧 부족·시간 초과 등) 무료 Gemini 로 한 번 더 — 어느 쪽이 답했는지는 aiModel 로 남는다
  let ai: { text?: string; model?: string; error?: string } = await claudeBriefing(prompt, 1800, 'price-forecast');
  if (!ai.text) {
    const g = await geminiRaw(prompt, Date.now() + 30000);
    if (g.text) ai = g;
    else return NextResponse.json({ error: `${ai.error ?? 'AI 응답 없음'} / Gemini: ${g.error ?? '실패'}` }, { status: 502 });
  }
  const parsed = parseAiAdjust(ai.text ?? '');
  if (!parsed) return NextResponse.json({ error: 'AI 응답을 읽지 못했습니다. 다시 실행해 주세요.' }, { status: 502 });

  const run: ForecastRun = {
    ranAt: Date.now(), aiModel: ai.model ?? null,
    targets: Object.fromEntries(base.items.map((t) => [t.key, {
      month: t.month, model: t.mom, adj: parsed.adjust[t.key], final: t.mom != null ? t.mom + parsed.adjust[t.key] : null,
      consensus: t.consensus.mom?.estimate ?? null, reason: parsed.reasons[t.key],
    }])) as ForecastRun['targets'],
    summary: parsed.summary, articles: parsed.articles, newsCount: news.length,
  };
  const saved = await saveRun(run);
  return NextResponse.json({ ok: true, saved, payload: await buildPayload() });
}
