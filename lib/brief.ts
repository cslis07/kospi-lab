/**
 * 모닝 브리핑(/brief) — 증시별 거시 수치 + 뉴스 + 오늘 일정 수집·가공.
 *
 * 원칙(앱 공통): 방향 예측·매수/매도 신호 금지. 측정상 방향 예측에 우위 없음(코인 49.7% 등).
 *   이 브리핑은 "어젯밤 美 시장·금리·유가·지정학에서 무슨 일이 있었고 오늘 변동성 큰 일정이 뭔지"를
 *   읽는 **맥락 도구**다. 모든 수치는 출처 표기, 뉴스는 원문 링크, AI 요약도 "신호 아님".
 *
 * 재사용: FRED(금리·유가)·naverIndex(지수·환율)·newsFeeds(뉴스)·calendarEvents(일정)·llmBriefing(Gemini).
 *   순수 가공 함수(pickNews·warNews·tagOf·todayEvents·buildBriefPrompt·fmt*)는 tests/brief.test.ts 로 고정.
 */
import type { NewsItem, CalendarEvent } from '@/lib/types';
import { worldIndexLive, krIndexLive, usdKrwLive } from '@/lib/naverIndex';

export type BriefMarket = 'coin' | 'kr' | 'us';

/** 거시 수치 한 칸 (표시 준비 완료) */
export interface MacroNum {
  key: string;
  label: string;
  value: string;              // "4.12%", "$71.3", "1,384원"
  change: number | null;      // 부호로 색 결정(+ 빨강 / − 파랑). null = 변화 없음/미상
  changeText: string;         // "+0.03%p", "-1.2%", "—"
  source: string;
  hint?: string;              // 이 시장에 왜 중요한지 한 줄(일반적 경향, 신호 아님)
}
export type NewsTag = 'war' | 'oil' | 'rate' | null;
export interface BriefNews { title: string; link: string; source: string; tag: NewsTag }
export interface BriefEvent { date: string; title: string; importance: string; country: string }
export interface BriefAi { headline: string; bullets: string[]; model?: string; error?: string; stale?: boolean; notConfigured?: boolean }
export interface BriefData {
  market: BriefMarket;
  asOf: string;               // ISO
  macro: MacroNum[];
  news: BriefNews[];
  war: BriefNews[];           // 전쟁·지정학 (별도 강조)
  events: BriefEvent[];       // 오늘~+3일
  ai: BriefAi;
}

/* ── 태그·관련도 정규식 ─────────────────────────────── */
// 국가명만으로는 잡지 않는다(예: "Russia plague"는 전염병 기사) — 분쟁 맥락 단어·분쟁 당사자 중심.
export const WAR_RE = /전쟁|공습|공세|미사일|침공|교전|분쟁|지정학|휴전|정전협정|도발|포격|테러|핵실험|하마스|헤즈볼라|호르무즈|가자지구|제재|\bwar\b|warfare|invasion|airstrike|\bmissile\b|ceasefire|militant|\bconflict\b|geopolit|sanction/i;
export const OIL_RE = /유가|원유|석유|정유|감산|증산|OPEC|WTI|브렌트|\boil\b|crude|petroleum|배럴/i;
export const RATE_RE = /금리|국채|수익률|연준|FOMC|기준금리|인플레|물가|CPI|PCE|고용|실업|긴축|완화|\bfed\b|yield|treasury|\brate\b|inflation|jobs|payroll/i;

const MARKET_RE: Record<BriefMarket, RegExp> = {
  coin: /bitcoin|crypto|ether|btc|eth|xrp|solana|stablecoin|비트코인|코인|가상자산|이더리움|리플|솔라나|암호화폐|스테이블|블록체인|SEC|ETF|금리|국채|유가|전쟁|지정학|연준|fed|규제/i,
  kr: /코스피|코스닥|환율|원\/달러|원달러|반도체|수출|무역|한국은행|금통위|삼성|하이닉스|외국인|기관|유가|금리|국채|증시/i,
  us: /S&P|S&P\s?500|나스닥|다우|월가|wall\s?st|연준|fed|FOMC|금리|국채|yield|treasury|유가|oil|전쟁|지정학|실업|고용|CPI|인플레|엔비디아|nvidia|애플|apple|테슬라|tesla|증시|stocks/i,
};

