/**
 * SoSoValue 거시 이벤트 캘린더(GET /openapi/v1/macro/events, 이벤트별 /history에 컨센서스) — 순수 함수.
 * 서버 로더는 app/api/macro/events/route.ts. 달력(/calendar·/tools)에 칩으로 합칠 때 같은 날 같은 지표가
 * 이미 있으면(정적 일정·나우캐스트 발표일) 겹쳐 그리지 않는다.
 */

export interface SosoDay { date: string; events: string[] }
export interface MacroEvt { date: string; name: string; ko: string; key: string | null }
export interface MacroRelease { date: string; name: string; ko: string; actual: string; forecast: string; previous: string }

/** 이벤트명 → [같은 지표 판별 키, 한국어]. 앞에서부터 처음 맞는 것 */
const MAP: [RegExp, string, string][] = [
  [/fomc|fed(eral)? funds|interest rate decision/i, 'fomc', 'FOMC 금리 결정'],
  [/core pce/i, 'pce', '근원 PCE'],
  [/\bpce\b/i, 'pce', 'PCE'],
  [/core cpi/i, 'cpi', '근원 CPI'],
  [/\bcpi\b/i, 'cpi', 'CPI'],
  [/core ppi/i, 'ppi', '근원 PPI'],
  [/\bppi\b/i, 'ppi', 'PPI'],
  [/nonfarm|non-farm/i, 'jobs', '비농업 고용'],
  [/unemployment rate/i, 'jobs', '실업률'],
  [/initial jobless|jobless claims/i, 'claims', '신규 실업수당 청구'],
  [/\badp\b/i, 'adp', 'ADP 고용'],
  [/jolts/i, 'jolts', 'JOLTS 구인'],
  [/\bgdp\b/i, 'gdp', 'GDP'],
  [/retail sales/i, 'retail', '소매판매'],
  [/ism manufacturing/i, 'ism', 'ISM 제조업'],
  [/ism (non-manufacturing|services)/i, 'ism-s', 'ISM 서비스업'],
  [/s&p global .*manufacturing/i, 'pmi', 'S&P 제조업 PMI'],
  [/s&p global .*services/i, 'pmi-s', 'S&P 서비스업 PMI'],
  [/michigan|consumer sentiment/i, 'umich', '미시간 소비자심리'],
  [/consumer confidence/i, 'cb', '소비자신뢰'],
  [/fomc minutes/i, 'minutes', 'FOMC 의사록'],
  [/new home sales/i, 'nhs', '신규 주택판매'],
  [/existing home sales/i, 'ehs', '기존 주택판매'],
  [/durable goods/i, 'durable', '내구재 주문'],
  [/industrial production/i, 'ip', '산업생산'],
];

export function classify(name: string): { key: string | null; ko: string } {
  // 의사록은 'FOMC'에 먼저 걸리지 않게 따로 본다
  if (/minutes/i.test(name)) return { key: 'minutes', ko: 'FOMC 의사록' };
  for (const [re, key, ko] of MAP) if (re.test(name)) return { key, ko: /\(yoy\)/i.test(name) ? `${ko}(전년비)` : /\(mom\)/i.test(name) ? `${ko}(전월비)` : ko };
  return { key: null, ko: name };
}

export function flattenEvents(days: SosoDay[]): MacroEvt[] {
  const out: MacroEvt[] = [];
  for (const d of days ?? []) for (const name of d?.events ?? []) {
    if (!d.date || !name) continue;
    const n = name.trim();
    const c = classify(n);
    out.push({ date: d.date.slice(0, 10), name: n, ko: c.ko, key: c.key });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 같은 날 같은 키 — (전년비)/(전월비)처럼 한 지표 여러 줄이면 달력엔 하나만 */
export function dedupeForCalendar(evts: MacroEvt[], existing: { date: string; label: string }[]): MacroEvt[] {
  const has = new Set<string>();
  for (const e of existing) { const k = keyOfLabel(e.label); if (k) has.add(`${e.date}|${k}`); }
  const out: MacroEvt[] = [];
  for (const e of evts) {
    const id = `${e.date}|${e.key ?? e.name}`;
    if (has.has(id)) continue;
    has.add(id); out.push(e);
  }
  return out;
}

/** 한국어 기존 라벨(CPI·PCE·고용·FOMC 금리 결정…)도 같은 키로 — dedupe 용 */
const KO_KEY: [RegExp, string][] = [[/FOMC 금리/, 'fomc'], [/의사록/, 'minutes'], [/PCE/, 'pce'], [/CPI/, 'cpi'], [/PPI/, 'ppi'], [/고용|실업률/, 'jobs'], [/GDP/, 'gdp'], [/소매판매/, 'retail']];
export function keyOfLabel(label: string): string | null {
  for (const [re, k] of KO_KEY) if (re.test(label)) return k;
  return classify(label).key;
}

/**
 * 이번 발표 행 고르기 — 같은 날짜(±1일) 행, 또는 아직 발표 전(actual 빈 값)이면서 ±3일 안 행(달력·history 날짜가 시간대로
 * 하루 이틀 어긋남)을 '이번 발표'로 쓴다. 없으면(아직 history에 안 올라옴) 컨센서스는 비우고
 * 가장 최근 발표의 실제치를 '직전'으로. 지난 발표의 실제치를 이번 발표 결과로 보여 주면 안 된다.
 */
export function pickRelease(hist: { date: string; actual?: string; forecast?: string; previous?: string }[], date: string): Omit<MacroRelease, 'date' | 'name' | 'ko'> {
  const s = (v?: string) => (v ?? '').trim();
  const gap = (d: string) => Math.abs(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  const same = hist.find((h) => h.date?.slice(0, 10) === date)
    ?? hist.find((h) => h.date && gap(h.date) <= 1)
    ?? hist.find((h) => h.date && !s(h.actual) && gap(h.date) <= 3);
  if (same) return { actual: s(same.actual), forecast: s(same.forecast), previous: s(same.previous) };
  const past = [...hist].filter((h) => h.date && s(h.actual) && h !== same && h.date.slice(0, 10) < date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return { actual: '', forecast: '', previous: past ? s(past.actual) : '' };
}
