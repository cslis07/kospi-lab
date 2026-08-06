/**
 * 시장 환경(거시) 지표 — 성장주 스크리너의 "지금 시장이 성장주에 우호적인가" 컨텍스트.
 *
 * 지표 선정 근거(2026-08 조사): 투자자들이 공통으로 보는 거시 축은
 * 유가(비용·인플레) · 금리(할인율) · 인플레이션(CPI) · 달러 강도(자금 흐름) · VIX(변동성).
 * "사회적 변동성"은 감이 아니라 VIX 로 실측한다.
 *
 * 소스: FRED(기존 키) — VIXCLS·DGS10·DCOILWTICO·DTWEXBGS / ECOS(기존 키) — 기준금리 722Y001
 * 전부 6시간 캐시. 실패한 지표는 null (있는 것만 표시).
 */

export type EnvTone = 'good' | 'neutral' | 'warn';

export interface EnvIndicator {
  key: string;
  label: string;
  value: number;               // 최신값
  unit: string;
  asOf: string;                // 기준일 YYYY-MM-DD
  monthAgo: number | null;     // 약 1개월 전 값
  changePct: number | null;    // 1개월 변화율 % (금리는 %p)
  tone: EnvTone;
  comment: string;             // 왜 중요한가 + 지금 어떤 상태인가
}

export interface MarketEnvironment {
  indicators: EnvIndicator[];
  /** 종합 판단: 성장주 투자 환경 */
  overall: { tone: EnvTone; label: string; comment: string };
  updatedAt: number;
}

const CACHE_TTL = 6 * 60 * 60 * 1000;
let _cache: { d: MarketEnvironment; ts: number } | null = null;

async function fredSeries(id: string): Promise<{ latest: { date: string; v: number }; monthAgo: number | null } | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=40`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const j = await res.json();
    const obs = ((j?.observations ?? []) as { date: string; value: string }[]).filter((o) => o.value !== '.');
    if (!obs.length) return null;
    // 일 단위 시리즈 → 약 20영업일 전 = 1개월 전
    return {
      latest: { date: obs[0].date, v: Number(obs[0].value) },
      monthAgo: obs[20] ? Number(obs[20].value) : null,
    };
  } catch { return null; }
}

async function ecosBaseRate(): Promise<{ date: string; v: number } | null> {
  const key = process.env.ECOS_API_KEY || 'sample';
  try {
    const now = new Date();
    const ym = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const start = new Date(now); start.setMonth(start.getMonth() - 3);
    const res = await fetch(
      `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/100/722Y001/D/${ym(start)}/${ym(now)}/0101000`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) },
    );
    const j = await res.json();
    const rows = (j?.StatisticSearch?.row ?? []) as { TIME: string; DATA_VALUE: string }[];
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    const t = String(last.TIME);
    return { date: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`, v: Number(last.DATA_VALUE) };
  } catch { return null; }
}

const pct = (cur: number, prev: number | null): number | null =>
  prev != null && prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null;

