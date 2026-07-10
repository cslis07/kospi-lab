import { NextRequest, NextResponse } from 'next/server';
import {
  Candle, analyzeTimeframe, srZones, fibonacci, atr, emaSeries,
  detectRsiDivergence,
} from '@/lib/coinAnalysis';
import {
  analyzeSupply, gradeFinancials, buildStockVerdict,
  classifyDisclosure, detectPolicy,
  InvestorDay, SupplyDemand, MarketContext, StockExtras, Disclosure,
} from '@/lib/stockAnalysis';
import { backtestStock, StockBacktestResult } from '@/lib/stockBacktest';
import { fetchKisFinancialRatio } from '@/lib/kisFinance';
import { claudeBriefing } from '@/lib/anthropic';
import { cioViewFor, MUST_WATCH, MERRILL_CIO } from '@/lib/marketReference';
import { fetchMacroIndicators } from '@/lib/macroIndicators';
const MERRILL_SRC = `${MERRILL_CIO.source} ${MERRILL_CIO.date}`;
import { CALENDAR_EVENTS } from '@/lib/calendarEvents';

export const maxDuration = 30;
export const preferredRegion = 'icn1'; // 네이버·KIS 한국 API → 서울 리전

const NAVER_H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com/',
  'Accept': 'application/json',
};
const YF_H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' };

function parseNum(s: unknown) { return parseFloat(String(s ?? 0).replace(/[,+%\s]/g, '')) || 0; }

/* ── 기본 정보 (가격·종목명·시장·52주) ────────────────── */
async function fetchBasic(ticker: string) {
  const [basicRes, integRes] = await Promise.all([
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/basic`, { headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(7000) }),
    fetch(`https://m.stock.naver.com/api/stock/${ticker}/integration`, { headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(7000) }),
  ]);
  if (!basicRes.ok) throw new Error(`basic ${basicRes.status}`);
  const basic = await basicRes.json();
  const integ = integRes.ok ? await integRes.json() : {};
  const infos: { key: string; value: string }[] = integ.totalInfos ?? [];
  const get = (k: string) => infos.find((i) => i.key === k)?.value ?? '-';
  return {
    name: basic.stockName ?? ticker,
    price: parseNum(basic.closePrice),
    change: parseNum(basic.compareToPreviousClosePrice),
    changeRate: parseNum(basic.fluctuationsRatio),
    market: basic.stockExchangeType?.name ?? 'KOSPI',
    volume: get('거래량'), tradingValue: get('거래대금'), marketCap: get('시가총액'),
    high52w: parseNum(get('52주최고')) || parseNum(get('52주 최고')) || null,
    low52w: parseNum(get('52주최저')) || parseNum(get('52주 최저')) || null,
    per: parseNum(get('PER')) || null, pbr: parseNum(get('PBR')) || null,
  };
}

