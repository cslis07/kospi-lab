/**
 * 모닝 브리핑(/brief) — 증시별 거시 수치 + 선행 지표 + 뉴스 + 오늘 일정 수집·가공.
 *
 * 원칙(앱 공통): 방향 예측·매수/매도 신호 금지. 측정상 방향 예측에 우위 없음(코인 49.7% 등).
 *   이 브리핑은 "간밤 美 시장·금리·유가·지정학에서 무슨 일이 있었고 오늘 변동성 큰 일정이 뭔지"를
 *   읽는 **맥락 도구**다. 과거 통계(lib/briefEdge)는 측정값 그대로 보여 주고, 우연 범위면 그렇게 적는다.
 *
 * 수치 시점(2026-10-05 실측): FRED 는 1~5영업일 늦다(WTI FRED $96.2 vs 실시간 $90.4).
 *   → 표시 수치는 **네이버 실시간(0~15분 지연)** 이 주력, FRED 는 폴백·과거 통계 전용. 수치마다 기준 시각을 싣는다.
 *
 * 순수 가공 함수(rankNews·warNews·tagOf·todayEvents·buildBriefPrompt·verifyAi·fmt*)는 tests/brief.test.ts 로 고정.
 */
import Parser from 'rss-parser';
import type { NewsItem, CalendarEvent } from '@/lib/types';
import { worldIndexLive, krIndexLive, usdKrwLive, num } from '@/lib/naverIndex';
import { fetchBitgetFuturesTickers } from '@/lib/bitget';
import { getEtfFlows } from '@/lib/etfFlow';

export type BriefMarket = 'coin' | 'kr' | 'us';

/** 거시 수치 한 칸 (표시 준비 완료) */
export interface MacroNum {
  key: string;
  label: string;
  value: string;              // "5.32%", "$90.4", "1,342원"
  change: number | null;      // 부호로 색 결정(+ 빨강 / − 파랑). null = 변화 없음/미상
  changeText: string;         // "+0.04%p", "-0.8%", "—"
  source: string;
  hint?: string;              // 이 시장에 왜 중요한지 한 줄(일반적 경향, 신호 아님)
  asOf?: string;              // 기준 시각(ISO) 또는 날짜(YYYY-MM-DD)
  live?: boolean;             // 장중 여부
  delayMin?: number;          // 시세 지연(분)
  group?: 'lead' | 'market' | 'macro' | 'crypto'; // 선행 / 시장 / 거시 / 코인 수급
}
export type NewsTag = 'war' | 'oil' | 'rate' | null;
export interface BriefNews { title: string; link: string; source: string; tag: NewsTag; ts: number | null }
export interface BriefEvent { date: string; title: string; importance: string; country: string }
export interface BriefAi {
  headline: string; bullets: string[]; model?: string; error?: string; stale?: boolean; notConfigured?: boolean;
  /** 수치 대조에서 걸러진 문장 수(데이터에 없는 숫자를 쓴 문장은 버린다) */
  dropped?: number;
  /** 요약 생성 시각(ISO) — 수치 블록은 그 뒤에도 갱신된다 */
  at?: string;
}
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
export const RATE_RE = /금리|국채|수익률|연준|FOMC|기준금리|인플레|물가|CPI|PCE|고용|실업|긴축|완화|\bfed\b|yield|treasur(?:ies|y (?:yield|bond|note|bill|market|auction)s?)|\brate\b|inflation|jobs|payroll/i;