export async function fetchMarketEnvironment(): Promise<MarketEnvironment> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.d;

  const [vix, us10y, wti, dxy, baseRate] = await Promise.all([
    fredSeries('VIXCLS'), fredSeries('DGS10'), fredSeries('DCOILWTICO'), fredSeries('DTWEXBGS'), ecosBaseRate(),
  ]);

  const indicators: EnvIndicator[] = [];

  if (vix) {
    const v = vix.latest.v;
    const tone: EnvTone = v >= 25 ? 'warn' : v >= 20 ? 'neutral' : 'good';
    indicators.push({
      key: 'vix', label: 'VIX 변동성지수', value: v, unit: '', asOf: vix.latest.date,
      monthAgo: vix.monthAgo, changePct: pct(v, vix.monthAgo), tone,
      comment:
        '시장 공포(사회적 변동성)의 실측치. 급등하면 위험자산 중 성장주가 가장 먼저 팔린다. ' +
        (v >= 25 ? `${v} — 불안 구간, 신규 진입은 분할·소액으로.` : v >= 20 ? `${v} — 다소 경계 구간.` : `${v} — 안정 구간, 위험선호 우호.`),
    });
  }
  if (us10y) {
    const v = us10y.latest.v;
    const dPt = us10y.monthAgo != null ? Math.round((v - us10y.monthAgo) * 100) / 100 : null;
    const tone: EnvTone = dPt != null && dPt >= 0.25 ? 'warn' : dPt != null && dPt <= -0.15 ? 'good' : 'neutral';
    indicators.push({
      key: 'us10y', label: '미국채 10년 금리', value: v, unit: '%', asOf: us10y.latest.date,
      monthAgo: us10y.monthAgo, changePct: dPt, tone,
      comment:
        '성장주 밸류에이션의 분모(할인율). 금리가 빠르게 오르면 이익이 먼 미래에 있는 고PER 성장주부터 눌린다. ' +
        (dPt != null && dPt >= 0.25 ? `1개월 +${dPt}%p 급등 — 고PER 종목 비중 주의.` : dPt != null && dPt <= -0.15 ? `1개월 ${dPt}%p 하락 — 성장주 우호.` : '큰 방향성 없음.'),
    });
  }
  if (wti) {
    const v = wti.latest.v;
    const chg = pct(v, wti.monthAgo);
    const tone: EnvTone = chg != null && Math.abs(chg) >= 15 ? 'warn' : 'neutral';
    indicators.push({
      key: 'wti', label: 'WTI 유가', value: v, unit: '$', asOf: wti.latest.date,
      monthAgo: wti.monthAgo, changePct: chg, tone,
      comment:
        '비용·인플레이션의 선행 신호. 급등 시 항공·화학·운송 역풍, 정유·조선·에너지 우호. 인플레 재점화 → 금리 인하 지연으로도 이어진다. ' +
        (chg != null && chg >= 15 ? `1개월 +${chg}% 급등 — 비용 압박 업종 주의, 인플레 재점화 리스크.` : chg != null && chg <= -15 ? `1개월 ${chg}% 급락 — 비용 완화 우호(단, 수요 둔화 신호일 수도).` : '안정 범위.'),
    });
  }
  if (dxy) {
    const v = dxy.latest.v;
    const chg = pct(v, dxy.monthAgo);
    const tone: EnvTone = chg != null && chg >= 2 ? 'warn' : chg != null && chg <= -2 ? 'good' : 'neutral';
    indicators.push({
      key: 'dxy', label: '달러인덱스(광의)', value: v, unit: '', asOf: dxy.latest.date,
      monthAgo: dxy.monthAgo, changePct: chg, tone,
      comment:
        '달러 강세 = 신흥국(한국 포함) 외국인 자금 이탈 압력, 달러 약세 = 위험자산·신흥국 우호. 원화 약세는 수출주엔 실적 우호, 외국인 수급엔 역풍. ' +
        (chg != null && chg >= 2 ? `1개월 +${chg}% 강세 — 외국인 수급 역풍 주의.` : chg != null && chg <= -2 ? `1개월 ${chg}% 약세 — 신흥국 자금 유입 우호.` : '중립.'),
    });
  }
  if (baseRate) {
    indicators.push({
      key: 'krBase', label: '한국 기준금리', value: baseRate.v, unit: '%', asOf: baseRate.date,
      monthAgo: null, changePct: null, tone: 'neutral',
      comment: `유동성의 바닥값. 인하 사이클이면 성장주 밸류에이션에 순풍, 인상 사이클이면 역풍. 현재 ${baseRate.v}%.`,
    });
  }

  const warns = indicators.filter((i) => i.tone === 'warn').length;
  const goods = indicators.filter((i) => i.tone === 'good').length;
  const overall =
    warns >= 2
      ? { tone: 'warn' as EnvTone, label: '경계', comment: `경계 신호 ${warns}건 — 성장주 신규 진입은 분할·소액으로, 고PER 종목 비중 주의.` }
      : warns === 1
        ? { tone: 'neutral' as EnvTone, label: '중립', comment: '경계 신호 1건 — 종목 선별 기준을 평소보다 높게.' }
        : goods >= 2
          ? { tone: 'good' as EnvTone, label: '우호', comment: '변동성·금리·자금 흐름 모두 안정 — 성장주에 우호적인 환경.' }
          : { tone: 'neutral' as EnvTone, label: '중립', comment: '뚜렷한 방향 없음 — 개별 종목 펀더멘털이 승부처.' };

  const d: MarketEnvironment = { indicators, overall, updatedAt: Date.now() };
  if (indicators.length) _cache = { d, ts: Date.now() };
  return d;
}