/* ── 일봉 (Yahoo 1y → Naver 폴백) → Candle[] ─────────── */
async function fetchDaily(ticker: string, market: string): Promise<Candle[]> {
  const suffix = market.includes('KOSDAQ') ? '.KQ' : '.KS';
  const tryYf = async (sym: string) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y&includePrePost=false`;
    let r = await fetch(url, { headers: YF_H, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) r = await fetch(url.replace('query1', 'query2'), { headers: YF_H, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    return r;
  };
  try {
    let res = await tryYf(ticker + suffix);
    if (!res.ok && suffix === '.KS') res = await tryYf(ticker + '.KQ');
    if (res.ok) {
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const ts: number[] = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0] ?? {};
      const candles: Candle[] = ts.map((t, i) => ({
        ts: t * 1000,
        o: q.open?.[i] ?? q.close?.[i] ?? 0,
        h: q.high?.[i] ?? q.close?.[i] ?? 0,
        l: q.low?.[i] ?? q.close?.[i] ?? 0,
        c: q.close?.[i] ?? 0,
        v: q.volume?.[i] ?? 0,
        qv: 0,
      })).filter((c) => c.c > 0);
      if (candles.length > 60) return candles;
    }
  } catch { /* naver 폴백 */ }
  // Naver 폴백 (최대 ~1년)
  try {
    const end = new Date(); const start = new Date(end); start.setFullYear(start.getFullYear() - 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://m.stock.naver.com/api/stock/${ticker}/price?startDate=${fmt(start)}&endDate=${fmt(end)}&timeframe=day`;
    const res = await fetch(url, { headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const raw: Record<string, unknown>[] = await res.json();
    return raw.map((r) => {
      const d = String(r.localTradedAt ?? '').replace(/-/g, '');
      const ts = d.length === 8 ? new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00+09:00`).getTime() : 0;
      return { ts, o: parseNum(r.openPrice), h: parseNum(r.highPrice), l: parseNum(r.lowPrice), c: parseNum(r.closePrice), v: Number(r.accumulatedTradingVolume ?? 0), qv: 0 };
    }).filter((c) => c.c > 0).sort((a, b) => a.ts - b.ts);
  } catch { return []; }
}

/* ── 투자자 수급 (10일) ──────────────────────────────── */
async function fetchInvestor(ticker: string): Promise<InvestorDay[]> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/stock/${ticker}/trend`, { headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(7000) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json();
    if (!Array.isArray(raw)) return [];
    const num = (s: unknown) => Number(String(s ?? '').replace(/,/g, '').replace(/[+\s]/g, '')) || 0;
    const fmtD = (s: string) => (String(s).length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : String(s));
    return raw.slice(0, 10).map((r) => ({
      date: fmtD(r.bizdate ?? r.localTradedAt ?? ''),
      individual: num(r.individualPureBuyQuant),
      foreign: num(r.foreignerPureBuyQuant),
      institution: num(r.organPureBuyQuant),
      foreignHoldRatio: r.foreignerHoldRatio != null ? (parseFloat(String(r.foreignerHoldRatio).replace(/[%,\s]/g, '')) || null) : null,
      close: num(r.closePrice),
    }));
  } catch { return []; }
}

/* ── KIS 재무 (ROE·부채·성장) — 서울 리전에서 안정 ───── */
async function fetchFinancials(ticker: string): Promise<{ roe: number|null; debtRatio: number|null; revenueGrowth: number|null; netIncomePositive: boolean|null }> {
  const empty = { roe: null, debtRatio: null, revenueGrowth: null, netIncomePositive: null };
  try {
    const r = await fetchKisFinancialRatio(ticker);
    if (!r) return empty;
    return { roe: r.roe, debtRatio: r.debtRatio, revenueGrowth: r.revenueGrowth, netIncomePositive: r.netIncomePositive };
  } catch { return empty; }
}

/* ── 코스피 + 매크로(환율) 컨텍스트 ──────────────────── */
interface FxLite { value: number; changeRate: number }
async function fetchMacro(origin: string): Promise<{ market: MarketContext; usdkrw: FxLite | null; jpykrw: FxLite | null }> {
  try {
    const res = await fetch(`${origin}/api/market`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    const chg = j?.kospi?.changeRate ?? null;
    const fx = (o: { value?: number; changeRate?: number } | null | undefined): FxLite | null =>
      o && o.value != null ? { value: o.value, changeRate: o.changeRate ?? 0 } : null;
    return {
      market: { kospiChange: chg, kospiTrend: chg === null ? null : chg >= 0.3 ? 'up' : chg <= -0.3 ? 'down' : 'flat' },
      usdkrw: fx(j?.usdkrw), jpykrw: fx(j?.jpykrw),
    };
  } catch { return { market: { kospiChange: null, kospiTrend: null }, usdkrw: null, jpykrw: null }; }
}

/* 다음 미국 CPI 발표일 (캘린더) */
function nextCpi(): { date: string; daysUntil: number } | null {
  const now = Date.now();
  const upcoming = CALENDAR_EVENTS
    .filter((e) => e.category === 'indicator' && e.title.includes('CPI'))
    .map((e) => ({ date: e.date, ts: new Date(`${e.date}T21:30:00+09:00`).getTime() }))
    .filter((e) => e.ts >= now - 6 * 3600_000)
    .sort((a, b) => a.ts - b.ts)[0];
  return upcoming ? { date: upcoming.date, daysUntil: Math.max(0, Math.round((upcoming.ts - now) / 86400_000)) } : null;
}

/* ── 종목 뉴스 (네이버) ──────────────────────────────── */
interface NewsItem { title: string; source: string; datetime: string; link: string; sentiment: 'pos' | 'neg' | 'neu' }
const POS = ['상승', '급등', '신고가', '돌파', '호재', '수주', '흑자', '개선', '순매수', '목표가 상향', '최대 실적', '성장', '기대', '수혜'];
const NEG = ['하락', '급락', '신저가', '이탈', '악재', '적자', '감소', '순매도', '목표가 하향', '리스크', '소송', '규제', '부진', '우려', '경고'];
function sentiment(t: string): 'pos' | 'neg' | 'neu' {
  const p = POS.filter((w) => t.includes(w)).length, n = NEG.filter((w) => t.includes(w)).length;
  return p > n ? 'pos' : n > p ? 'neg' : 'neu';
}
async function fetchNews(ticker: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/news/stock/${ticker}?pageSize=8&page=1`, { headers: NAVER_H, cache: 'no-store', signal: AbortSignal.timeout(7000) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = await res.json();
    const items: NewsItem[] = [];
    for (const grp of raw ?? []) {
      for (const it of grp.items ?? []) {
        const dt = String(it.datetime ?? '');
        items.push({
          title: String(it.title ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
          source: it.officeName ?? '',
          datetime: dt.length === 12 ? `${dt.slice(4, 6)}/${dt.slice(6, 8)} ${dt.slice(8, 10)}:${dt.slice(10, 12)}` : dt,
          link: `https://n.news.naver.com/mnews/article/${it.officeId}/${it.articleId}`,
          sentiment: sentiment(String(it.title ?? '')),
        });
        if (items.length >= 8) break;
      }
      if (items.length >= 8) break;
    }
    return items;
  } catch { return []; }
}

