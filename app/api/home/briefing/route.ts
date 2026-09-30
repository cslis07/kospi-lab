import { NextResponse } from 'next/server';
import { claudeBriefing } from '@/lib/anthropic';
import { fetchKrxDailyMap } from '@/lib/krx';

/**
 * 홈 AI 브리핑 — 코스피 시황 한 문장 헤드라인 + 불릿 3개. 1시간 메모리 캐시로 비용 억제.
 * 방향 추천 금지(앱 원칙): '무엇이 왜 움직였나'만. ANTHROPIC 키 없으면 error 반환 → 컴포넌트가 룰 기반 폴백.
 */
export const revalidate = 0; // 캐시는 아래 메모리 캐시로 직접 제어

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://m.stock.naver.com/', Accept: 'application/json',
};
const num = (s: unknown) => Number(String(s ?? 0).replace(/,/g, '').replace(/[+\s%]/g, '')) || 0;

let _cache: { data: unknown; ts: number } | null = null;
const TTL = 60 * 60 * 1000; // 1h

async function marketSummary() {
  let kospi = 0, kospiRate = 0, foreign = 0, inst = 0, indiv = 0, up = 0, down = 0;
  try {
    const b = await fetch('https://m.stock.naver.com/api/index/KOSPI/basic', { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (b.ok) { const j = await b.json(); kospi = num(j.closePrice); kospiRate = num(j.fluctuationsRatio); }
  } catch { /* skip */ }
  try {
    const t = await fetch('https://m.stock.naver.com/api/index/KOSPI/trend', { headers: HEADERS, signal: AbortSignal.timeout(6000) });
    if (t.ok) { const j = await t.json(); foreign = num(j.foreignValue); inst = num(j.institutionalValue); indiv = num(j.personalValue); }
  } catch { /* skip */ }
  try {
    const { map } = await fetchKrxDailyMap();
    for (const d of map.values()) { if (d.close <= 0) continue; if (d.changeRate > 0) up++; else if (d.changeRate < 0) down++; }
  } catch { /* skip */ }
  return { kospi, kospiRate, foreign, inst, indiv, up, down };
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < TTL) {
    return NextResponse.json(_cache.data);
  }

  const s = await marketSummary();
  const facts =
    `코스피 ${s.kospi ? s.kospi.toLocaleString() : '?'} (${s.kospiRate >= 0 ? '+' : ''}${s.kospiRate}%). ` +
    `투자자 순매수(억): 외국인 ${s.foreign}, 기관 ${s.inst}, 개인 ${s.indiv}. ` +
    `상승 ${s.up}종목 / 하락 ${s.down}종목.`;

  const prompt =
    `너는 한국 증시 시황 요약가다. 아래 오늘 데이터만 근거로, 매수/매도 방향 추천 없이 ` +
    `"무엇이 왜 움직였는지"만 담백하게 요약하라. 없는 사실을 지어내지 말 것.\n\n` +
    `데이터: ${facts}\n\n` +
    `출력 형식(정확히 지킬 것):\n` +
    `첫 줄 = 한 문장 헤드라인(따옴표·머리기호 없이).\n` +
    `그 다음 줄부터 "- "로 시작하는 불릿 3개(각 한 문장, ~40자).`;

  const res = await claudeBriefing(prompt, 400, 'home-briefing', null);
  if (res.error || !res.text) {
    // 캐시하지 않음 — 키 충전/복구 시 즉시 반영
    return NextResponse.json({ error: res.error ?? 'empty', facts: s });
  }

  const lines = res.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headline = lines[0]?.replace(/^["'“]|["'”]$/g, '') ?? '';
  const bullets = lines.slice(1).filter((l) => l.startsWith('-')).map((l) => l.replace(/^[-•]\s*/, '')).slice(0, 3);

  const data = { headline, bullets, facts: s, model: res.model, asOf: new Date().toISOString() };
  _cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