export function tagOf(title: string): NewsTag {
  if (WAR_RE.test(title)) return 'war';
  if (OIL_RE.test(title)) return 'oil';
  if (RATE_RE.test(title)) return 'rate';
  return null;
}

const dedupeByTitle = (items: NewsItem[]): NewsItem[] => {
  const seen = new Set<string>();
  return items.filter((n) => {
    const k = (n.title || '').replace(/\s+/g, '');
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** 시장 관련 뉴스만 추려 BriefNews 로 (중복 제거 후 limit) */
export function pickNews(items: NewsItem[], market: BriefMarket, limit = 8): BriefNews[] {
  const re = MARKET_RE[market];
  return dedupeByTitle(items)
    .filter((n) => n.title && n.link && re.test(n.title))
    .slice(0, limit)
    .map((n) => ({ title: n.title, link: n.link, source: n.source, tag: tagOf(n.title) }));
}

/** 전쟁·지정학 뉴스만 별도로 */
export function warNews(items: NewsItem[], limit = 4): BriefNews[] {
  return dedupeByTitle(items)
    .filter((n) => n.title && n.link && WAR_RE.test(n.title))
    .slice(0, limit)
    .map((n) => ({ title: n.title, link: n.link, source: n.source, tag: 'war' as const }));
}

/** KST 기준 오늘 YYYY-MM-DD */
export function kstTodayStr(now: number = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 오늘부터 days 일 이내 일정 (시장 국가 필터: coin·us → US·global, kr → KR·global) */
export function todayEvents(events: CalendarEvent[], market: BriefMarket, days = 3, now: number = Date.now()): BriefEvent[] {
  const today = kstTodayStr(now);
  const end = kstTodayStr(now + days * 86_400_000);
  const wantUS = market !== 'kr';
  return events
    .filter((e) => e.date >= today && e.date <= end)
    .filter((e) => e.country === 'global' || (wantUS ? e.country === 'US' : e.country === 'KR') || e.importance === 'high')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 6)
    .map((e) => ({ date: e.date, title: e.title, importance: e.importance, country: e.country }));
}

/* ── 포맷 ───────────────────────────────────────────── */
export const fmtPct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
export const fmtPp = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%p`;

const MARKET_NAME: Record<BriefMarket, string> = { coin: '가상자산(코인)', kr: '한국 증시', us: '미국 증시' };

/** Gemini 프롬프트 — 거시 수치 + 뉴스 헤드라인 근거로 "오늘 아침 맥락" 요약(신호 금지) */
export function buildBriefPrompt(market: BriefMarket, macro: MacroNum[], news: BriefNews[], war: BriefNews[], events: BriefEvent[]): string {
  const facts = macro.map((m) => `${m.label} ${m.value} (${m.changeText})`).join('\n') || '(수집 실패)';
  const heads = [...war, ...news].map((n) => `- ${n.title}`).slice(0, 14).join('\n') || '(없음)';
  const evs = events.map((e) => `- ${e.date} ${e.title}`).join('\n') || '(없음)';
  return [
    `너는 ${MARKET_NAME[market]} 아침 브리핑 작성가다. 아래 [거시]·[헤드라인]·[일정]만 근거로, 간밤 미국 시장·금리·유가·지정학이 ${MARKET_NAME[market]}에 주는 맥락을 한국어로 요약하라.`,
    '규칙: 매수·매도·목표가·"오를 것/내릴 것" 같은 방향 예측 금지. 없는 수치·사실 지어내기 금지. "~하면 ~압박" 같은 일반적 경향은 괜찮지만 단정·예측은 금지. 헤드라인은 맥락으로만.',
    '',
    '[거시]', facts,
    '',
    '[헤드라인]', heads,
    '',
    '[오늘~며칠 일정]', evs,
    '',
    'JSON 으로만 답하라: {"headline":"한 문장(45자 이내)","bullets":["문장(60자 이내)","문장","문장"]}',
  ].join('\n');
}

/* ── FRED (금리·유가) ────────────────────────────────
 * macroIndicators.ts 의 _usCpiFred 패턴과 동일: 최신 + 직전 영업일(값 '.' 제외). */
export interface FredPoint { value: number; prev: number | null; date: string }
export async function fredLatest(seriesId: string): Promise<FredPoint | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=10`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const obs = ((j?.observations ?? []) as { date: string; value: string }[]).filter((o) => o.value !== '.');
    if (!obs.length) return null;
    const value = Number(obs[0].value);
    const prev = obs[1] ? Number(obs[1].value) : null;
    return { value, prev, date: obs[0].date };
  } catch {
    return null;
  }
}

function yieldNum(p: FredPoint | null, key: string, label: string, hint: string): MacroNum | null {
  if (!p) return null;
  const ch = p.prev == null ? null : Math.round((p.value - p.prev) * 100) / 100;
  return { key, label, value: `${p.value.toFixed(2)}%`, change: ch, changeText: ch == null ? '—' : fmtPp(ch), source: 'FRED', hint };
}
function oilNum(p: FredPoint | null): MacroNum | null {
  if (!p) return null;
  const chPct = p.prev ? Math.round((p.value / p.prev - 1) * 1000) / 10 : null;
  return {
    key: 'wti', label: 'WTI 유가', value: `$${p.value.toFixed(1)}`,
    change: chPct, changeText: chPct == null ? '—' : fmtPct(chPct, 1), source: 'FRED',
    hint: '유가↑ = 인플레 압력 → 금리 기대에 영향(일반적 경향)',
  };
}

type LiveLike = { value: number; change: number; changeRate: number } | null;
function liveNum(q: LiveLike, key: string, label: string, unit: '원' | 'pt', hint?: string): MacroNum | null {
  if (!q) return null;
  const v = unit === '원' ? `${Math.round(q.value).toLocaleString('ko-KR')}원` : q.value.toLocaleString('ko-KR');
  return { key, label, value: v, change: q.changeRate, changeText: fmtPct(q.changeRate), source: '네이버 금융', hint };
}

/* ── 증시별 거시 수치 묶음 ─────────────────────────── */
async function fredBundle() {
  const [dgs10, dgs2, wti] = await Promise.all([
    fredLatest('DGS10'), fredLatest('DGS2'), fredLatest('DCOILWTICO'),
  ]);
  return {
    us10y: yieldNum(dgs10, 'us10y', '美 10년물 국채금리', '금리↑ = 위험자산(코인·성장주) 유동성 압박(일반적 경향)'),
    us2y: yieldNum(dgs2, 'us2y', '美 2년물 국채금리', '단기 금리 = 연준 정책 기대'),
    wti: oilNum(wti),
  };
}

export async function coinMacro(): Promise<MacroNum[]> {
  const [f, usd] = await Promise.all([fredBundle(), usdKrwLive()]);
  return [f.us10y, f.us2y, f.wti, liveNum(usd, 'usdkrw', '원/달러 환율', '원', '달러 강세 = 위험자산 역풍(일반적 경향)')].filter(Boolean) as MacroNum[];
}
export async function usMacro(): Promise<MacroNum[]> {
  const [f, sp, nq, dj] = await Promise.all([fredBundle(), worldIndexLive('.INX'), worldIndexLive('.IXIC'), worldIndexLive('.DJI')]);
  return [
    liveNum(sp, 'sp500', 'S&P 500', 'pt'), liveNum(nq, 'nasdaq', '나스닥 종합', 'pt'), liveNum(dj, 'dow', '다우존스', 'pt'),
    f.us10y, f.wti,
  ].filter(Boolean) as MacroNum[];
}
export async function krMacro(): Promise<MacroNum[]> {
  const [f, kospi, kosdaq, usd] = await Promise.all([fredBundle(), krIndexLive('KOSPI'), krIndexLive('KOSDAQ'), usdKrwLive()]);
  return [
    liveNum(kospi, 'kospi', '코스피', 'pt'), liveNum(kosdaq, 'kosdaq', '코스닥', 'pt'),
    liveNum(usd, 'usdkrw', '원/달러 환율', '원', '환율↑ = 외국인 자금 유출 압력(일반적 경향)'),
    f.wti, f.us10y,
  ].filter(Boolean) as MacroNum[];
}

export async function marketMacro(market: BriefMarket): Promise<MacroNum[]> {
  return market === 'coin' ? coinMacro() : market === 'us' ? usMacro() : krMacro();
}
