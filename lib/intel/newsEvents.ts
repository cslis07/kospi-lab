/**
 * 뉴스·연준 공식 자료 → 사건(event) 정리 — 의사결정 엔진 Phase 2(명세 ENGINE_PLAN_KO.md §3).
 *
 * 하는 일(순수 함수, 네트워크 없음):
 *  1) 같은 사건을 다룬 여러 기사를 하나로 묶는다(제목 단어 겹침) — 기사 50개 = 사건 1개(§3-E).
 *  2) 주제 분류(연준·물가·고용/성장·가상자산 정책·거래소 사고·전쟁/유가·시장 급락).
 *  3) 확인 수준: 공식(연준 등 1차 자료) / 복수 보도(다른 언론 2곳 이상) / 단일 보도(미확인).
 *  4) 위기 속보(거래소 사고·전쟁 발발·시장 급락) → 처음 보인 시각부터 2시간 '안전모드'(거래 보류) 이벤트.
 *
 * 하지 않는 일:
 *  - 기사 제목으로 매파/비둘기·호재/악재 방향 점수를 매기지 않는다. 발언 원문·문맥·시장 선반영 여부를
 *    확인하기 전에는 방향을 주지 않는다(§3-C) → 뉴스 그룹의 방향 점수는 비워 둔다.
 *  - 위기 감지는 제목 단어 기반이라 오탐이 있을 수 있다. 그래서 '거래 보류'로만 쓰고(롱·숏 신호로 바꾸지 않음, §3-F),
 *    화면에 출처 링크를 같이 보여 사람이 확인하게 한다.
 */
import type { RiskEvent } from './decisionEngine';

export interface RawNews { title: string; link: string; source: string; pubDate?: string }

export type NewsTopic =
  | 'exchange_outage' | 'war_oil_supply' | 'risk_panic'          // 위기(안전모드)
  | 'fed_policy' | 'inflation' | 'growth_jobs' | 'crypto_policy'; // 참고(방향 점수 없음)

export const TOPIC_LABEL: Readonly<Record<NewsTopic, string>> = {
  exchange_outage: '거래소 사고·해킹', war_oil_supply: '전쟁·유가 공급', risk_panic: '시장 급락',
  fed_policy: '연준·금리', inflation: '물가', growth_jobs: '고용·성장', crypto_policy: '가상자산 정책',
};
export const CRISIS_TOPICS: ReadonlySet<NewsTopic> = new Set(['exchange_outage', 'war_oil_supply', 'risk_panic']);

export type Verification = 'official' | 'multi_source' | 'single_source';
export const VERIFICATION_LABEL: Readonly<Record<Verification, string>> = {
  official: '공식 자료', multi_source: '복수 보도', single_source: '단일 보도·미확인',
};

export interface NewsEvent {
  eventId: string;
  title: string;              // 대표 제목(가장 먼저 나온 기사)
  link: string;
  topic: NewsTopic | null;
  crisis: boolean;
  verification: Verification;
  sources: string[];          // 서로 다른 언론사
  articleCount: number;
  firstSeenAt: string;        // 가장 이른 기사 시각(ISO UTC)
  lastSeenAt: string;
  /** 매파/비둘기·호재/악재 판단 — 원문 확인 전이라 항상 'unclassified' */
  policyStance: 'unclassified';
}

/** 공식 1차 자료로 보는 출처(연준 보도자료 RSS 등) */
const OFFICIAL_SOURCES = /^(Federal Reserve|FRB|연준 공식|SEC|U\.S\. Treasury|White House)$/i;
const OFFICIAL_HOSTS = /(^|\.)(federalreserve\.gov|sec\.gov|treasury\.gov|whitehouse\.gov)$/i;

// 위기 단어는 좁게 잡는다 — 'trade war'·'미사일 발사'·'폭락' 같은 흔한 표현은 넣지 않는다(오탐으로 계속 막히지 않게)
// 거래소 사고는 가상자산 맥락 단어가 같이 있어야 한다(일반 기업 해킹·파산 기사로 코인 거래를 막지 않게)
const CRYPTO_CTX = /\b(crypto|bitcoin|btc|ether(eum)?|eth|solana|xrp|defi|token|stablecoin|binance|coinbase|bybit|okx|bitget|kraken|upbit|bithumb|exchange)\b|거래소|코인|비트코인|이더리움|솔라나|리플|가상자산|암호화폐|디파이|스테이블/i;
const TOPIC_RULES: { topic: NewsTopic; re: RegExp; ctx?: RegExp }[] = [
  { topic: 'exchange_outage', ctx: CRYPTO_CTX, re: /\b(hack(ed|ers?)?|exploited|drained|withdrawals? (halted|suspended|paused|frozen)|exchange (outage|halts? (trading|withdrawals))|insolven(t|cy)|files? for bankruptcy)\b|해킹|탈취|출금\s*(중단|정지|중지)|입출금\s*(중단|정지)|거래소\s*(장애|먹통|파산)|파산\s*신청/i },
  { topic: 'war_oil_supply', re: /\b(invasion|invades?|invaded|declares? war|war (breaks|broke) out|missile (strike|attack)s? on|strait of hormuz|oil supply disruption|pipeline (attack|sabotage))\b|침공|선전포고|전쟁\s*(발발|개시)|호르무즈|원유\s*공급\s*차질/i },
  { topic: 'risk_panic', re: /\b(circuit breakers?|flash crash)\b|서킷\s*브레이커|사이드카\s*발동/i },
  { topic: 'fed_policy', re: /\b(fed|fomc|powell|waller|bowman|barr|jefferson|cook|williams|logan|hammack|kashkari|goolsbee|musalem|schmid|daly|bostic|barkin|harker|rate (cut|hike)s?)\b|연준|파월|금리\s*(인하|인상|동결)/i },
  { topic: 'inflation', re: /\b(cpi|ppi|pce|inflation)\b|물가|인플레/i },
  { topic: 'growth_jobs', re: /\b(payrolls?|jobless|unemployment|gdp|recession|jobs report)\b|고용|실업|경기\s*침체|성장률/i },
  { topic: 'crypto_policy', re: /\b(sec|etf approval|stablecoin (bill|act)|crypto (bill|regulation|rule)s?|genius act|clarity act)\b|가상자산\s*(법|규제)|코인\s*규제|스테이블코인\s*(법|규제)/i },
];

