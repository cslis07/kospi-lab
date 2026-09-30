import { NextResponse } from 'next/server';
import { krIndexLive, krIndexIntegration, worldIndexLive, usdKrwLive } from '@/lib/naverIndex';
import { fetchNaverMainNews, fetchNews } from '@/lib/newsFeeds';
import { fetchBitgetTickers } from '@/lib/bitget';
import { geminiBrief, openaiBrief, type ProviderResult } from '@/lib/llmBriefing';

/**
 * 홈 AI 브리핑 — ?tab=kr(국내)|us(해외)|coin(코인). Gemini + ChatGPT 를 병렬 호출해 둘 다 반환.
 * 근거 = 실시간 시세·수급 + 헤드라인. 방향(매수·매도·전망) 추천 금지 — 앱 원칙(측정상 예측 우위 없음).
 *
 * 무료 한도 보호: 탭별 결과 1시간 메모리 캐시 + CDN s-maxage=3600, 동시 요청은 한 번의 생성으로 합침.
 * 한 제공사라도 성공하면 1시간, 전부 실패면 5분만 캐시(복구 시 빨리 반영).
 */
export const maxDuration = 30;
export const revalidate = 0;

type Tab = 'kr' | 'us' | 'coin';
interface BriefingResponse { tab: Tab; providers: ProviderResult[]; facts: string; asOf: string }

const TTL_OK = 60 * 60 * 1000;
const TTL_FAIL = 5 * 60 * 1000;
const cache = new Map<Tab, { data: BriefingResponse; exp: number }>();
const inflight = new Map<Tab, Promise<BriefingResponse>>();

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
const eok = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')}억`;

async function krContext(): Promise<{ facts: string; heads: string[] }> {
  const [kospi, kosdaq, integ, news] = await Promise.all([
    krIndexLive('KOSPI'), krIndexLive('KOSDAQ'), krIndexIntegration('KOSPI'), fetchNaverMainNews(12),
  ]);
  const f: string[] = [];
  if (kospi) f.push(`코스피 ${kospi.value.toLocaleString()} (${sign(kospi.changeRate)}%, ${kospi.live ? '장중' : '마감'})`);
  if (kosdaq) f.push(`코스닥 ${kosdaq.value.toLocaleString()} (${sign(kosdaq.changeRate)}%)`);
  if (integ?.investor) f.push(`코스피 투자자 순매수: 외국인 ${eok(integ.investor.foreign)}, 기관 ${eok(integ.investor.institution)}, 개인 ${eok(integ.investor.individual)}`);
  if (integ?.program) f.push(`프로그램 매매: 전체 ${eok(integ.program.total)} (차익 ${eok(integ.program.arbitrage)}, 비차익 ${eok(integ.program.nonArbitrage)})`);
  if (integ?.upDown) f.push(`코스피 종목: 상승 ${integ.upDown.up} / 보합 ${integ.upDown.flat} / 하락 ${integ.upDown.down}`);
  return { facts: f.join('\n'), heads: news.slice(0, 10).map((n) => n.title) };
}

async function usContext(): Promise<{ facts: string; heads: string[] }> {
  const [sp, nq, dj, fx, news] = await Promise.all([
    worldIndexLive('.INX'), worldIndexLive('.IXIC'), worldIndexLive('.DJI'), usdKrwLive(), fetchNews('international', 30),
  ]);
  const f: string[] = [];
  if (sp) f.push(`S&P 500 ${sp.value.toLocaleString()} (${sign(sp.changeRate)}%, ${sp.live ? '장중' : '최근 마감'})`);
  if (nq) f.push(`나스닥 종합 ${nq.value.toLocaleString()} (${sign(nq.changeRate)}%)`);
  if (dj) f.push(`다우존스 ${dj.value.toLocaleString()} (${sign(dj.changeRate)}%)`);
  if (fx) f.push(`원/달러 ${fx.value.toLocaleString()}원 (${sign(fx.changeRate)}%)`);
  return { facts: f.join('\n'), heads: news.slice(0, 10).map((n) => n.title) };
}

async function coinContext(): Promise<{ facts: string; heads: string[] }> {
  const f: string[] = [];
  try {
    const t = await fetchBitgetTickers();
    for (const [sym, name] of [['BTCUSDT', '비트코인'], ['ETHUSDT', '이더리움'], ['XRPUSDT', '리플'], ['SOLUSDT', '솔라나']] as const) {
      const x = t.get(sym);
      if (x) f.push(`${name} ${Number(x.lastPr).toLocaleString('en-US')} USDT (24h ${sign(Math.round(Number(x.change24h) * 10000) / 100)}%)`);
    }
  } catch { /* 시세 없이 */ }
  try {
    const j = await (await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(6000), next: { revalidate: 1800 } })).json();
    const v = j?.data?.[0];
    if (v) f.push(`공포·탐욕 지수 ${v.value} (${v.value_classification})`);
  } catch { /* skip */ }
  const [intl, kr] = await Promise.all([fetchNews('international', 60), fetchNaverMainNews(30)]);
  const rx = /bitcoin|crypto|ether|btc|eth|xrp|solana|stablecoin|비트코인|코인|가상자산|이더리움|암호화폐|스테이블/i;
  const heads = [...kr, ...intl].filter((n) => rx.test(n.title)).slice(0, 10).map((n) => n.title);
  return { facts: f.join('\n'), heads };
}

const MARKET_NAME: Record<Tab, string> = { kr: '한국 증시', us: '미국 증시·환율', coin: '가상자산 시장' };

function buildPrompt(tab: Tab, facts: string, heads: string[]): string {
  return [
    `너는 ${MARKET_NAME[tab]} 시황 요약가다. 아래 [데이터]와 [헤드라인]만 근거로, 지금 무엇이 왜 움직였는지 한국어로 요약하라.`,
    '규칙: 매수·매도·목표가·전망 추천 금지. 데이터·헤드라인에 없는 수치나 사실을 지어내지 말 것. 헤드라인은 참고 맥락으로만.',
    '',
    '[데이터]', facts || '(수집 실패)',
    '',
    '[헤드라인]', heads.length ? heads.map((h) => `- ${h}`).join('\n') : '(없음)',
    '',
    'JSON 으로만 답하라: {"headline":"한 문장(45자 이내)","bullets":["문장(60자 이내)","문장","문장"]}',
  ].join('\n');
}

async function generate(tab: Tab): Promise<BriefingResponse> {
  const ctx = tab === 'kr' ? await krContext() : tab === 'us' ? await usContext() : await coinContext();
  const prompt = buildPrompt(tab, ctx.facts, ctx.heads);
  const providers = await Promise.all([geminiBrief(prompt), openaiBrief(prompt)]);
  return { tab, providers, facts: ctx.facts, asOf: new Date().toISOString() };
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('tab');
  const tab: Tab = t === 'us' || t === 'coin' ? t : 'kr';

  const hit = cache.get(tab);
  let data: BriefingResponse;
  if (hit && hit.exp > Date.now()) {
    data = hit.data;
  } else {
    let p = inflight.get(tab);
    if (!p) {
      p = generate(tab).finally(() => inflight.delete(tab));
      inflight.set(tab, p);
    }
    data = await p;
    const anyOk = data.providers.some((x) => x.ok);
    cache.set(tab, { data, exp: Date.now() + (anyOk ? TTL_OK : TTL_FAIL) });
  }

  const anyOk = data.providers.some((x) => x.ok);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': anyOk ? 's-maxage=3600, stale-while-revalidate=7200' : 's-maxage=300' },
  });
}