/** 시장 고유 핵심어 — 이게 있으면 그 시장 기사 */
const CORE_RE: Record<BriefMarket, RegExp> = {
  coin: /bitcoin|crypto|ether(?:eum)?|\bbtc\b|\beth\b|\bxrp\b|solana|\bsol\b|stablecoin|coinbase|binance|token|defi|\bnft\b|altcoin|doge|staking|halving|onchain|on-chain|비트코인|코인|가상자산|이더리움|리플|솔라나|암호화폐|스테이블|블록체인|토큰|알트코인|도지|스테이킹|반감기|온체인/i,
  kr: /코스피|코스닥|증시|외국인|환율|원\/달러|원달러|반도체|수출|한국은행|금통위|삼성전자|하이닉스|공매도|밸류업|kospi/i,
  us: /S&P|나스닥|nasdaq|다우|\bdow\b|월가|wall\s?street|뉴욕증시|\bstocks?\b|shares|earnings|실적|엔비디아|nvidia|애플|apple|테슬라|tesla|마이크로소프트|microsoft|빅테크|big tech/i,
};
/** 시장 공통 거시 요인(금리·달러·유가·물가·관세) — 대출·부동산 같은 생활 금리 기사는 제외하려고 '시장 금리' 표현만 */
const MACRO_RE = /연준|FOMC|\bfed\b|federal reserve|파월|powell|국채|treasur(?:ies|y (?:yield|bond|note|bill|market|auction)s?)|yield|달러|dollar|유가|\boil\b|crude|OPEC|CPI|PCE|인플레|inflation|기준금리|금리 인하|금리 인상|금리 동결|rate cut|rate hike|관세|tariff|고용지표|payroll|전쟁|지정학/i;
/** 맥락 가치가 낮은 기사 — 생활금융·부동산·보도자료·낚시성 정리 */
const NOISE_RE = /주담대|신용대출|대출 금리|부동산|분양|빌딩|매각 초읽기|청약|전세|아파트|보험|카드사|fn마켓워치|here.?s what happened|sponsored|press release|announces approval of application|enforcement action|\[부고\]|\[인사\]|포토\]|\[포토/i;

/** 국내 매체 기사가 '미국 시장' 기사인지 */
const US_IN_KR_RE = /뉴욕증시|월가|나스닥|다우|S&P|미국|美|연준|FOMC|엔비디아|애플|테슬라|마이크로소프트|빅테크|서학개미/;

/** 매체 가중치(0~2) — 1차 취재·전문성이 높은 곳을 위로 */
const SOURCE_W: Record<string, number> = {
  CoinDesk: 2, 'The Block': 2, Cointelegraph: 1.5, Decrypt: 1.5,
  Bloomberg: 2, CNBC: 2, 'Federal Reserve': 1.5, 'Yahoo Finance': 1, 'CNN Business': 1, MarketScreener: 0.5,
  연합뉴스: 2, 연합인포맥스: 2, 한국경제: 1.5, 매일경제: 1.5, 이데일리: 1.5, 머니투데이: 1.5, 서울경제: 1.5, 조선비즈: 1.5,
};
const sourceW = (s: string) => SOURCE_W[s] ?? 1;

export function tagOf(title: string): NewsTag {
  if (WAR_RE.test(title)) return 'war';
  if (OIL_RE.test(title)) return 'oil';
  if (RATE_RE.test(title)) return 'rate';
  return null;
}

const tsOf = (n: NewsItem): number | null => {
  if (!n.pubDate) return null;
  const t = new Date(n.pubDate).getTime();
  return Number.isFinite(t) ? t : null;
};
const tokens = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2));
/** 제목 토큰 자카드 유사도 — 같은 사건을 여러 매체가 쓴 중복 판정용 */
export function titleSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 관련도 점수. null = 이 시장 기사 아님(또는 노이즈) */
export function newsScore(n: NewsItem, market: BriefMarket, now: number = Date.now()): number | null {
  const t = n.title || '';
  if (!t || !n.link || NOISE_RE.test(t)) return null;
  const core = CORE_RE[market].test(t);
  const macro = MACRO_RE.test(t);
  if (!core && !macro) return null;
  // 코인: 국내 일반 매체의 거시 기사(코인 언급 없음)는 뺀다 — 코인 맥락은 해외 전문 매체·코인 기사로
  if (market === 'coin' && !core && n.category === 'domestic') return null;
  // 해외증시: 국내 매체 기사는 미국 시장을 직접 다룰 때만('실적' 같은 일반어로 국내 종목 기사가 섞이지 않게)
  if (market === 'us' && n.category === 'domestic' && !US_IN_KR_RE.test(t)) return null;
  let s = (core ? 3 : 0) + (macro ? (market === 'coin' ? 1.5 : 2) : 0) + sourceW(n.source);
  const ts = tsOf(n);
  if (ts != null) {
    const h = (now - ts) / 3600_000;
    s += h <= 6 ? 2 : h <= 24 ? 1 : h > 72 ? -2 : 0;
  }
  return s;
}

