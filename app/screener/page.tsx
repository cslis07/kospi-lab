'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Types ──────────────────────────────────────────────────────────────────────
interface BDetails {
  roe:    boolean | null;
  margin: boolean | null;
  fcf:    boolean | null;
  debt:   boolean | null;
  growth: boolean | null;
  per:    boolean | null;
  profit: boolean | null;
}
interface ScreenerResult {
  ticker: string;
  name: string;
  currency: string;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  per: number | null;
  peg: number | null;
  fwdPE: number | null;
  roe: number | null;
  opMargin: number | null;
  fcf: number | null;
  debtRatio: number | null;
  revenueGrowth: number | null;
  netInc: number | null;
  buffettScore: number;
  buffettDetails: BDetails;
}

// ── Default curated lists ──────────────────────────────────────────────────────
const KR_DEFAULT = [
  { ticker: '005930.KS', name: '삼성전자' },
  { ticker: '000660.KS', name: 'SK하이닉스' },
  { ticker: '035420.KS', name: 'NAVER' },
  { ticker: '035720.KS', name: '카카오' },
  { ticker: '005380.KS', name: '현대차' },
  { ticker: '105560.KS', name: 'KB금융' },
  { ticker: '055550.KS', name: '신한지주' },
  { ticker: '051910.KS', name: 'LG화학' },
  { ticker: '068270.KS', name: '셀트리온' },
  { ticker: '028260.KS', name: '삼성물산' },
];
const US_DEFAULT = [
  { ticker: 'AAPL',  name: 'Apple' },
  { ticker: 'MSFT',  name: 'Microsoft' },
  { ticker: 'V',     name: 'Visa' },
  { ticker: 'GOOGL', name: 'Alphabet' },
  { ticker: 'AMZN',  name: 'Amazon' },
  { ticker: 'META',  name: 'Meta' },
  { ticker: 'NVDA',  name: 'NVIDIA' },
  { ticker: 'COST',  name: 'Costco' },
  { ticker: 'KO',    name: 'Coca-Cola' },
  { ticker: 'BRK-B', name: 'Berkshire' },
];

// ── Criteria labels ────────────────────────────────────────────────────────────
const CRITERIA_INFO: { key: keyof BDetails; short: string; full: string }[] = [
  { key: 'roe',    short: 'ROE',    full: 'ROE ≥ 10~15%  (자기자본이익률)' },
  { key: 'margin', short: '이익률',  full: '영업이익률 ≥ 15%' },
  { key: 'fcf',    short: 'FCF',    full: '잉여현금흐름 플러스' },
  { key: 'debt',   short: '부채',   full: '부채비율 < 100%' },
  { key: 'growth', short: '성장',   full: '매출 성장률 > 0% (YoY)' },
  { key: 'per',    short: 'PER',    full: 'PER 0~35 (적정 밸류에이션)' },
  { key: 'profit', short: '흑자',   full: '순이익 흑자' },
];

// ── Formatting helpers ─────────────────────────────────────────────────────────
function fmtMarketCap(v: number | null, cur: string): string {
  if (v == null) return '-';
  if (cur === 'KRW') {
    if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조`;
    if (v >= 1e8)  return `${Math.round(v / 1e8)}억`;
    return '-';
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return '-';
}
function fmtFCF(v: number | null, cur: string): string {
  if (v == null) return '-';
  const sign = v >= 0 ? '+' : '-';
  const abs  = Math.abs(v);
  if (cur === 'KRW') {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
    if (abs >= 1e8)  return `${sign}${Math.round(abs / 1e8)}억`;
    return `${sign}${Math.round(abs / 1e7)}천만`;
  }
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtPct(v: number | null): string {
  if (v == null) return '-';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}
function fmtPer(v: number | null): string {
  if (v == null) return '-';
  return `${v.toFixed(1)}x`;
}

// ── Score badge ────────────────────────────────────────────────────────────────
function scoreStyle(s: number): string {
  if (s >= 6) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
  if (s >= 4) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-red-500/20 text-red-400 border-red-500/40';
}
function barColor(s: number): string {
  if (s >= 6) return 'bg-emerald-500';
  if (s >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

// ── CritBadge ─────────────────────────────────────────────────────────────────
function CritBadge({ pass, label }: { pass: boolean | null; label: string }) {
  const cls =
    pass === true  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
    pass === false ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                     'bg-white/5 text-[var(--text-muted)] border-[var(--border)]';
  const icon = pass === true ? '✅' : pass === false ? '❌' : '❓';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── MetricCell ────────────────────────────────────────────────────────────────
function MetricCell({
  label, value, pass, small,
}: { label: string; value: string; pass?: boolean | null; small?: boolean }) {
  const vColor =
    pass === true  ? 'text-emerald-400' :
    pass === false ? 'text-red-400' :
    'text-[var(--text)]';
  return (
    <div className={`text-center ${small ? '' : 'p-2'}`}>
      <p className="text-[10px] text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${vColor}`}>{value}</p>
    </div>
  );
}