export function classifyTopic(title: string): NewsTopic | null {
  for (const r of TOPIC_RULES) if (r.re.test(title) && (!r.ctx || r.ctx.test(title))) return r.topic;
  return null;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'after', 'over', 'into', 'amid', 'says', 'said', 'will', 'are', 'was', 'has', 'have', 'its', 'not', 'but', 'new', 'more', 'than', 'what', 'how', 'why', 'who']);

/** 구글 뉴스식 꼬리(" - 언론사")·괄호·특수문자 제거 후 단어 집합 */
export function titleTokens(title: string): Set<string> {
  const t = title.replace(/\s+[-–|]\s+[^-–|]{1,40}$/, '').toLowerCase()
    .replace(/<[^>]+>/g, ' ').replace(/[\[\](){}"'“”‘’.,:;!?…·~^*+=/\\|@#%&$]/g, ' ');
  const out = new Set<string>();
  for (const w of t.split(/\s+/)) {
    if (!w) continue;
    const latin = /^[a-z0-9-]+$/.test(w);
    if (latin ? w.length < 3 || STOP.has(w) : w.length < 2) continue;
    out.add(w);
  }
  return out;
}

/** 겹침 계수 = 공통 단어 / 짧은 쪽 단어 수. 짧은 쪽이 3단어 미만이면 같은 사건으로 보지 않는다 */
export function sameStory(a: Set<string>, b: Set<string>, threshold = 0.6): boolean {
  const small = a.size <= b.size ? a : b, big = small === a ? b : a;
  if (small.size < 3) return false;
  let hit = 0;
  for (const w of small) if (big.has(w)) hit++;
  return hit / small.size >= threshold;
}

const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
const isOfficial = (n: RawNews) => OFFICIAL_SOURCES.test(n.source.trim()) || OFFICIAL_HOSTS.test(hostOf(n.link));

function stableId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `n${(h >>> 0).toString(36)}`;
}

/**
 * 기사 → 사건. 시각을 알 수 없는 기사·미래 시각(5분 넘게)·windowHours 보다 오래된 기사는 뺀다.
 * 정렬: 위기 → 시장 주제(연준·물가 등) → 확인 수준 → 기사 수 → 최신(연준 행정 공지처럼 주제 없는 공식 자료가 위를 덮지 않게).
 */
export function clusterNews(items: RawNews[], nowMs: number, windowHours = 24): NewsEvent[] {
  type C = { tokens: Set<string>; arts: { n: RawNews; t: number }[] };
  const clusters: C[] = [];
  const seenLinks = new Set<string>();
  const dated = items
    .map((n) => ({ n, t: n.pubDate ? Date.parse(n.pubDate) : NaN }))
    .filter(({ n, t }) => n.title && Number.isFinite(t) && t <= nowMs + 5 * 60_000 && nowMs - t <= windowHours * 3_600_000)
    .sort((a, b) => a.t - b.t);
  for (const a of dated) {
    if (a.n.link && seenLinks.has(a.n.link)) continue;
    if (a.n.link) seenLinks.add(a.n.link);
    const tk = titleTokens(a.n.title);
    const c = clusters.find((x) => sameStory(x.tokens, tk));
    if (c) { c.arts.push(a); for (const w of tk) c.tokens.add(w); }
    else clusters.push({ tokens: tk, arts: [a] });
  }
  const rank: Record<Verification, number> = { official: 0, multi_source: 1, single_source: 2 };
  return clusters.map((c): NewsEvent => {
    const first = c.arts[0], last = c.arts[c.arts.length - 1];
    const sources = [...new Set(c.arts.map((x) => x.n.source.trim()).filter(Boolean))];
    // 주제: 대표 제목 우선, 없으면 묶인 기사 중 처음 걸리는 것
    const topic = classifyTopic(first.n.title) ?? c.arts.map((x) => classifyTopic(x.n.title)).find((x) => x) ?? null;
    const verification: Verification = c.arts.some((x) => isOfficial(x.n)) ? 'official' : sources.length >= 2 ? 'multi_source' : 'single_source';
    return {
      eventId: stableId(`${first.n.title}|${first.t}`), title: first.n.title.replace(/\s+[-–|]\s+[^-–|]{1,40}$/, ''), link: first.n.link,
      topic, crisis: topic != null && CRISIS_TOPICS.has(topic), verification, sources, articleCount: c.arts.length,
      firstSeenAt: new Date(first.t).toISOString(), lastSeenAt: new Date(last.t).toISOString(), policyStance: 'unclassified',
    };
  }).sort((a, b) => Number(b.crisis) - Number(a.crisis) || Number(b.topic != null) - Number(a.topic != null) || rank[a.verification] - rank[b.verification] ||
    b.articleCount - a.articleCount || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

export const SAFE_MODE_MIN = 120;

/** 위기 사건 → 안전모드 이벤트(처음 보인 시각 + 2시간). 확인되지 않은 속보도 막는다(명세 §4-5) — 방향 신호로는 쓰지 않음 */
export function newsRiskEvents(events: NewsEvent[], nowMs: number, safeMin = SAFE_MODE_MIN): RiskEvent[] {
  return events.filter((e) => e.crisis && nowMs - Date.parse(e.firstSeenAt) <= safeMin * 60_000).map((e) => ({
    id: `news-${e.eventId}`,
    name: `속보(${TOPIC_LABEL[e.topic!]}·${VERIFICATION_LABEL[e.verification]}) "${e.title.length > 38 ? `${e.title.slice(0, 38)}…` : e.title}"`,
    type: e.topic === 'exchange_outage' ? 'exchange_outage' : e.topic === 'risk_panic' ? 'market_panic' : 'geopolitical',
    severity: 'critical',
    blockUntil: new Date(Date.parse(e.firstSeenAt) + safeMin * 60_000).toISOString(),
    verified: e.verification !== 'single_source',
    sourceUrl: e.link,
  }));
}

/* ── 연준 공식 RSS(federalreserve.gov/feeds) ─────────────────────── */

export type FedKind = 'speech' | 'testimony' | 'monetary';
export interface FedItem { kind: FedKind; speaker: string | null; title: string; link: string; venue: string; publishedAt: string }

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
const ent = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** 연준 RSS → 항목. 연설·증언 제목은 "성, 제목" 형식이라 쉼표 앞을 발언자로 본다 */
export function parseFedRss(xml: string, kind: FedKind): FedItem[] {
  const out: FedItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag: string) => { const x = m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return x ? ent(cdata(x[1])) : ''; };
    const title = pick('title').replace(/\s+/g, ' ').trim();
    const t = Date.parse(pick('pubDate'));
    if (!title || !Number.isFinite(t)) continue;
    const comma = title.indexOf(',');
    const speaker = kind !== 'monetary' && comma > 0 && comma <= 20 ? title.slice(0, comma).trim() : null;
    out.push({ kind, speaker, title: speaker ? title.slice(comma + 1).trim() : title, link: pick('link'), venue: pick('description'), publishedAt: new Date(t).toISOString() });
  }
  return out;
}

/**
 * 연준 통화정책 보도자료 → 위험 이벤트.
 *  - FOMC 성명: 공개 시각 + postMin 까지 보류(발표 전 보류는 공식 일정 쪽에서 이미 건다)
 *  - 긴급·임시 회의 결정: 공개 후 2시간 안전모드
 *  - 의사록: 참고(high — 막지 않음)
 * 연설·증언은 위험 이벤트로 만들지 않는다(방향 점수도 없음 — 원문 확인 전).
 */
export function fedRiskEvents(items: FedItem[], nowMs: number, postMin = 30): RiskEvent[] {
  const out: RiskEvent[] = [];
  for (const f of items) {
    if (f.kind !== 'monetary') continue;
    const t = Date.parse(f.publishedAt);
    if (!Number.isFinite(t) || t > nowMs + 5 * 60_000 || nowMs - t > 6 * 3_600_000) continue;
    const base = { id: `fed-${t}`, type: 'fed_statement' as const, verified: true, sourceUrl: f.link };
    if (/\b(emergency|unscheduled|intermeeting)\b/i.test(f.title)) {
      out.push({ ...base, name: `연준 긴급 결정: ${f.title}`, severity: 'critical', blockUntil: new Date(t + SAFE_MODE_MIN * 60_000).toISOString() });
    } else if (/FOMC statement/i.test(f.title)) {
      out.push({ ...base, name: '연준 FOMC 성명 공개', severity: 'critical', blockUntil: new Date(t + postMin * 60_000).toISOString() });
    } else if (/^Minutes of the Federal Open Market Committee/i.test(f.title)) {
      out.push({ ...base, name: 'FOMC 의사록 공개', severity: 'high', blockUntil: new Date(t + postMin * 60_000).toISOString() });
    }
  }
  return out;
}