/**
 * 시장별 뉴스 선별 — 점수순(관련도+매체+신선도) → 같은 사건 중복 제거(유사도 0.6+) → 매체당 최대 3건 → limit.
 * 입력 순서에 좌우되지 않는다.
 */
export function rankNews(items: NewsItem[], market: BriefMarket, limit = 8, now: number = Date.now()): BriefNews[] {
  const scored = items
    .map((n) => ({ n, s: newsScore(n, market, now), ts: tsOf(n) }))
    .filter((x): x is { n: NewsItem; s: number; ts: number | null } => x.s != null)
    .sort((a, b) => b.s - a.s || (b.ts ?? 0) - (a.ts ?? 0));
  const out: BriefNews[] = [];
  const perSource = new Map<string, number>();
  const perTag = new Map<string, number>();   // 시장 고유어 없는 거시 기사만 센다
  let macroOnly = 0;
  for (const { n, ts } of scored) {
    if (out.length >= limit) break;
    if ((perSource.get(n.source) ?? 0) >= 3) continue;
    if (out.some((o) => titleSimilarity(o.title, n.title) >= 0.6)) continue;
    const tag = tagOf(n.title);
    if (!CORE_RE[market].test(n.title)) {
      // 거시 기사(유가·금리)가 목록을 덮지 않게 — 전체의 절반 이하, 같은 주제는 2건까지
      const k = tag ?? '-';
      if (macroOnly >= Math.ceil(limit / 2) || (perTag.get(k) ?? 0) >= 2) continue;
      macroOnly++; perTag.set(k, (perTag.get(k) ?? 0) + 1);
    }
    perSource.set(n.source, (perSource.get(n.source) ?? 0) + 1);
    out.push({ title: n.title, link: n.link, source: n.source, tag, ts });
  }
  return out;
}
/** 하위 호환 이름 */
export const pickNews = rankNews;

/** 전쟁·지정학 뉴스만 별도로(신선도순, 중복 제거) */
export function warNews(items: NewsItem[], limit = 4): BriefNews[] {
  const out: BriefNews[] = [];
  const sorted = items
    .filter((n) => n.title && n.link && WAR_RE.test(n.title) && !NOISE_RE.test(n.title))
    .map((n) => ({ n, ts: tsOf(n) }))
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  for (const { n, ts } of sorted) {
    if (out.length >= limit) break;
    if (out.some((o) => titleSimilarity(o.title, n.title) >= 0.6)) continue;
    out.push({ title: n.title, link: n.link, source: n.source, tag: 'war', ts });
  }
  return out;
}

/* ── 코인 전용 해외 피드 (공신력·속도) ───────────────
 * 일반 금융 RSS(CNBC·블룸버그)엔 코인 기사가 드물어 코인 탭이 국내로만 찼던 문제 해결.
 * CoinDesk·Cointelegraph·Decrypt·The Block — 전부 Vercel(미국 IP)에서 동작, 0.3~0.4초. */
const CRYPTO_RSS: { name: string; url: string }[] = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed' },
  { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
];
const cryptoParser = new Parser({
  timeout: 8000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSSBot/1.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
});