// ── Stock card ────────────────────────────────────────────────────────────────
function StockCard({ r, market }: { r: ScreenerResult; market: 'KR' | 'US' }) {
  const [expanded, setExpanded] = useState(false);
  const pctColor = (v: number | null) =>
    v == null ? '' : v >= 0 ? 'text-emerald-400' : 'text-red-400';
  const displayName = r.name.length > 20 ? r.name.slice(0, 20) + '…' : r.name;
  const roeMin = market === 'KR' ? 10 : 15;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/2 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Score badge */}
        <div className={`shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border text-lg font-black ${scoreStyle(r.buffettScore)}`}>
          {r.buffettScore}<span className="text-[10px] font-normal opacity-70">/7</span>
        </div>

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-[var(--text)]">{displayName}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-[var(--text-muted)]">
              {r.ticker.replace('.KS', '').replace('.KQ', '')}
            </span>
            {r.sector && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {r.sector}
              </span>
            )}
          </div>
          {/* Score bar */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor(r.buffettScore)}`}
                style={{ width: `${(r.buffettScore / 7) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {fmtMarketCap(r.marketCap, r.currency)}
            </span>
          </div>
          {/* Mini criteria dots */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {CRITERIA_INFO.map((c) => {
              const p = r.buffettDetails[c.key];
              return (
                <div
                  key={c.key}
                  title={c.full}
                  className={`w-4 h-4 rounded-sm text-[8px] flex items-center justify-center font-bold border ${
                    p === true  ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300' :
                    p === false ? 'bg-red-500/30 border-red-500/50 text-red-300' :
                                  'bg-white/5 border-white/10 text-white/30'
                  }`}
                >
                  {c.short[0]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick metrics */}
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold tabular-nums ${pctColor(r.roe)}`}>
            ROE {r.roe != null ? `${r.roe.toFixed(1)}%` : '-'}
          </p>
          <p className="text-xs text-[var(--text-muted)] tabular-nums">
            PER {fmtPer(r.per)}
          </p>
        </div>

        {/* Expand arrow */}
        <svg
          className={`w-4 h-4 text-[var(--text-muted)] shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-3">
          {/* Metrics grid */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <MetricCell label="PER" value={fmtPer(r.per)} pass={r.buffettDetails.per} />
            <MetricCell label={`ROE (≥${roeMin}%)`} value={r.roe != null ? `${r.roe.toFixed(1)}%` : '-'} pass={r.buffettDetails.roe} />
            <MetricCell label="영업이익률" value={r.opMargin != null ? `${r.opMargin.toFixed(1)}%` : '-'} pass={r.buffettDetails.margin} />
            <MetricCell label="FCF" value={fmtFCF(r.fcf, r.currency)} pass={r.buffettDetails.fcf} />
            <MetricCell label="부채비율" value={r.debtRatio != null ? `${r.debtRatio.toFixed(1)}%` : '-'} pass={r.buffettDetails.debt} />
            <MetricCell
              label="매출성장(YoY)"
              value={fmtPct(r.revenueGrowth)}
              pass={r.buffettDetails.growth}
            />
          </div>

          {/* Criteria badges */}
          <div className="flex flex-wrap gap-1.5">
            {CRITERIA_INFO.map((c) => (
              <CritBadge key={c.key} pass={r.buffettDetails[c.key]} label={c.full} />
            ))}
          </div>

          {/* Extra: PEG, forward PE */}
          <div className="flex gap-4 text-xs text-[var(--text-muted)]">
            {r.peg   != null && <span>PEG <span className="text-[var(--text)] font-medium">{r.peg.toFixed(2)}</span></span>}
            {r.fwdPE != null && <span>Forward PER <span className="text-[var(--text)] font-medium">{r.fwdPE.toFixed(1)}x</span></span>}
            {r.industry && <span className="truncate">{r.industry}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-2 bg-white/10 rounded w-full" />
          <div className="flex gap-1">
            {[...Array(7)].map((_, i) => <div key={i} className="w-4 h-4 bg-white/10 rounded-sm" />)}
          </div>
        </div>
        <div className="w-16 space-y-1 shrink-0">
          <div className="h-4 bg-white/10 rounded" />
          <div className="h-3 bg-white/10 rounded" />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Market = 'KR' | 'US';
type SortKey = 'buffettScore' | 'roe' | 'opMargin' | 'per' | 'revenueGrowth';

export default function ScreenerPage() {
  const [market, setMarket] = useState<Market>('KR');
  const [customInput, setCustomInput]   = useState('');
  const [customTickers, setCustomTickers] = useState<string[]>([]);
  const [query, setQuery] = useState<{ tickers: string[]; market: Market } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('buffettScore');
  const [showGuide, setShowGuide] = useState(false);
  const [minScore, setMinScore]   = useState(0);

  const defaultList = market === 'KR' ? KR_DEFAULT : US_DEFAULT;

  // Normalize ticker: add .KS suffix for Korean market if user forgot
  const normalizeTicker = (t: string): string => {
    const u = t.toUpperCase().trim();
    if (market === 'KR' && /^\d{6}$/.test(u)) return `${u}.KS`;
    return u;
  };

  const addCustom = () => {
    const t = normalizeTicker(customInput);
    if (!t) return;
    if (customTickers.includes(t) || defaultList.some((d) => d.ticker === t)) return;
    setCustomTickers((prev) => [...prev, t]);
    setCustomInput('');
  };

  const removeCustom = (t: string) => setCustomTickers((prev) => prev.filter((x) => x !== t));

  const activeTickers = [
    ...defaultList.map((d) => d.ticker),
    ...customTickers,
  ];

  // Build SWR key only when user clicks "분석하기"
  const apiUrl = query
    ? `/api/screener?tickers=${query.tickers.join(',')}&market=${query.market}`
    : null;

  const { data: rawData, isLoading, error: swrError } = useSWR<
    ScreenerResult[] | { error: string }
  >(apiUrl, fetcher, { revalidateOnFocus: false });

  // API가 { error: string }을 반환하는 경우 처리
  const apiErrorMsg = (rawData as { error?: string })?.error ?? null;
  const data = Array.isArray(rawData) ? rawData : null;
  const error = swrError || apiErrorMsg;

  // Sort + filter
  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data]
      .filter((r) => r.buffettScore >= minScore)
      .sort((a, b) => {
        if (sortKey === 'buffettScore') return b.buffettScore - a.buffettScore;
        if (sortKey === 'per') {
          // Lower is better for PER; nulls last
          if (a.per == null && b.per == null) return 0;
          if (a.per == null) return 1;
          if (b.per == null) return -1;
          return a.per - b.per;
        }
        const av = a[sortKey] ?? -Infinity;
        const bv = b[sortKey] ?? -Infinity;
        return (bv as number) - (av as number);
      });
  }, [data, sortKey, minScore]);

  const handleAnalyze = () => {
    setQuery({ tickers: activeTickers, market });
  };

  const handleMarketSwitch = (m: Market) => {
    setMarket(m);
    setQuery(null);
    setCustomTickers([]);
    setCustomInput('');
  };

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'buffettScore',  label: '버핏점수' },
    { key: 'roe',           label: 'ROE' },
    { key: 'opMargin',      label: '영업이익률' },
    { key: 'per',           label: 'PER (낮은순)' },
    { key: 'revenueGrowth', label: '매출성장' },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* ── Title ── */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-[var(--text)]">버핏 스크리너</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Warren Buffett 스타일 7가지 기준으로 성장주를 분석합니다
        </p>
      </div>

      {/* ── Buffett guide accordion ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] mb-4 overflow-hidden">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-[var(--text)] hover:bg-white/2 transition-colors"
        >
          <span>📖 버핏 분석 기준 7가지 보기</span>
          <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${showGuide ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showGuide && (
          <div className="border-t border-[var(--border)] p-4 grid sm:grid-cols-2 gap-2">
            {[
              { icon: '📊', crit: 'ROE ≥ 10~15%', desc: '자기자본으로 얼마나 효율적으로 버는가. 여러 해 유지되면 해자 신호.' },
              { icon: '💰', crit: '영업이익률 ≥ 15%', desc: '원가 경쟁력과 가격 결정권을 의미. 높을수록 해자 강함.' },
              { icon: '💵', crit: 'FCF(잉여현금흐름) 플러스', desc: '배당·자사주매입·인수 가능. 버핏이 가장 중요하게 보는 지표.' },
              { icon: '🏦', crit: '부채비율 < 100%', desc: '부채/자본 비율. 빚이 적어야 불황·금리 상승에 강함.' },
              { icon: '📈', crit: '매출 성장 (YoY > 0)', desc: '전년 대비 매출이 늘고 있는지. 꾸준한 성장이 핵심.' },
              { icon: '💲', crit: 'PER 0~35 (적정 밸류)', desc: '현재 이익 대비 주가. 너무 비싸지 않은지 확인.' },
              { icon: '✅', crit: '순이익 흑자', desc: '적자 성장보다 흑자 성장. 버핏의 기본 조건.' },
            ].map((item) => (
              <div key={item.crit} className="flex gap-2 p-2 rounded-lg bg-white/3">
                <span className="text-base shrink-0">{item.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">{item.crit}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Settings card ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6 space-y-4">
        {/* Market tabs */}
        <div className="flex gap-2">
          {(['KR', 'US'] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => handleMarketSwitch(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                market === m
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}
            >
              {m === 'KR' ? '🇰🇷 국내 (KOSPI/KOSDAQ)' : '🇺🇸 해외 (미국)'}
            </button>
          ))}
        </div>

        {/* Default ticker chips */}
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">기본 분석 종목</p>
          <div className="flex flex-wrap gap-1.5">
            {defaultList.map((d) => (
              <span key={d.ticker} className="text-xs px-2 py-0.5 rounded-lg bg-white/8 text-[var(--text-muted)] border border-[var(--border)]">
                {d.name}
              </span>
            ))}
          </div>
        </div>

        {/* Custom ticker input */}
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            종목 직접 추가{' '}
            <span className="opacity-60">
              ({market === 'KR' ? '예: 005930 또는 005930.KS' : '예: TSLA, NVDA'})
            </span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && addCustom()}
              placeholder={market === 'KR' ? '종목코드 (6자리)' : '티커 (예: TSLA)'}
              className="flex-1 bg-white/5 border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50"
            />
            <button
              onClick={addCustom}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-[var(--text)] rounded-xl text-sm transition-colors border border-[var(--border)]"
            >
              추가
            </button>
          </div>
          {customTickers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {customTickers.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  {t.replace('.KS', '').replace('.KQ', '')}
                  <button onClick={() => removeCustom(t)} className="hover:text-white transition-colors">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full py-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              분석 중... (Yahoo Finance 조회, 최대 15초)
            </>
          ) : (
            <>🔍 {activeTickers.length}개 종목 버핏 분석하기</>
          )}
        </button>
      </div>

      {/* ── Results ── */}
      {error && !isLoading && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 mb-4">
          <p className="text-red-400 font-semibold text-sm mb-1">⚠️ 데이터를 가져올 수 없습니다</p>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {typeof error === 'string'
              ? error
              : 'Yahoo Finance API에 일시적인 문제가 있습니다.'}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            💡 <strong className="text-[var(--text)]">해결 방법:</strong>{' '}
            잠시 후(30초~1분) 다시 분석하기를 눌러보세요. Yahoo Finance 서버 측 인증이 필요한 경우 자동으로 재시도됩니다.
          </p>
          <button
            onClick={() => { setQuery(null); setTimeout(() => handleAnalyze(), 100); }}
            className="mt-3 px-4 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
          >
            🔄 재시도
          </button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Sort + filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-[var(--text-muted)]">{sorted.length}개 표시</span>
            <div className="flex gap-1 ml-auto flex-wrap">
              {/* Min score filter */}
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mr-2">
                <span>최소 점수</span>
                <select
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  className="bg-white/5 border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] outline-none"
                >
                  {[0, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}점 이상</option>
                  ))}
                </select>
              </div>
              {/* Sort */}
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortKey(s.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                    sortKey === s.key
                      ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                      : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] text-sm py-12">
              조건에 맞는 종목이 없습니다 (최소 점수를 낮춰보세요)
            </p>
          ) : (
            <div className="space-y-3">
              {sorted.map((r) => (
                <StockCard key={r.ticker} r={r} market={market} />
              ))}
            </div>
          )}

          {/* Data note */}
          <p className="text-center text-xs text-[var(--text-muted)] mt-6 opacity-50">
            * Yahoo Finance 재무 데이터 기준 (1시간 캐시) · 투자 참고용
          </p>
        </>
      )}

      {/* ── No query yet ── */}
      {!query && !isLoading && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">위에서 시장을 선택하고 <strong className="text-[var(--text)]">분석하기</strong> 버튼을 누르세요</p>
          <p className="text-xs mt-1 opacity-60">Yahoo Finance에서 재무 데이터를 실시간으로 가져옵니다</p>
        </div>
      )}
    </div>
  );
}