/* ── DART 공시 (최근 30일) — 분류 포함 ──────────────── */
async function fetchDisclosures(ticker: string): Promise<Disclosure[]> {
  const key = process.env.DART_API_KEY;
  if (!key) return [];
  try {
    const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 30);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const p = new URLSearchParams({ crtfc_key: key, stock_code: ticker, bgn_de: fmt(start), end_de: fmt(end), sort: 'date', sort_mth: 'desc', page_no: '1', page_count: '30' });
    const res = await fetch(`https://opendart.fss.or.kr/api/list.json?${p}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) });
    const j = await res.json();
    if (j.status !== '000') return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (j.list ?? []).map((d: any) => {
      const cls = classifyDisclosure(d.report_nm ?? '');
      const dt = String(d.rcept_dt ?? '');
      return {
        date: dt.length === 8 ? `${dt.slice(4, 6)}/${dt.slice(6, 8)}` : dt,
        type: d.report_nm ?? '', url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
        ...cls,
      } as Disclosure;
    });
  } catch { return []; }
}

/* ── 백테스트 캐시 ───────────────────────────────────── */
const _btCache = new Map<string, { r: StockBacktestResult; ts: number }>();
function cachedBt(ticker: string, candles: Candle[]): StockBacktestResult {
  const hit = _btCache.get(ticker);
  if (hit && Date.now() - hit.ts < 10 * 60 * 1000) return hit.r;
  const r = backtestStock(candles);
  _btCache.set(ticker, { r, ts: Date.now() });
  return r;
}

/* ── "왜 오르나/내리나" 드라이버 ─────────────────────── */
function buildMovement(name: string, candles: Candle[], supply: SupplyDemand | null, news: NewsItem[], market: MarketContext, changeRate: number, disclosures: Disclosure[], policy: { tone: 'pos' | 'neg'; label: string }[]) {
  const n = candles.length;
  const c = candles[n - 1];
  const pct5d = n > 5 ? ((c.c - candles[n - 6].c) / candles[n - 6].c) * 100 : 0;
  const dir: 'up' | 'down' | 'flat' = changeRate >= 0.5 ? 'up' : changeRate <= -0.5 ? 'down' : Math.abs(pct5d) >= 2 ? (pct5d > 0 ? 'up' : 'down') : 'flat';
  const drivers: { text: string; tone: 'up' | 'down' | 'warn' | 'info' }[] = [];

  if (supply) {
    if (supply.foreignStreak >= 2) drivers.push({ text: `외국인 ${supply.foreignStreak}일 연속 순매수 — 스마트머니가 가격을 떠받치는 중`, tone: 'up' });
    else if (supply.foreignStreak <= -2) drivers.push({ text: `외국인 ${Math.abs(supply.foreignStreak)}일 연속 순매도 — 외국인 이탈이 하락 압력`, tone: 'down' });
    if (supply.foreign5d > 0 && supply.inst5d > 0) drivers.push({ text: '외국인·기관 동반 순매수(5일) — 수급 주도 상승', tone: 'up' });
    else if (supply.foreign5d < 0 && supply.inst5d < 0) drivers.push({ text: '외국인·기관 동반 순매도(5일) — 기관성 자금 이탈', tone: 'down' });
    if (supply.indiv5d > 0 && supply.foreign5d < 0) drivers.push({ text: '개인만 순매수·외국인 순매도 — 개인이 물량 받는 전형적 약세 구도', tone: 'warn' });
    if (supply.holdRatioChange5d !== null && Math.abs(supply.holdRatioChange5d) >= 0.1) {
      drivers.push({ text: `외국인 보유율 5일 ${supply.holdRatioChange5d >= 0 ? '+' : ''}${supply.holdRatioChange5d.toFixed(2)}%p — ${supply.holdRatioChange5d >= 0 ? '지분 확대' : '지분 축소'} 진행`, tone: supply.holdRatioChange5d >= 0 ? 'up' : 'down' });
    }
  }

  // 거래량
  const avgVol = candles.slice(-21, -1).reduce((a, x) => a + x.v, 0) / 20;
  const volRatio = avgVol > 0 ? c.v / avgVol : 1;
  if (volRatio >= 2) drivers.push({ text: `거래량 평균 ${volRatio.toFixed(1)}배 급증 — 대량 매매로 방향에 실체 있음`, tone: 'info' });

  // 52주
  const yh = Math.max(...candles.map((x) => x.h)), yl = Math.min(...candles.map((x) => x.l));
  if (c.c >= yh * 0.99) drivers.push({ text: '52주 신고가 근접·돌파 — 저항 없는 구간, 모멘텀 강세', tone: 'up' });
  else if (c.c <= yl * 1.02) drivers.push({ text: '52주 신저가 근접 — 매물 압박 지속, 바닥 미확인', tone: 'down' });

  // 시장 동조
  if (market.kospiTrend === 'down' && dir === 'down') drivers.push({ text: `코스피 약세(${market.kospiChange?.toFixed(2)}%) 동조 — 시장 전반 위험회피`, tone: 'down' });
  else if (market.kospiTrend === 'up' && dir === 'up') drivers.push({ text: `코스피 강세(${market.kospiChange?.toFixed(2)}%) 동조 — 시장 순풍`, tone: 'up' });

  // 공시 (중요도 high 우선)
  const bigDisc = disclosures.filter((d) => d.importance === 'high' && d.sentiment !== 'neu').slice(0, 2);
  for (const d of bigDisc) drivers.push({ text: `공시(${d.date}): ${d.label}`, tone: d.sentiment === 'pos' ? 'up' : 'down' });

  // 정책·테마
  for (const p of policy) drivers.push({ text: `정책 재료: ${p.label}`, tone: p.tone === 'pos' ? 'up' : 'down' });

  // 뉴스
  const pos = news.filter((x) => x.sentiment === 'pos').length, neg = news.filter((x) => x.sentiment === 'neg').length;
  if (neg >= 2 && neg > pos) drivers.push({ text: `최신 뉴스 악재성 ${neg}건 — 심리 압박 요인`, tone: 'down' });
  else if (pos >= 2 && pos > neg) drivers.push({ text: `최신 뉴스 호재성 ${pos}건 — 심리 지지 요인`, tone: 'up' });

  if (!drivers.length) drivers.push({ text: '뚜렷한 단일 재료 없이 수급·추세 균형 구간 — 방향성 대기', tone: 'info' });
  return { direction: dir, changeRate, pct5d, drivers };
}

/* ── AI 브리핑 (3분 캐시) ────────────────────────────── */
const _aiCache = new Map<string, { text: string; ts: number }>();
async function aiBriefing(name: string, ticker: string, summary: string, newsTitles: string[]) {
  const hit = _aiCache.get(ticker);
  if (hit && Date.now() - hit.ts < 3 * 60 * 1000) return { text: hit.text };
  const prompt = `당신은 한국 주식 분석 도우미입니다. 방법론: ①일봉 추세(EMA 배열) ②투자자 수급(외국인·기관 순매수가 한국 시장의 핵심) ③외국인 보유율 추세 ④거래량 ⑤52주 위치 ⑥밸류에이션은 안전마진 필터 ⑦메릴린치 CIO 업종의견(하향식) ⑧필수 경제지표(미국물가·엔화·원달러·반도체수출·가계부채). 개인은 공매도가 어려워 매수우위/중립/비중축소로 판단.

## ${name}(${ticker}) 현황
${summary}

## 최신 뉴스
${newsTitles.length ? newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(없음)'}

## 요청 (각 항목 "【제목】"으로 시작)
【지금 왜 움직이나】 현재 오르/내리는 이유를 수급·공시·정책·뉴스 근거로 2~3문장 추정.
【수급 해석】 외국인·기관 흐름의 의미 1~2문장.
【공시·정책 체크】 최근 공시나 정부 정책·테마가 주가에 미칠 영향 1~2문장 (해당 없으면 "특이 공시·정책 없음").
【업종·매크로】 메릴린치 CIO 업종 의견과 필수 경제지표(원달러·엔화·미국물가·반도체수출)가 이 종목에 주는 시사점 1~2문장.
【종합 판단】 매수우위/중립/비중축소 + 근거 2문장.
한국어. 마지막 줄에 "투자 권유가 아닌 참고 정보입니다."`;
  const out = await claudeBriefing(prompt, 1100, 'stock-analysis');
  if (out.text) _aiCache.set(ticker, { text: out.text, ts: Date.now() });
  return out;
}

/* ── 메인 ────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get('ticker') ?? '').trim();
  if (!/^\d{6}$/.test(ticker)) return NextResponse.json({ error: '6자리 종목코드가 필요합니다.' }, { status: 400 });
  const origin = req.nextUrl.origin;

  try {
    const basic = await fetchBasic(ticker);
    const [candles, investor, fin0, macro, news, disclosures, macroInd] = await Promise.all([
      fetchDaily(ticker, basic.market),
      fetchInvestor(ticker),
      fetchFinancials(ticker),
      fetchMacro(origin),
      fetchNews(ticker),
      fetchDisclosures(ticker),
      fetchMacroIndicators(),
    ]);
    const kospi = macro.market;
    if (candles.length < 60) return NextResponse.json({ error: '차트 데이터 부족(신규상장·거래정지 가능)' }, { status: 502 });

    const price = basic.price || candles[candles.length - 1].c;
    const daily = analyzeTimeframe('D', candles);
    const zones = srZones(candles, price, atr(candles));
    const fib = fibonacci(candles, price);
    const supply = investor.length >= 3 ? analyzeSupply(investor) : null;
    const fin = gradeFinancials({
      per: basic.per, pbr: basic.pbr, roe: fin0.roe ?? null,
      debtRatio: fin0.debtRatio ?? null, revenueGrowth: fin0.revenueGrowth ?? null,
      netIncomePositive: fin0.netIncomePositive ?? null,
    });
    // 정책·테마 신호 + 공시 촉매 (뉴스 + 공시 제목 스캔)
    const policy = detectPolicy([...news.map((n) => n.title), ...disclosures.map((d) => d.type)]);
    const discPos = disclosures.filter((d) => d.sentiment === 'pos' && d.importance === 'high').length;
    const discNeg = disclosures.filter((d) => d.sentiment === 'neg' && d.importance === 'high').length;

    // 메릴린치 CIO 업종 의견
    const cio = cioViewFor(ticker, basic.name);

    const extras: StockExtras = {
      supply, fin, market: kospi,
      catalyst: { discPos, discNeg, policyPos: policy.filter((p) => p.tone === 'pos').length, policyNeg: policy.filter((p) => p.tone === 'neg').length },
      cio: cio ? { sector: cio.sector, stance: cio.stance, label: cio.label } : null,
    };
    const verdict = buildStockVerdict(daily, candles, fib, zones, extras);

    // 필수 경제 지표 (라이브 환율 + CPI 일정 + 실측 매크로)
    const cpi = nextCpi();
    const macroByKey: Record<string, { value: number; unit: string; label: string; change: number | null; changeLabel: string; source: string } | null> = {
      us_cpi: macroInd.usCpi, semicon: macroInd.semiconExport, debt: macroInd.householdDebt,
    };
    // 부동산은 별도 항목이 아니라 debt 항목과 함께 — MUST_WATCH의 debt는 '가계부채·부동산'이므로 둘 다 노출
    const indicators = MUST_WATCH.map((m) => ({
      key: m.key, label: m.label, why: m.why,
      value: m.liveKey === 'usdkrw' ? macro.usdkrw : m.liveKey === 'jpykrw' ? macro.jpykrw : null,
      unit: m.liveKey ? '원' : null,
      event: m.eventCategory === 'cpi' && cpi ? cpi : null,
      macro: macroByKey[m.key] ?? null,               // 실측 지표값(있으면)
      realEstate: m.key === 'debt' ? macroInd.realEstate : null, // 가계부채 카드에 부동산 병기
    }));

    // 차트 오버레이 (일봉 60개 + EMA20/60)
    const closes = candles.map((c) => c.c);
    const e20 = emaSeries(closes, 20), e60 = emaSeries(closes, 60);
    const chart = candles.map((c, i) => ({ ts: c.ts, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, ema20: e20[i], ema60: e60[i] })).slice(-60);

    const divergence = detectRsiDivergence(candles);
    const movement = buildMovement(basic.name, candles, supply, news, kospi, basic.changeRate, disclosures, policy);
    if (cio && cio.stance !== 'neutral') {
      movement.drivers.push({ text: `메릴린치 CIO ${cio.sector} ${cio.label} 의견 — 업종 차원 ${cio.stance === 'overweight' ? '우호' : '역풍'}`, tone: cio.stance === 'overweight' ? 'up' : 'down' });
    }
    // 환율 급변동 매크로 드라이버
    if (macro.usdkrw && Math.abs(macro.usdkrw.changeRate) >= 0.5) {
      movement.drivers.push({ text: `원-달러 ${macro.usdkrw.changeRate >= 0 ? '상승(원화 약세)' : '하락(원화 강세)'} ${macro.usdkrw.changeRate.toFixed(2)}% — 외국인 수급 ${macro.usdkrw.changeRate >= 0 ? '이탈 압력' : '우호'}`, tone: macro.usdkrw.changeRate >= 0 ? 'down' : 'up' });
    }
    const backtest = cachedBt(ticker, candles);

    const summary =
      `가격 ${price.toLocaleString()}원 (${basic.changeRate >= 0 ? '+' : ''}${basic.changeRate}%) · ${basic.market}\n` +
      `추세: 일봉 EMA ${daily.emaAlign}, 구조 ${daily.structure}, RSI ${daily.rsi.toFixed(0)}, 200일선 ${daily.ema200 && price >= daily.ema200 ? '위' : '아래'}\n` +
      (supply ? `수급(5일): 외국인 ${supply.foreign5d >= 0 ? '+' : ''}${supply.foreign5d.toLocaleString()}주(${supply.foreignStreak}일연속), 기관 ${supply.inst5d >= 0 ? '+' : ''}${supply.inst5d.toLocaleString()}주, 개인 ${supply.indiv5d >= 0 ? '+' : ''}${supply.indiv5d.toLocaleString()}주, 외국인보유율 ${supply.holdRatioNow?.toFixed(2)}%(${supply.holdRatioChange5d !== null ? `${supply.holdRatioChange5d >= 0 ? '+' : ''}${supply.holdRatioChange5d.toFixed(2)}%p` : '-'})\n` : '') +
      `밸류: PER ${basic.per ?? '-'}, PBR ${basic.pbr ?? '-'}, 재무 ${fin.grade ?? '-'}등급\n` +
      (disclosures.length ? `최근 공시: ${disclosures.slice(0, 5).map((d) => `${d.date} ${d.type}${d.sentiment !== 'neu' ? `(${d.sentiment === 'pos' ? '호재' : '악재'})` : ''}`).join(' / ')}\n` : '') +
      (policy.length ? `정책·테마: ${policy.map((p) => p.label).join(' / ')}\n` : '') +
      (cio ? `메릴린치 CIO 업종의견: ${cio.sector} ${cio.label}(${MERRILL_SRC})\n` : '') +
      `필수지표: 원달러 ${macro.usdkrw ? `${Math.round(macro.usdkrw.value)}원(${macro.usdkrw.changeRate >= 0 ? '+' : ''}${macro.usdkrw.changeRate.toFixed(2)}%)` : '-'}, 엔화 ${macro.jpykrw ? `${macro.jpykrw.value.toFixed(1)}원` : '-'}` +
      `${macroInd.usCpi ? `, 미국CPI ${macroInd.usCpi.value}%(YoY, ${macroInd.usCpi.label})` : cpi ? `, 미CPI ${cpi.daysUntil}일 후` : ''}` +
      `${macroInd.semiconExport ? `, 반도체수출 ${macroInd.semiconExport.value}억달러(${macroInd.semiconExport.change !== null ? `YoY ${macroInd.semiconExport.change >= 0 ? '+' : ''}${macroInd.semiconExport.change}%` : ''})` : ''}` +
      `${macroInd.householdDebt ? `, 가계신용 ${macroInd.householdDebt.value}조원` : ''}` +
      `${macroInd.realEstate ? `, 주택가격지수 ${macroInd.realEstate.value}(${macroInd.realEstate.change !== null ? `MoM ${macroInd.realEstate.change >= 0 ? '+' : ''}${macroInd.realEstate.change}%` : ''})` : ''}\n` +
      `판정: ${verdict.state} / 점수 ${verdict.score} / ${verdict.stance} / 진입가능 ${verdict.entryOk}\n` +
      `근거: ${verdict.reasons.slice(0, 5).join(' / ')}`;
    const ai = await aiBriefing(basic.name, ticker, summary, news.map((n) => n.title));

    return NextResponse.json({
      ticker, name: basic.name, market: basic.market, updatedAt: Date.now(),
      price, change: basic.change, changeRate: basic.changeRate,
      high52w: basic.high52w, low52w: basic.low52w,
      volume: basic.volume, tradingValue: basic.tradingValue, marketCap: basic.marketCap,
      per: basic.per, pbr: basic.pbr,
      daily, zones, fib, chart, divergence,
      supply, investor, fin, kospi, movement, verdict, backtest, news,
      disclosures, policy, cio, indicators,
      cioSource: MERRILL_SRC,
      aiBriefing: ai.text ?? null, aiError: ai.error ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
