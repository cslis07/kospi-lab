'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import CoinCandleChart, { ChartCandle } from '@/components/CoinCandleChart';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ── 타입 ────────────────────────────────────────────── */
interface TF {
  close: number; ema20: number; ema60: number; ema200: number | null;
  rsi: number; macd: { hist: number; histSlope: number };
  bb: { squeeze: boolean }; atr: number; atrPct: number; volumeRatio: number;
  structure: string; emaAlign: string; priceVsEma20: string;
}
interface Zone { price: number; touches: number; kind: 'support' | 'resistance' }
interface Fib { direction: 'up' | 'down'; swingLow: number; swingHigh: number; r382: number; r50: number; r618: number; nearest: string | null }
interface InvestorDay { date: string; individual: number; foreign: number; institution: number; foreignHoldRatio: number | null; close: number }
interface Supply {
  foreign5d: number; inst5d: number; indiv5d: number; foreign20d: number; inst20d: number;
  foreignStreak: number; instStreak: number; smartMoney5d: number;
  holdRatioNow: number | null; holdRatioChange5d: number | null; score: number;
}
interface Driver { text: string; tone: 'up' | 'down' | 'warn' | 'info' }
interface Data {
  ticker: string; name: string; market: string; updatedAt: number;
  price: number; change: number; changeRate: number;
  high52w: number | null; low52w: number | null;
  volume: string; tradingValue: string; marketCap: string; per: number | null; pbr: number | null;
  daily: TF; zones: Zone[]; fib: Fib | null; chart: ChartCandle[]; divergence: 'bullish' | 'bearish' | null;
  supply: Supply | null; investor: InvestorDay[];
  fin: { per: number | null; pbr: number | null; roe: number | null; debtRatio: number | null; revenueGrowth: number | null; grade: string | null; notes: string[] };
  kospi: { kospiChange: number | null; kospiTrend: string | null };
  movement: { direction: 'up' | 'down' | 'flat'; changeRate: number; pct5d: number; drivers: Driver[] };
  verdict: {
    stance: 'buy' | 'neutral' | 'reduce'; score: number; state: string; entryOk: boolean; entryNote: string;
    entry: number; stop: number; stopPct: number; target1: number; target2: number;
    reasons: string[]; warnings: string[]; checklist: { label: string; pass: boolean; note: string }[];
  };
  backtest: { spanDays: number; signals: number; wins: number; losses: number; open: number; winRate: number | null; avgR: number | null; trades: { ts: number; score: number; entry: number; stop: number; target: number; result: 'win' | 'loss'; days: number }[] };
  news: { title: string; source: string; datetime: string; link: string; sentiment: 'pos' | 'neg' | 'neu' }[];
  disclosures: { date: string; type: string; url: string; sentiment: 'pos' | 'neg' | 'neu'; importance: 'high' | 'mid' | 'low'; label: string }[];
  policy: { tone: 'pos' | 'neg'; label: string }[];
  aiBriefing: string | null; aiError: string | null;
  error?: string;
}
interface SearchHit { code: string; name: string; market: string }