/** 코인 전문 해외 매체 헤드라인(원문 영어, 최신순). 실패 소스는 건너뛴다. */
export async function fetchCryptoNews(perFeed = 10): Promise<NewsItem[]> {
  const jobs = CRYPTO_RSS.map(async (s) => {
    try {
      const feed = await cryptoParser.parseURL(s.url);
      return feed.items.slice(0, perFeed).map((it) => ({
        title: it.title?.trim() ?? '',
        link: it.link ?? '',
        pubDate: it.pubDate ?? it.isoDate,
        source: s.name,
        category: 'international' as const,
      })).filter((i) => i.title && i.link);
    } catch {
      return [] as NewsItem[];
    }
  });
  const res = await Promise.allSettled(jobs);
  const items = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  items.sort((a, b) => (b.pubDate ? new Date(b.pubDate).getTime() : 0) - (a.pubDate ? new Date(a.pubDate).getTime() : 0));
  return items;
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

/** Gemini 프롬프트 — 수치·헤드라인 근거로 "오늘 아침 맥락" 요약(신호 금지, 숫자는 표기 그대로) */
export function buildBriefPrompt(market: BriefMarket, macro: MacroNum[], news: BriefNews[], war: BriefNews[], events: BriefEvent[]): string {
  const facts = macro.map((m) => `${m.label} ${m.value} (${m.changeText})`).join('\n') || '(수집 실패)';
  const heads = [...war, ...news].slice(0, 14).map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join('\n') || '(없음)';
  const evs = events.map((e) => `- ${e.date} ${e.title}`).join('\n') || '(없음)';
  return [
    `너는 ${MARKET_NAME[market]} 아침 브리핑 작성가다. 아래 [수치]·[헤드라인]·[일정]만 근거로 한국어로 요약하라. 영어 헤드라인은 뜻을 정확히 옮겨라.`,
    '구성: headline = 지금 가장 중요한 맥락 한 문장. bullets[0] = 간밤 거시(금리·달러·유가·변동성)를 [수치]의 숫자를 인용해 설명.',
    `bullets[1] = ${MARKET_NAME[market]} 고유 이슈를 [헤드라인] 근거로(어느 매체 보도인지 드러나게). bullets[2] = 오늘 눈여겨볼 변수·일정(없으면 [수치]에서 변동이 큰 항목).`,
    '규칙:',
    '- 매수·매도·목표가·"오를 것/내릴 것" 같은 방향 예측 금지. "~하면 ~압박" 같은 일반적 경향 서술은 가능하되 단정 금지.',
    '- 숫자는 [수치]·[헤드라인]에 적힌 표기 그대로 옮긴다. 예) "$190M"은 "$190M" 그대로("1억 9천만 달러"로 환산 금지), "$85,494"는 "$85,494" 그대로("8만 5천 달러" 금지). 반올림·새 숫자·근거에 없는 사실 금지.',
    '- 매체 이름은 그 매체의 헤드라인 내용에만 붙인다([수치]의 숫자를 특정 매체 보도처럼 쓰지 말 것).',
    '- 서로 다른 헤드라인을 억지로 인과관계로 엮지 말 것.',
    '',
    '[수치]', facts,
    '',
    '[헤드라인]', heads,
    '',
    '[오늘~며칠 일정]', evs,
    '',
    'JSON 으로만 답하라: {"headline":"한 문장(45자 이내)","bullets":["문장(70자 이내)","문장","문장"]}',
  ].join('\n');
}

/**
 * AI 요약 수치 대조 — 문장 속 '단위 붙은 숫자·소수'가 근거 텍스트(수치·헤드라인)에 실제로 있는지 확인.
 * 근거에 없는 숫자를 쓴 문장은 버린다(지어낸 수치 차단). "10년물·2년물·S&P 500" 같은 이름 속 숫자는 검사하지 않는다.
 */
export function verifyAi(headline: string, bullets: string[], evidence: string): { headline: string; bullets: string[]; dropped: number } {
  const norm = (s: string) => s.replace(/(\d),(?=\d)/g, '$1');
  const evNums = norm(evidence).match(/\d+(?:\.\d+)?/g) ?? [];
  // 근거 숫자와 같거나, 근거 숫자의 소수 자리를 잘라 쓴 것(31228.75 → 31228 · 102.23 → 102.2)만 인정 — 부분 문자열 우연 일치는 불인정
  const backed = (x: string) => evNums.some((e) => e === x || (e.startsWith(x) && (e[x.length] === '.' || (x.includes('.') && x.length >= 3))));
  const suspicious = (s: string): boolean => {
    const cleaned = norm(s).replace(/\d+\s*년물|S&P\s*500|나스닥\s*100|\d+\s*(?:시간|일|개월|주|분기|차|가지|건|곳|개|위|번째|년|월)/g, ' ');
    const found = cleaned.match(/\d+\.\d+|\d+(?=\s*(?:%|달러|원|억|조|만|천|배|bp|pt|포인트|\$|[MBK]\b))|(?<=\$)\d+/g) ?? [];
    return found.some((x) => !backed(x));
  };
  const ok = bullets.filter((b) => !suspicious(b));
  return {
    headline: suspicious(headline) ? (ok[0] ?? headline) : headline,
    bullets: ok,
    dropped: bullets.length - ok.length,
  };
}

/* ── 실시간 수치(네이버, 무키·0~15분 지연) ───────────── */
const NAVER_H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  Referer: 'https://m.stock.naver.com/', Accept: 'application/json',
};
interface Quote { value: number; change: number; changeRate: number; tradedAt: string; live: boolean; delay: number }
/** api.stock.naver.com 의 marketindex/{cat}/{code} · futures/{code}/basic · index/{code}/basic 공통 파서 */
async function naverQuote(path: string): Promise<Quote | null> {
  try {
    const res = await fetch(`https://api.stock.naver.com/${path}`, { headers: NAVER_H, next: { revalidate: 30 }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const value = num(j.closePrice);
    if (!value) return null;
    return {
      value,
      change: num(j.fluctuations ?? j.compareToPreviousClosePrice),
      changeRate: num(j.fluctuationsRatio),
      tradedAt: String(j.localTradedAt ?? ''),
      live: j.marketStatus === 'OPEN',
      delay: Number(j.delayTime) || 0,
    };
  } catch {
    return null;
  }
}

/* ── FRED (폴백·과거 통계) ───────────────────────────── */
export interface FredPoint { value: number; prev: number | null; date: string }
export async function fredLatest(seriesId: string): Promise<FredPoint | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=10`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const j = await res.json();
    const obs = ((j?.observations ?? []) as { date: string; value: string }[]).filter((o) => o.value !== '.');
    if (!obs.length) return null;
    return { value: Number(obs[0].value), prev: obs[1] ? Number(obs[1].value) : null, date: obs[0].date };
  } catch {
    return null;
  }
}

const meta = (q: Quote) => ({ asOf: q.tradedAt, live: q.live, delayMin: q.delay });

/** 美 국채금리 — 네이버 실시간, 실패 시 FRED(전일 확정치) */
async function yieldNum(code: string, fredId: string, key: string, label: string, hint: string): Promise<MacroNum | null> {
  const q = await naverQuote(`marketindex/bond/${encodeURIComponent(code)}`);
  if (q) return { key, label, value: `${q.value.toFixed(2)}%`, change: q.change, changeText: fmtPp(q.change), source: '네이버 금융', hint, group: 'macro', ...meta(q) };
  const p = await fredLatest(fredId);
  if (!p) return null;
  const ch = p.prev == null ? null : Math.round((p.value - p.prev) * 100) / 100;
  return { key, label, value: `${p.value.toFixed(2)}%`, change: ch, changeText: ch == null ? '—' : fmtPp(ch), source: 'FRED(확정치)', hint, asOf: p.date, group: 'macro' };
}
async function wtiNum(): Promise<MacroNum | null> {
  const hint = '유가↑ = 인플레 압력 → 금리 기대에 영향(일반적 경향)';
  const q = await naverQuote('marketindex/energy/CLcv1');
  if (q) return { key: 'wti', label: 'WTI 유가(선물)', value: `$${q.value.toFixed(2)}`, change: q.changeRate, changeText: fmtPct(q.changeRate), source: '네이버 금융', hint, group: 'macro', ...meta(q) };
  const p = await fredLatest('DCOILWTICO');
  if (!p) return null;
  const chPct = p.prev ? Math.round((p.value / p.prev - 1) * 1000) / 10 : null;
  return { key: 'wti', label: 'WTI 유가', value: `$${p.value.toFixed(1)}`, change: chPct, changeText: chPct == null ? '—' : fmtPct(chPct, 1), source: 'FRED(확정치)', hint, asOf: p.date, group: 'macro' };
}
async function pctQuote(path: string, key: string, label: string, group: MacroNum['group'], hint?: string, digits = 2): Promise<MacroNum | null> {
  const q = await naverQuote(path);
  if (!q) return null;
  return {
    key, label, value: q.value.toLocaleString('ko-KR', { maximumFractionDigits: digits }),
    change: q.changeRate, changeText: fmtPct(q.changeRate), source: '네이버 금융', hint, group, ...meta(q),
  };
}

type LiveLike = { value: number; change: number; changeRate: number; live?: boolean; tradedAt?: string } | null;
function liveNum(q: LiveLike, key: string, label: string, unit: '원' | 'pt', hint?: string): MacroNum | null {
  if (!q) return null;
  const v = unit === '원' ? `${Math.round(q.value).toLocaleString('ko-KR')}원` : q.value.toLocaleString('ko-KR');
  return { key, label, value: v, change: q.changeRate, changeText: fmtPct(q.changeRate), source: '네이버 금융', hint, asOf: q.tradedAt, live: q.live, group: 'market' };
}

/** 장단기 금리차(10Y−2Y) — 두 금리에서 계산 */
function spreadNum(y10: MacroNum | null, y2: MacroNum | null): MacroNum | null {
  if (!y10 || !y2) return null;
  const v = parseFloat(y10.value) - parseFloat(y2.value);
  const ch = y10.change != null && y2.change != null ? Math.round((y10.change - y2.change) * 100) / 100 : null;
  return {
    key: 'spread', label: '장단기 금리차(10Y−2Y)', value: `${v >= 0 ? '+' : ''}${v.toFixed(2)}%p`,
    change: ch, changeText: ch == null ? '—' : fmtPp(ch), source: '계산', group: 'macro', asOf: y10.asOf,
    hint: v < 0 ? '역전(마이너스) = 경기 둔화 우려 신호로 읽힘' : '플러스 = 정상 곡선',
  };
}

/* 공통 선행 지표 — 시장이 미리 반영하는 것들 */
const vixNum = () => pctQuote('index/.VIX/basic', 'vix', 'VIX(변동성)', 'lead', '↑ = 위험 회피 심리. 20 이상이면 불안 구간으로 봄');
const dxyNum = () => pctQuote('marketindex/exchange/.DXY', 'dxy', '달러인덱스(DXY)', 'lead', '달러 강세 = 위험자산·신흥국 역풍(일반적 경향)');
const nqFut = () => pctQuote('futures/NQcv1/basic', 'nqfut', '나스닥100 선물', 'lead', '정규장 밖에서도 거래 — 다음 장 분위기 힌트');
const esFut = () => pctQuote('futures/EScv1/basic', 'esfut', 'S&P500 선물', 'lead', '정규장 밖에서도 거래 — 다음 장 분위기 힌트');
const us10 = () => yieldNum('US10YT=RR', 'DGS10', 'us10y', '美 10년물 국채금리', '금리↑ = 위험자산(코인·성장주) 유동성 압박(일반적 경향)');
const us2 = () => yieldNum('US2YT=RR', 'DGS2', 'us2y', '美 2년물 국채금리', '단기 금리 = 연준 정책 기대');

/* 코인 수급 지표 */
async function coinFlowNums(): Promise<MacroNum[]> {
  const out: MacroNum[] = [];
  try {
    const { map } = await fetchBitgetFuturesTickers();
    const b = map.get('BTCUSDT');
    if (b) {
      const ch = Math.round(Number(b.change24h) * 10000) / 100;
      out.push({ key: 'btc', label: '비트코인(선물)', value: `$${Number(b.lastPr).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, change: ch, changeText: `${fmtPct(ch)} 24h`, source: 'Bitget', group: 'market', asOf: new Date().toISOString(), live: true });
      if (b.fundingRate != null && b.fundingRate !== '') {
        const f = Number(b.fundingRate) * 100;
        out.push({ key: 'funding', label: 'BTC 펀딩비(8h)', value: `${f >= 0 ? '+' : ''}${f.toFixed(4)}%`, change: null, changeText: f > 0.03 ? '롱 쏠림' : f < 0 ? '숏 쏠림' : '중립권', source: 'Bitget', group: 'crypto', asOf: new Date().toISOString(), live: true, hint: '플러스가 클수록 롱 과열 — 급변 시 청산 연쇄 위험' });
      }
    }
  } catch { /* 시세 없이 */ }
  try {
    const etf = (await getEtfFlows()).BTC;
    if (etf?.latest) {
      const m = etf.latest.netUsd / 1e6;
      out.push({ key: 'etf', label: 'BTC 현물 ETF 순유입', value: `${m >= 0 ? '+' : '−'}$${Math.abs(m).toFixed(0)}M`, change: m, changeText: `${Math.abs(etf.streak)}일 연속 ${etf.streak >= 0 ? '유입' : '유출'}`, source: 'SoSoValue', group: 'crypto', asOf: etf.latest.date, hint: '기관 자금 흐름(전 거래일 집계)' });
    }
  } catch { /* skip */ }
  try {
    const j = await (await fetch('https://api.alternative.me/fng/?limit=2', { signal: AbortSignal.timeout(6000), next: { revalidate: 1800 } })).json();
    const v = j?.data?.[0], p = j?.data?.[1];
    if (v) {
      const d = p ? Number(v.value) - Number(p.value) : null;
      out.push({ key: 'fng', label: '공포·탐욕 지수', value: `${v.value}`, change: d, changeText: `${v.value_classification}${d != null ? ` (${d >= 0 ? '+' : ''}${d})` : ''}`, source: 'alternative.me', group: 'crypto', asOf: new Date(Number(v.timestamp) * 1000).toISOString().slice(0, 10), hint: '25 이하 극단적 공포 · 75 이상 극단적 탐욕' });
    }
  } catch { /* skip */ }
  return out;
}