const won = (n: number) => n.toLocaleString('ko-KR');
const wonQty = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e8 ? `${(n / 1e8).toFixed(1)}억주` : a >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만주` : `${n.toLocaleString()}주`;
  return n >= 0 ? `+${s}` : s;
};

/* ── 인기 종목 프리셋 ────────────────────────────────── */
const PRESETS = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '373220', name: 'LG엔솔' },
  { code: '005380', name: '현대차' },
  { code: '035720', name: '카카오' },
  { code: '035420', name: 'NAVER' },
];

function StanceBadge({ stance }: { stance: 'buy' | 'neutral' | 'reduce' }) {
  const c = {
    buy: { l: '매수 우위 ▲', cls: 'bg-red-500/15 text-red-400 border-red-500/40' },
    neutral: { l: '중립 ⏸', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
    reduce: { l: '비중축소 ▼', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/40' },
  }[stance];
  return <span className={`inline-flex items-center border rounded-xl font-bold px-4 py-1.5 text-lg ${c.cls}`}>{c.l}</span>;
}

export default function StockAnalysisPage() {
  const [ticker, setTicker] = useState('005930');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, isValidating, mutate } = useSWR<Data>(
    `/api/stock-analysis?ticker=${ticker}`, fetcher,
    { revalidateOnFocus: false, refreshInterval: autoRefresh ? 60000 : 0 },
  );
  const v = data?.verdict;

  // 종목명 자동완성
  const [query, setQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const { data: hits } = useSWR<{ code: string; name: string; market: string }[]>(
    query.trim().length >= 1 && !/^\d{6}$/.test(query.trim()) ? `/api/stock-search?q=${encodeURIComponent(query.trim())}` : null,
    fetcher,
  );
  // 우선주 뒤로, 보통주/대표주 우선 정렬
  const suggestions: SearchHit[] = useMemo(() => {
    const raw = Array.isArray(hits) ? hits : [];
    return [...raw]
      .map((h) => ({ code: h.code, name: h.name, market: h.market }))
      .sort((a, b) => (a.name.includes('우선주') ? 1 : 0) - (b.name.includes('우선주') ? 1 : 0))
      .slice(0, 8);
  }, [hits]);

  const pick = (code: string) => { setTicker(code); setQuery(''); setShowDrop(false); };
  const submit = () => {
    const t = query.trim();
    if (/^\d{6}$/.test(t)) { pick(t); return; }
    if (suggestions.length) pick(suggestions[0].code);
  };

  const posInRange = useMemo(() => {
    if (!data?.high52w || !data?.low52w || data.high52w <= data.low52w) return null;
    return ((data.price - data.low52w) / (data.high52w - data.low52w)) * 100;
  }, [data]);


  return (
    <div className="pb-12">
      {/* 검색 + 프리셋 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 relative">
          <div className="relative">
            <input value={query}
              onChange={(e) => { setQuery(e.target.value); setShowDrop(true); }}
              onFocus={() => setShowDrop(true)}
              onBlur={() => setTimeout(() => setShowDrop(false), 150)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="종목명 또는 코드 (예: 삼성전자, 005930)"
              className="w-56 px-3 py-1.5 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded-xl text-[var(--text)] outline-none focus:border-sky-500/50" />
            {showDrop && suggestions.length > 0 && (
              <div className="absolute z-30 top-full mt-1 left-0 w-64 max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
                {suggestions.map((s) => (
                  <button key={s.code} onMouseDown={() => pick(s.code)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 text-left">
                    <span className="text-[var(--text)]">{s.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{s.code} · {s.market}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={submit} className="px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 text-xs font-semibold">분석</button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {PRESETS.map((p) => (
            <button key={p.code} onClick={() => setTicker(p.code)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs transition-colors ${
                ticker === p.code ? 'bg-sky-500/20 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}>{p.name}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data && !data.error && <span className="text-[10px] text-[var(--text-muted)]">{new Date(data.updatedAt + 9 * 3600_000).toISOString().slice(11, 19)} 분석</span>}
          <button onClick={() => setAutoRefresh((x) => !x)}
            className={`px-3 py-1.5 rounded-xl border text-xs transition-colors ${autoRefresh ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'}`}>
            {autoRefresh ? '● 자동 1분' : '○ 자동갱신'}
          </button>
          <button onClick={() => mutate()} disabled={isValidating}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] text-xs text-[var(--text)] disabled:opacity-50">{isValidating ? '분석 중…' : '⟳ 재분석'}</button>
        </div>
      </div>

      {(isLoading || (isValidating && !data)) && (
        <div className="space-y-4"><div className="h-40 rounded-2xl bg-white/5 animate-pulse" /><div className="grid grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-52 rounded-2xl bg-white/5 animate-pulse" />)}</div></div>
      )}
      {data?.error && <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center text-sm text-red-400">분석 실패: {data.error}</div>}

      {data && !data.error && v && (
        <div className="space-y-4">
          {/* 헤더 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{data.name} · {data.ticker} · {data.market}</p>
                <p className="text-3xl font-bold tabular-nums text-[var(--text)] mt-0.5">{won(data.price)}원</p>
                <p className={`text-sm font-semibold mt-0.5 ${data.changeRate >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                  {data.changeRate >= 0 ? '▲ +' : '▼ '}{won(data.change)} ({data.changeRate >= 0 ? '+' : ''}{data.changeRate}%)
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2 text-xs pt-1">
                <div><p className="text-[var(--text-muted)]">PER</p><p className="font-bold tabular-nums text-[var(--text)]">{data.per ?? '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">PBR</p><p className="font-bold tabular-nums text-[var(--text)]">{data.pbr ?? '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">ROE</p><p className="font-bold tabular-nums text-[var(--text)]">{data.fin.roe !== null ? `${data.fin.roe}%` : '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">재무등급</p><p className={`font-bold ${data.fin.grade === 'A' ? 'text-emerald-400' : data.fin.grade === 'D' ? 'text-red-400' : 'text-[var(--text)]'}`}>{data.fin.grade ?? '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">외국인 보유율</p><p className={`font-bold tabular-nums ${data.supply?.holdRatioChange5d != null && data.supply.holdRatioChange5d < 0 ? 'text-blue-400' : 'text-[var(--text)]'}`}>{data.supply?.holdRatioNow != null ? `${data.supply.holdRatioNow.toFixed(2)}%` : '-'}</p></div>
                <div><p className="text-[var(--text-muted)]">52주 위치</p><p className="font-bold tabular-nums text-[var(--text)]">{posInRange !== null ? `하단서 ${posInRange.toFixed(0)}%` : '-'}</p></div>
              </div>
            </div>

            {/* 수급 심리 바: 외국인·기관·개인 5일 순매수 */}
            {data.supply && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-muted)] mb-1.5">최근 5일 누적 순매수</p>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {[
                    { l: '외국인', v: data.supply.foreign5d, streak: data.supply.foreignStreak },
                    { l: '기관', v: data.supply.inst5d, streak: data.supply.instStreak },
                    { l: '개인', v: data.supply.indiv5d, streak: null as number | null },
                  ].map((x) => (
                    <div key={x.l} className={`rounded-xl border p-2 ${x.v >= 0 ? 'border-red-500/20 bg-red-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
                      <p className="text-[10px] text-[var(--text-muted)]">{x.l}{x.streak !== null && Math.abs(x.streak) >= 2 ? ` · ${Math.abs(x.streak)}일연속${x.streak > 0 ? '매수' : '매도'}` : ''}</p>
                      <p className={`font-bold tabular-nums ${x.v >= 0 ? 'text-red-400' : 'text-blue-400'}`}>{wonQty(x.v)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 지금 왜 움직이나 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-[var(--text)]">{data.movement.direction === 'up' ? '📈 지금 왜 오르나' : data.movement.direction === 'down' ? '📉 지금 왜 내리나' : '📊 지금 흐름 읽기'}</h3>
              <div className="flex gap-1.5 ml-auto">
                {[{ k: '당일', val: data.movement.changeRate }, { k: '5일', val: data.movement.pct5d }].map((c) => (
                  <span key={c.k} className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tabular-nums border ${c.val >= 0 ? 'text-red-400 border-red-500/30 bg-red-500/5' : 'text-blue-400 border-blue-500/30 bg-blue-500/5'}`}>{c.k} {c.val >= 0 ? '+' : ''}{c.val.toFixed(2)}%</span>
                ))}
              </div>
            </div>
            <ul className="space-y-1.5">
              {data.movement.drivers.map((d, i) => (
                <li key={i} className={`text-[11px] flex gap-1.5 leading-relaxed ${d.tone === 'up' ? 'text-red-400/90' : d.tone === 'down' ? 'text-blue-400/90' : d.tone === 'warn' ? 'text-amber-400/90' : 'text-[var(--text-muted)]'}`}>
                  <span className="shrink-0">{d.tone === 'up' ? '▲' : d.tone === 'down' ? '▼' : d.tone === 'warn' ? '⚠' : '•'}</span>{d.text}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[var(--text-muted)] mt-2.5 opacity-60">수급·추세·뉴스 신호 기반 자동 추정 — 정확한 인과가 아닌 참고용 해석입니다.</p>
          </div>

          {/* 종합 판단 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <StanceBadge stance={v.stance} />
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-[var(--border)] text-xs font-semibold text-[var(--text)]">{v.state}</span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${v.entryOk ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-slate-500/10 text-[var(--text-muted)] border-[var(--border)]'}`}>{v.entryOk ? '✓ 매수 조건 충족' : '매수 대기'}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1"><span>비중축소 -100</span><span>0</span><span>매수 +100</span></div>
                  <div className="relative h-2.5 rounded-full bg-gradient-to-r from-blue-500/60 via-slate-500/40 to-red-500/60">
                    <div className="absolute w-1 rounded bg-white" style={{ left: `calc(${(v.score + 100) / 2}% - 2px)`, height: '18px', top: '-4px' }} />
                  </div>
                  <p className="text-center text-sm font-bold mt-1.5 tabular-nums text-[var(--text)]">종합 점수 {v.score > 0 ? '+' : ''}{v.score}</p>
                </div>
                <p className="text-xs text-[var(--text)] bg-white/3 border border-[var(--border)] rounded-xl p-3 leading-relaxed">{v.entryNote}</p>
              </div>
              {v.stance !== 'reduce' ? (
                <div className="grid grid-cols-2 gap-2.5 content-start">
                  {[
                    { label: '기준가', value: `${won(v.entry)}원`, cls: 'text-[var(--text)]' },
                    { label: `손절가 (${v.stopPct.toFixed(1)}%)`, value: `${won(Math.round(v.stop))}원`, cls: 'text-blue-400' },
                    { label: '1차 목표', value: `${won(Math.round(v.target1))}원`, cls: 'text-red-400' },
                    { label: '2차 목표', value: `${won(Math.round(v.target2))}원`, cls: 'text-red-400' },
                  ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-[var(--border)] p-3 bg-white/3">
                      <p className="text-[10px] text-[var(--text-muted)]">{c.label}</p>
                      <p className={`text-base font-bold tabular-nums mt-0.5 ${c.cls}`}>{c.value}</p>
                    </div>
                  ))}
                  <p className="col-span-2 text-[10px] text-[var(--text-muted)]">손절은 구조 지지선 + ATR 기준. 분할 매수 + 손절 라인 설정 권장.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--border)] p-5 flex items-center justify-center text-center">
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">하락 추세·수급 이탈 구간입니다.<br />신규 매수보다 보유 비중 관리가 우선입니다.</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
              <div>
                <p className="text-xs font-bold text-[var(--text)] mb-2">분석 근거</p>
                <ul className="space-y-1">{v.reasons.map((r, i) => <li key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5"><span className="text-sky-400 shrink-0">•</span>{r}</li>)}</ul>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400 mb-2">경고·유의</p>
                {v.warnings.length ? <ul className="space-y-1">{v.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-400/90 flex gap-1.5"><span className="shrink-0">⚠</span>{w}</li>)}</ul> : <p className="text-[11px] text-[var(--text-muted)]">현재 특이 경고 없음</p>}
              </div>
            </div>
          </div>

          {/* AI 브리핑 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h3 className="text-sm font-bold text-[var(--text)] mb-2">🤖 AI 종합 브리핑 <span className="text-[10px] font-normal text-[var(--text-muted)]">수급 + 뉴스</span></h3>
            {data.aiBriefing ? (
              <div className="space-y-2.5">
                {data.aiBriefing.split(/(?=【)/).filter((s) => s.trim()).map((sec, i) => {
                  const m = sec.match(/^【([^】]+)】([\s\S]*)$/);
                  if (!m) return <p key={i} className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{sec.trim()}</p>;
                  return <div key={i}><p className="text-[11px] font-bold text-sky-400 mb-0.5">{m[1]}</p><p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line">{m[2].trim()}</p></div>;
                })}
              </div>
            ) : <p className="text-xs text-[var(--text-muted)]">{data.aiError ?? 'AI 브리핑을 사용할 수 없습니다.'}</p>}
          </div>

          {/* 차트 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[var(--text)]">일봉 차트 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 60일 · EMA20/60 · 지지저항·피보나치·매매레벨</span></h3>
              <div className="hidden sm:flex items-center gap-2 text-[10px]"><span className="text-purple-400">— EMA20</span><span className="text-sky-400">— EMA60</span></div>
            </div>
            <CoinCandleChart candles={data.chart}
              supports={data.zones.filter((z) => z.kind === 'support').map((z) => z.price)}
              resistances={data.zones.filter((z) => z.kind === 'resistance').map((z) => z.price)}
              fib={data.fib} entry={v.entry} stop={v.stop} target1={v.target1} target2={v.target2}
              direction={v.stance === 'reduce' ? 'wait' : 'long'} digits={0} xAxis="date" />
          </div>

          {/* 투자자 수급 추이 + 백테스트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">투자자별 순매수 추이 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 10일 · 수량(주)</span></h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] tabular-nums">
                  <thead><tr className="text-[var(--text-muted)] border-b border-[var(--border)]"><th className="text-left px-1.5 py-1">날짜</th><th className="text-right px-1.5 py-1">외국인</th><th className="text-right px-1.5 py-1">기관</th><th className="text-right px-1.5 py-1">개인</th><th className="text-right px-1.5 py-1">보유율</th></tr></thead>
                  <tbody>
                    {data.investor.slice(0, 10).map((d, i) => (
                      <tr key={i} className={i % 2 ? 'bg-[var(--bg)]/30' : ''}>
                        <td className="px-1.5 py-1 text-[var(--text-muted)]">{d.date.slice(5)}</td>
                        <td className={`px-1.5 py-1 text-right ${d.foreign >= 0 ? 'text-red-400' : 'text-blue-400'}`}>{wonQty(d.foreign)}</td>
                        <td className={`px-1.5 py-1 text-right ${d.institution >= 0 ? 'text-red-400' : 'text-blue-400'}`}>{wonQty(d.institution)}</td>
                        <td className={`px-1.5 py-1 text-right ${d.individual >= 0 ? 'text-red-400' : 'text-blue-400'}`}>{wonQty(d.individual)}</td>
                        <td className="px-1.5 py-1 text-right text-[var(--text-muted)]">{d.foreignHoldRatio != null ? `${d.foreignHoldRatio.toFixed(2)}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-60">외국인·기관 동반 순매수 지속이 한국 시장에서 가장 신뢰도 높은 상승 신호</p>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-1">룰 엔진 성적표 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 {Math.round(data.backtest.spanDays)}일 자동 백테스트</span></h3>
              <p className="text-[10px] text-[var(--text-muted)] mb-3">과거 일봉에서 매수 신호 발생 시 1R 익절 vs 손절 판정 (수급·재무 제외 기술적 전용·수수료 미반영)</p>
              {data.backtest.signals === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-3 text-center">이 기간 매수 조건을 충족한 신호가 없습니다 — 엔진이 관망을 유지한 구간</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { k: '신호', val: String(data.backtest.signals), cls: 'text-[var(--text)]' },
                      { k: '승률', val: data.backtest.winRate !== null ? `${data.backtest.winRate.toFixed(0)}%` : '-', cls: data.backtest.winRate !== null && data.backtest.winRate >= 50 ? 'text-red-400' : 'text-blue-400' },
                      { k: '기대값', val: data.backtest.avgR !== null ? `${data.backtest.avgR >= 0 ? '+' : ''}${data.backtest.avgR.toFixed(2)}R` : '-', cls: data.backtest.avgR !== null && data.backtest.avgR >= 0 ? 'text-red-400' : 'text-blue-400' },
                      { k: '미결', val: String(data.backtest.open), cls: 'text-[var(--text-muted)]' },
                    ].map((c) => (
                      <div key={c.k} className="rounded-xl border border-[var(--border)] p-2 text-center"><p className="text-[10px] text-[var(--text-muted)]">{c.k}</p><p className={`text-sm font-bold tabular-nums ${c.cls}`}>{c.val}</p></div>
                    ))}
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full text-[10px] tabular-nums">
                      <thead><tr className="text-[var(--text-muted)] bg-[var(--bg)] sticky top-0"><th className="text-left px-2 py-1">시각</th><th className="text-right px-2 py-1">진입가</th><th className="text-right px-2 py-1">손절가</th><th className="text-right px-2 py-1">보유</th><th className="text-right px-2 py-1">결과</th></tr></thead>
                      <tbody>
                        {data.backtest.trades.map((tr, i) => (
                          <tr key={i} className={i % 2 ? 'bg-[var(--bg)]/30' : ''}>
                            <td className="px-2 py-1 text-[var(--text-muted)]">{new Date(tr.ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} (+{tr.score})</td>
                            <td className="px-2 py-1 text-right text-[var(--text)]">{won(Math.round(tr.entry))}</td>
                            <td className="px-2 py-1 text-right text-[var(--text-muted)]">{won(Math.round(tr.stop))}</td>
                            <td className="px-2 py-1 text-right text-[var(--text-muted)]">{tr.days}일</td>
                            <td className={`px-2 py-1 text-right font-bold ${tr.result === 'win' ? 'text-red-400' : 'text-blue-400'}`}>{tr.result === 'win' ? '+1R' : '-1R'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-60">{data.backtest.winRate !== null && data.backtest.winRate < 45 ? '⚠ 최근 이 종목에서 엔진 적중률이 낮습니다 — 보수적 해석' : '표본이 짧으므로 절대 성능이 아닌 "최근 적합도"로만 참고'}</p>
                </>
              )}
            </div>
          </div>

          {/* 체크리스트 + 뉴스 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">매수 전 체크리스트</h3>
              <div className="space-y-1.5">
                {v.checklist.map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2"><span className={c.pass ? 'text-emerald-400' : 'text-[var(--text-dim)]'}>{c.pass ? '✓' : '✗'}</span><span className="text-[var(--text)]">{c.label}</span></span>
                    <span className="text-[10px] text-[var(--text-muted)] text-right">{c.note}</span>
                  </div>
                ))}
              </div>
              {data.fin.notes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-[10px] text-[var(--text-muted)] mb-1">재무 코멘트</p>
                  {data.fin.notes.map((n, i) => <p key={i} className="text-[10px] text-[var(--text-muted)]">· {n}</p>)}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-bold text-[var(--text)] mb-3">최신 뉴스 <span className="text-[10px] font-normal text-[var(--text-muted)]">{data.name}</span></h3>
              {data.news.length ? (
                <div className="space-y-2.5">
                  {data.news.slice(0, 7).map((n, i) => (
                    <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="block group">
                      <p className="text-xs text-[var(--text)] group-hover:text-sky-400 transition-colors leading-snug">
                        {n.sentiment === 'pos' && <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 mr-1 align-middle">호재</span>}
                        {n.sentiment === 'neg' && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 mr-1 align-middle">악재</span>}
                        {n.title}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{n.source}{n.datetime ? ` · ${n.datetime}` : ''}</p>
                    </a>
                  ))}
                </div>
              ) : <p className="text-xs text-[var(--text-muted)]">뉴스를 가져올 수 없습니다.</p>}
            </div>
          </div>

          {/* 공시 + 정책 */}
          {(data.disclosures.length > 0 || data.policy.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <h3 className="text-sm font-bold text-[var(--text)] mb-3">DART 공시 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 30일 · 자동 분류</span></h3>
                {data.disclosures.length ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.disclosures.slice(0, 12).map((d, i) => (
                      <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="block group">
                        <div className="flex items-start gap-2">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                            d.sentiment === 'pos' ? 'bg-red-500/15 text-red-400' : d.sentiment === 'neg' ? 'bg-blue-500/15 text-blue-400' : 'bg-white/10 text-[var(--text-muted)]'
                          }`}>{d.sentiment === 'pos' ? '호재' : d.sentiment === 'neg' ? '악재' : '중립'}{d.importance === 'high' ? '·중요' : ''}</span>
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--text)] group-hover:text-sky-400 transition-colors leading-snug truncate">{d.type}</p>
                            {d.sentiment !== 'neu' && <p className="text-[10px] text-[var(--text-muted)] leading-snug">{d.label}</p>}
                            <p className="text-[10px] text-[var(--text-dim)]">{d.date}</p>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : <p className="text-xs text-[var(--text-muted)]">최근 30일 공시 없음</p>}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <h3 className="text-sm font-bold text-[var(--text)] mb-3">정책·테마 신호 <span className="text-[10px] font-normal text-[var(--text-muted)]">뉴스·공시 기반</span></h3>
                {data.policy.length ? (
                  <div className="space-y-2">
                    {data.policy.map((p, i) => (
                      <div key={i} className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${p.tone === 'pos' ? 'border-red-500/20 bg-red-500/5 text-red-400' : 'border-blue-500/20 bg-blue-500/5 text-blue-400'}`}>
                        <span className="shrink-0">{p.tone === 'pos' ? '▲' : '▼'}</span>{p.label}
                      </div>
                    ))}
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 opacity-60">뉴스·공시 제목에서 금리·정부지원·규제·밸류업 등 정책 키워드를 자동 감지</p>
                  </div>
                ) : <p className="text-xs text-[var(--text-muted)]">현재 감지된 정책·테마 재료 없음</p>}
              </div>
            </div>
          )}

          <p className="text-[10px] text-[var(--text-muted)] text-center opacity-60 leading-relaxed">
            본 분석은 공개 데이터 기반 자동 계산 참고 정보이며 투자 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.<br />
            데이터: 네이버 금융·KIS·Yahoo·DART 공시 · 수급은 장 마감 후 확정치 기준
          </p>
        </div>
      )}
    </div>
  );
}