const compact = (a: (MacroNum | null)[]) => a.filter(Boolean) as MacroNum[];

export async function coinMacro(): Promise<MacroNum[]> {
  const [flow, y10, dxy, vix, nq, wti] = await Promise.all([coinFlowNums(), us10(), dxyNum(), vixNum(), nqFut(), wtiNum()]);
  const by = (k: string) => flow.find((m) => m.key === k) ?? null;
  return compact([by('btc'), nq, vix, dxy, y10, wti, by('funding'), by('etf'), by('fng')]);
}
export async function usMacro(): Promise<MacroNum[]> {
  const [sp, nqi, dj, nq, es, vix, y10, y2, dxy, wti] = await Promise.all([
    worldIndexLive('.INX'), worldIndexLive('.IXIC'), worldIndexLive('.DJI'), nqFut(), esFut(), vixNum(), us10(), us2(), dxyNum(), wtiNum(),
  ]);
  return compact([
    liveNum(sp, 'sp500', 'S&P 500', 'pt'), liveNum(nqi, 'nasdaq', '나스닥 종합', 'pt'), liveNum(dj, 'dow', '다우존스', 'pt'),
    es, nq, vix, y10, y2, spreadNum(y10, y2), dxy, wti,
  ]);
}
export async function krMacro(): Promise<MacroNum[]> {
  const [kospi, kosdaq, usd, nq, es, vix, y10, dxy, wti] = await Promise.all([
    krIndexLive('KOSPI'), krIndexLive('KOSDAQ'), usdKrwLive(), nqFut(), esFut(), vixNum(), us10(), dxyNum(), wtiNum(),
  ]);
  return compact([
    liveNum(kospi, 'kospi', '코스피', 'pt'), liveNum(kosdaq, 'kosdaq', '코스닥', 'pt'),
    liveNum(usd, 'usdkrw', '원/달러 환율', '원', '환율↑ = 외국인 자금 유출 압력(일반적 경향)'),
    nq, es, vix, y10, dxy, wti,
  ]);
}

export async function marketMacro(market: BriefMarket): Promise<MacroNum[]> {
  return market === 'coin' ? coinMacro() : market === 'us' ? usMacro() : krMacro();
}

/**
 * 코인 거시 배경용 3종(10년물·DXY·10년 실질금리) 가벼운 수집.
 * 10Y·DXY 는 네이버 실시간(실패 시 FRED 폴백), 실질금리(TIPS, DFII10)는 FRED 전용.
 * coinAnalysis 라우트가 [[coinMacroContext]] readMacroBias 입력으로 쓴다(수급 전체 재조회 회피).
 */
export interface CoinMacroRates { us10: MacroNum | null; dxy: MacroNum | null; realYield: FredPoint | null }
export async function coinMacroRates(): Promise<CoinMacroRates> {
  const [us10v, dxyv, ry] = await Promise.all([us10(), dxyNum(), fredLatest('DFII10')]);
  return { us10: us10v, dxy: dxyv, realYield: ry };
}
