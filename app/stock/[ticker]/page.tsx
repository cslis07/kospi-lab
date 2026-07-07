'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { searchKrStocks } from '@/lib/krStocks';
import {
  ComposedChart, AreaChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAlerts } from '@/hooks/useAlerts';
import { calcMA, calcRSI, calcBB } from '@/lib/indicators';
import type { StockData, ChartPoint } from '@/lib/types';
import type { DartCompany, DartFinancials, DartDividend } from '@/lib/dartClient';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(n: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(n)); }
function fmtVol(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}만`;
  return String(n);
}

const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];

/* ── 수급 동향 컴포넌트 ──────────────────────────────── */
function InvestorSection({ ticker }: { ticker: string }) {
  const { data, error } = useSWR(`/api/stock/${ticker}/investor`, fetcher, { refreshInterval: 60000 });
  if (error || (data && 'error' in data)) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = Array.isArray(data) ? data : [];
  if (!rows.length) return null;

  const today = rows[0];
  const items = [
    { label: '개인', value: today.individual, color: 'text-sky-400' },
    { label: '외국인', value: today.foreign, color: 'text-emerald-400' },
    { label: '기관', value: today.institution, color: 'text-amber-400' },
  ];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-3">투자자별 수급 동향 (당일)</h2>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value, color }) => {
          const pos = value >= 0;
          return (
            <div key={label} className="text-center p-3 rounded-xl bg-white/5">
              <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
              <p className={`font-bold text-sm tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                {pos ? '+' : ''}{fmtVol(Math.abs(value))}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── KRX 상장정보 컴포넌트 ───────────────────────────── */
interface KrxInfo {
  name: string; engName: string; market: string; secGroup: string;
  sector: string; stockKind: string; parValue: string; listShares: number; listDate: string;
}
function KrxListingSection({ code }: { code: string }) {
  const { data } = useSWR<{ configured: boolean; found?: boolean; info?: KrxInfo }>(
    code ? `/api/krx/stock-info?code=${code}` : null, fetcher, { revalidateOnFocus: false }
  );
  if (!data?.found || !data.info) return null;
  const i = data.info;
  const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : s || '-');
  const rows: [string, string][] = [
    ['시장', `${i.market}${i.sector ? ` · ${i.sector}` : ''}`],
    ['상장주식수', i.listShares ? `${i.listShares.toLocaleString()}주` : '-'],
    ['액면가', i.parValue && i.parValue !== '0' ? `${Number(i.parValue).toLocaleString()}원` : '무액면'],
    ['상장일', fmtDate(i.listDate)],
    ['영문명', i.engName || '-'],
  ];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-3">상장 정보 (KRX)</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-xs">
            <span className="text-[var(--text-muted)] w-16 shrink-0">{k}</span>
            <span className="text-[var(--text)] break-words">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── DART 기업 정보 컴포넌트 ─────────────────────────── */
function DartCompanySection({ code }: { code: string }) {
  const { data, error } = useSWR<DartCompany>(
    code ? `/api/dart/company?code=${code}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (error || !data || 'error' in data) return null;

  const formatDate = (s: string) =>
    s && s.length === 8
      ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`
      : s ?? '-';

  const rows: { label: string; value: string }[] = [
    { label: '대표이사',   value: data.ceoNm    || '-' },
    { label: '주소',       value: data.adres     || '-' },
    { label: '홈페이지',   value: data.hm_url    || '-' },
    { label: '설립일',     value: formatDate(data.estDt) },
    { label: '결산월',     value: data.accMt ? `${data.accMt}월` : '-' },
    { label: '법인구분',   value: data.corpCls === 'Y' ? '유가증권' : data.corpCls === 'K' ? '코스닥' : data.corpCls || '-' },
  ];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-3">기업 개요 (DART)</h2>
      <div className="space-y-2">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-xs">
            <span className="text-[var(--text-muted)] w-16 shrink-0">{label}</span>
            {label === '홈페이지' && value !== '-' ? (
              <a href={value.startsWith('http') ? value : `https://${value}`}
                 target="_blank" rel="noopener noreferrer"
                 className="text-sky-400 hover:underline truncate">{value}</a>
            ) : (
              <span className="text-[var(--text)] break-words">{value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── DART 재무 정보 컴포넌트 ─────────────────────────── */
function DartFinancialSection({ code }: { code: string }) {
  const currentYear = new Date().getFullYear();
  const year1 = currentYear - 1;
  const year2 = currentYear - 2;

  const { data: fin1 } = useSWR<DartFinancials>(
    code ? `/api/dart/financials?code=${code}&year=${year1}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: fin2 } = useSWR<DartFinancials>(
    code ? `/api/dart/financials?code=${code}&year=${year2}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const hasData = (fin1 && !('error' in fin1)) || (fin2 && !('error' in fin2));
  if (!hasData) return null;

  const fmt100m = (n: number | null | undefined) => {
    if (n == null) return '-';
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}조`;
    if (abs >= 1e8)  return `${(n / 1e8).toFixed(0)}억`;
    if (abs >= 1e4)  return `${(n / 1e4).toFixed(0)}만`;
    return String(n);
  };
  const fmtPct = (n: number | null | undefined) =>
    n != null ? `${n.toFixed(1)}%` : '-';

  const rows = [
    { label: '매출액',     v1: fmt100m(fin1?.revenue),         v2: fmt100m(fin2?.revenue) },
    { label: '영업이익',   v1: fmt100m(fin1?.operatingIncome), v2: fmt100m(fin2?.operatingIncome) },
    { label: '당기순이익', v1: fmt100m(fin1?.netIncome),       v2: fmt100m(fin2?.netIncome) },
    { label: '부채비율',   v1: fmtPct(fin1?.debtRatio),        v2: fmtPct(fin2?.debtRatio) },
    { label: 'ROE',        v1: fmtPct(fin1?.roe),              v2: fmtPct(fin2?.roe) },
    { label: '영업이익률', v1: fmtPct(fin1?.opMargin),         v2: fmtPct(fin2?.opMargin) },
  ];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-3">재무 요약 (DART)</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--text-muted)]">
            <th className="text-left py-1 font-medium w-24">구분</th>
            <th className="text-right py-1 font-medium">{year1}년</th>
            <th className="text-right py-1 font-medium">{year2}년</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, v1, v2 }) => (
            <tr key={label} className="border-t border-[var(--border)]">
              <td className="py-1.5 text-[var(--text-muted)]">{label}</td>
              <td className="py-1.5 text-right text-[var(--text)] tabular-nums">{v1}</td>
              <td className="py-1.5 text-right text-[var(--text)] tabular-nums opacity-70">{v2}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-60">
        출처: DART 전자공시 (금융감독원) · {fin1?.fsDiv === 'CFS' ? '연결재무제표' : '개별재무제표'}
      </p>
    </div>
  );
}

/* ── DART 배당 정보 컴포넌트 ─────────────────────────── */
function DartDividendSection({ code }: { code: string }) {
  const year = new Date().getFullYear() - 1;
  const { data, error } = useSWR<DartDividend>(
    code ? `/api/dart/dividends?code=${code}&year=${year}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (error || !data || 'error' in data) return null;
  if (data.dps == null && data.yieldPct == null && data.payoutRatio == null) return null;

  const items = [
    { label: '주당 배당금 (DPS)', value: data.dps != null ? `₩${new Intl.NumberFormat('ko-KR').format(data.dps)}` : '-' },
    { label: '배당수익률',        value: data.yieldPct   != null ? `${data.yieldPct.toFixed(2)}%`   : '-' },
    { label: '배당성향',          value: data.payoutRatio != null ? `${data.payoutRatio.toFixed(1)}%` : '-' },
  ];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-3">배당 정보 (DART · {year}년)</h2>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value }) => (
          <div key={label} className="text-center p-3 rounded-xl bg-white/5">
            <p className="text-[10px] text-[var(--text-muted)] mb-1 leading-snug">{label}</p>
            <p className="font-bold text-sm text-[var(--text)] tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── AI 분석 컴포넌트 ────────────────────────────────── */
function AiAnalysis({ stock }: { stock: StockData }) {
  const [result, setResult]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: stock.name, ticker: stock.ticker,
          price: stock.price, change: stock.change,
          changeRate: stock.changeRate,
          high52w: stock.high52w, low52w: stock.low52w,
          marketCap: stock.marketCap, volume: stock.volume,
        }),
      });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else setResult(data.analysis);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">🤖 AI 종목 분석</h2>
        <button onClick={analyze} disabled={loading}
          className="px-3 py-1.5 text-xs rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-50 font-medium">
          {loading ? '분석 중...' : '분석 시작'}
        </button>
      </div>
      {err && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          {err.includes('ANTHROPIC_API_KEY')
            ? 'ANTHROPIC_API_KEY 환경변수를 Vercel에 추가하면 AI 분석을 사용할 수 있습니다.'
            : err}
        </div>
      )}
      {result && (
        <div className="text-sm text-[var(--text)] leading-relaxed whitespace-pre-wrap bg-white/5 rounded-xl p-4">
          {result}
        </div>
      )}
      {!result && !err && !loading && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">버튼을 눌러 Claude AI로 종목을 분석하세요</p>
      )}
    </div>
  );
}

/* ── 메인 페이지 ─────────────────────────────────────── */
export default function StockDetailPage() {
  const params = useParams();
  const ticker = params.ticker as string;

  const [tfIdx, setTfIdx]           = useState(0);
  const [showMA5, setShowMA5]       = useState(true);
  const [showMA20, setShowMA20]     = useState(true);
  const [showMA60, setShowMA60]     = useState(false);
  const [showBB, setShowBB]         = useState(false);
  const [showRSI, setShowRSI]       = useState(false);
  const [showVol, setShowVol]       = useState(true);
  const [compareTicker, setCompare] = useState('');
  const [compareName, setCompareName] = useState('');
  const [compareInput, setCompareInput] = useState('');
  const [compareHits, setCompareHits] = useState<{ ticker: string; name: string }[]>([]);
  const [showCompareDrop, setShowCompareDrop] = useState(false);
  const compareDropRef  = useRef<HTMLDivElement>(null);
  const compareDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (compareDropRef.current && !compareDropRef.current.contains(e.target as Node)) {
        setShowCompareDrop(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // 비교 종목 검색 (이름/코드) — 로컬 즉시 + API debounce
  const handleCompareInput = (val: string) => {
    setCompareInput(val);
    const t = val.trim();
    if (!t || /^\d{6}$/.test(t)) {
      setCompareHits([]); setShowCompareDrop(false);
      if (compareDebounce.current) clearTimeout(compareDebounce.current);
      return;
    }
    const local = searchKrStocks(t).map((s) => ({ ticker: s.ticker, name: s.name }));
    setCompareHits(local);
    setShowCompareDrop(local.length > 0);
    if (compareDebounce.current) clearTimeout(compareDebounce.current);
    compareDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock-search?q=${encodeURIComponent(t)}`);
        if (!res.ok) return;
        const apiHits = await res.json();
        if (!Array.isArray(apiHits) || !apiHits.length) return;
        setCompareHits((prev) => {
          const seen = new Set(prev.map((h) => h.ticker));
          return [...prev, ...apiHits.filter((h: { ticker: string }) => !seen.has(h.ticker))].slice(0, 8);
        });
        setShowCompareDrop(true);
      } catch { /* 무시 */ }
    }, 350);
  };

  const pickCompare = (hit: { ticker: string; name: string }) => {
    const code = hit.ticker.replace(/\.(KS|KQ)$/, '');
    setCompare(code); setCompareName(hit.name); setCompareInput(hit.name);
    setShowCompareDrop(false); setCompareHits([]);
  };

  const submitCompare = () => {
    if (compareHits.length) { pickCompare(compareHits[0]); return; }
    const t = compareInput.trim().replace(/\.(KS|KQ)$/, '');
    if (/^\d{6}$/.test(t)) { setCompare(t); setCompareName(t); setShowCompareDrop(false); }
  };

  const clearCompare = () => {
    setCompare(''); setCompareName(''); setCompareInput(''); setCompareHits([]); setShowCompareDrop(false);
  };

  const tf = TIMEFRAMES[tfIdx];

  const { data: stock, isLoading, error: stockError } = useSWR<StockData>(
    ticker ? `/api/stock/${ticker}` : null, fetcher, { refreshInterval: 5000 }
  );
  const { data: chart } = useSWR<ChartPoint[]>(
    ticker ? `/api/stock/${ticker}/chart?months=${tf.months}&market=${stock?.market ?? ''}` : null,
    fetcher, { refreshInterval: 60000 }
  );
  const { data: compareChart } = useSWR<ChartPoint[]>(
    compareTicker ? `/api/stock/${compareTicker}/chart?months=${tf.months}` : null,
    fetcher, { refreshInterval: 60000 }
  );

  const { portfolio, setEntry, removeEntry } = usePortfolio();
  const { alerts, setAlert, removeAlert }     = useAlerts();
  const myPortfolio = portfolio[ticker];
  const myAlert     = alerts[ticker];

  const [qty, setQty]           = useState('');
  const [avg, setAvg]           = useState('');
  const [alertAbove, setAlertAbove] = useState('');
  const [alertBelow, setAlertBelow] = useState('');
  const [initDone, setInitDone] = useState(false);

  if (!initDone && myPortfolio) {
    setQty(String(myPortfolio.quantity)); setAvg(String(myPortfolio.avgPrice));
    setInitDone(true);
  }
  if (!initDone && myAlert) {
    setAlertAbove(String(myAlert.above ?? '')); setAlertBelow(String(myAlert.below ?? ''));
    setInitDone(true);
  }

  const isPos = (stock?.change ?? 0) >= 0;

  // ── 기술적 지표 계산 ──
  const chartData = Array.isArray(chart) ? chart : [];
  const prices    = chartData.map((p) => p.price);

  const enhancedData = useMemo(() => {
    const ma5  = calcMA(prices, 5);
    const ma20 = calcMA(prices, 20);
    const ma60 = calcMA(prices, 60);
    const bb   = calcBB(prices, 20, 2);
    const rsi  = calcRSI(prices, 14);

    // 비교 차트: 수익률 정규화
    const compareData = Array.isArray(compareChart) ? compareChart : [];
    const compareBase = compareData[0]?.price ?? 1;
    const mainBase    = chartData[0]?.price ?? 1;

    return chartData.map((p, i) => ({
      ...p,
      ma5:      ma5[i],
      ma20:     ma20[i],
      ma60:     ma60[i],
      bbUpper:  bb[i]?.upper  ?? null,
      bbMiddle: bb[i]?.middle ?? null,
      bbLower:  bb[i]?.lower  ?? null,
      rsi:      rsi[i],
      // 비교: 같은 날짜 찾기
      compareRet: compareData.find((c) => c.date === p.date)
        ? ((compareData.find((c) => c.date === p.date)!.price / compareBase) - 1) * 100
        : null,
      mainRet: ((p.price / mainBase) - 1) * 100,
    }));
  }, [chartData, prices, compareChart]);

  const rsiData = enhancedData.filter((d) => d.rsi !== null);
  const chartMin = prices.length ? Math.min(...prices) * 0.995 : 0;
  const chartMax = prices.length ? Math.max(...prices) * 1.005 : 0;

  const pnl     = myPortfolio ? (stock!.price - myPortfolio.avgPrice) * myPortfolio.quantity : null;
  const pnlRate = myPortfolio ? ((stock!.price - myPortfolio.avgPrice) / myPortfolio.avgPrice) * 100 : null;

  const savePortfolio = () => {
    const q = parseFloat(qty), a = parseFloat(avg);
    if (q > 0 && a > 0) setEntry(ticker, { quantity: q, avgPrice: a });
    else removeEntry(ticker);
  };
  const saveAlert = () => {
    const above = parseFloat(alertAbove) || undefined;
    const below = parseFloat(alertBelow) || undefined;
    if (!above && !below) { removeAlert(ticker); return; }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    setAlert(ticker, { above, below });
  };

  if (!ticker) return null;
  if (isLoading) return (
    <div className="max-w-4xl mx-auto animate-pulse space-y-4">
      <div className="h-6 w-32 bg-white/10 rounded" />
      <div className="h-48 bg-white/5 rounded-2xl" />
      <div className="h-64 bg-white/5 rounded-2xl" />
    </div>
  );
  if (stockError || !stock || 'error' in stock) return (
    <div className="max-w-4xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        대시보드로 돌아가기
      </Link>
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-red-400 font-medium">데이터를 불러올 수 없습니다</p>
        <p className="text-[var(--text-muted)] text-sm mt-1">종목 코드: {ticker}</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)] mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        대시보드로 돌아가기
      </Link>

      {/* ── 종목 헤더 ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text)]">{stock.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${stock.market === 'KOSDAQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {stock.market}
              </span>
            </div>
            <span className="text-sm text-[var(--text-muted)] font-mono">{ticker}</span>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-[var(--text)]">₩{fmt(stock.price)}</p>
            <p className={`text-base font-semibold mt-1 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '+' : ''}{fmt(stock.change)}원 ({isPos ? '+' : ''}{stock.changeRate.toFixed(2)}%)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[var(--border)] text-sm">
          <div><p className="text-[var(--text-muted)] text-xs mb-0.5">거래량</p><p className="font-medium text-[var(--text)]">{stock.volume}</p></div>
          <div><p className="text-[var(--text-muted)] text-xs mb-0.5">시가총액</p><p className="font-medium text-[var(--text)]">{stock.marketCap}</p></div>
          {stock.high52w && <div><p className="text-[var(--text-muted)] text-xs mb-0.5">52주 최고</p><p className="font-medium text-emerald-400">₩{fmt(stock.high52w)}</p></div>}
          {stock.low52w  && <div><p className="text-[var(--text-muted)] text-xs mb-0.5">52주 최저</p><p className="font-medium text-red-400">₩{fmt(stock.low52w)}</p></div>}
        </div>
      </div>

      {/* ── 차트 ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 mb-4">
        {/* 상단 컨트롤 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">가격 차트</h2>
          <div className="flex gap-1">
            {TIMEFRAMES.map((t, i) => (
              <button key={t.label} onClick={() => setTfIdx(i)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${tfIdx === i ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 지표 토글 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: 'ma5',  label: 'MA5',  active: showMA5,  set: setShowMA5,  color: 'text-yellow-400' },
            { key: 'ma20', label: 'MA20', active: showMA20, set: setShowMA20, color: 'text-blue-400' },
            { key: 'ma60', label: 'MA60', active: showMA60, set: setShowMA60, color: 'text-red-400' },
            { key: 'bb',   label: 'BB',   active: showBB,   set: setShowBB,   color: 'text-purple-400' },
            { key: 'rsi',  label: 'RSI',  active: showRSI,  set: setShowRSI,  color: 'text-emerald-400' },
            { key: 'vol',  label: '거래량', active: showVol, set: setShowVol,  color: 'text-sky-400' },
          ].map(({ key, label, active, set, color }) => (
            <button key={key} onClick={() => set((v) => !v)}
              className={`px-2.5 py-1 text-[10px] rounded-lg border font-medium transition-colors ${
                active
                  ? `border-current bg-white/10 ${color}`
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* 비교 차트 입력 (이름/코드 검색) */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-[240px]" ref={compareDropRef}>
            <input
              type="text" placeholder="비교 종목 (이름·코드, 예: 삼성전자)"
              value={compareInput}
              onChange={(e) => handleCompareInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCompare();
                if (e.key === 'Escape') setShowCompareDrop(false);
              }}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50"
            />
            {showCompareDrop && compareHits.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
                {compareHits.map((h) => (
                  <button key={h.ticker} onClick={() => pickCompare(h)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-[var(--border)] last:border-0">
                    <span className="text-xs text-[var(--text)]">{h.name}</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{h.ticker.replace(/\.(KS|KQ)$/, '')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={submitCompare}
            className="px-3 py-1.5 text-xs rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors">
            비교
          </button>
          {compareTicker && (
            <button onClick={clearCompare}
              className="text-xs text-[var(--text-muted)] hover:text-red-400">✕ 해제</button>
          )}
        </div>

        {/* 메인 차트 */}
        {enhancedData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={compareTicker ? 220 : 240}>
              {compareTicker ? (
                // 비교 모드: 수익률 정규화 차트
                <ComposedChart data={enhancedData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(4,6)}/${String(v).slice(6,8)}`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-1">
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {Number(p.value).toFixed(2)}%</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="mainRet" name={stock.name} stroke={isPos ? '#10b981' : '#ef4444'}
                    strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="compareRet" name={compareName || compareTicker} stroke="#f59e0b"
                    strokeWidth={1.5} dot={false} connectNulls />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                </ComposedChart>
              ) : (
                // 일반 모드: OHLC + 지표
                <ComposedChart data={enhancedData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(4,6)}/${String(v).slice(6,8)}`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[chartMin, chartMax]} tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as typeof enhancedData[0];
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
                        <p className="text-gray-400">{String(d.date).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</p>
                        <p className="text-white font-semibold">₩{fmt(d.price)}</p>
                        {showMA5  && d.ma5  && <p className="text-yellow-400">MA5: ₩{fmt(d.ma5)}</p>}
                        {showMA20 && d.ma20 && <p className="text-blue-400">MA20: ₩{fmt(d.ma20)}</p>}
                        {showMA60 && d.ma60 && <p className="text-red-400">MA60: ₩{fmt(d.ma60)}</p>}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="price" stroke={isPos ? '#10b981' : '#ef4444'}
                    strokeWidth={1.5} fill="url(#stockGrad)" dot={false} />
                  {showBB && <>
                    <Line type="monotone" dataKey="bbUpper"  stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="bbMiddle" stroke="#8b5cf6" strokeWidth={1} dot={false} opacity={0.5} />
                    <Line type="monotone" dataKey="bbLower"  stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  </>}
                  {showMA5  && <Line type="monotone" dataKey="ma5"  stroke="#facc15" strokeWidth={1.2} dot={false} />}
                  {showMA20 && <Line type="monotone" dataKey="ma20" stroke="#60a5fa" strokeWidth={1.2} dot={false} />}
                  {showMA60 && <Line type="monotone" dataKey="ma60" stroke="#f87171" strokeWidth={1.2} dot={false} />}
                </ComposedChart>
              )}
            </ResponsiveContainer>

            {/* 거래량 차트 */}
            {showVol && !compareTicker && (
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={enhancedData} margin={{ top: 4, right: 5, left: 10, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Area type="monotone" dataKey="volume" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.3} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* RSI 차트 */}
            {showRSI && !compareTicker && rsiData.length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="text-[10px] text-[var(--text-muted)] mb-1">RSI (14)</p>
                <ResponsiveContainer width="100%" height={80}>
                  <ComposedChart data={rsiData} margin={{ top: 0, right: 5, left: 10, bottom: 0 }}>
                    <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={24} />
                    <XAxis dataKey="date" hide />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-gray-900 border border-white/10 rounded-lg px-2 py-1 text-xs">
                          <p className="text-emerald-400">RSI: {Number(payload[0].value).toFixed(1)}</p>
                        </div>
                      );
                    }} />
                    <Line type="monotone" dataKey="rsi" stroke="#34d399" strokeWidth={1.2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="h-60 flex items-center justify-center text-[var(--text-muted)] text-sm">
            차트 데이터 로딩 중...
          </div>
        )}
      </div>

      {/* ── 수급 동향 ── */}
      <InvestorSection ticker={ticker} />

      {/* ── DART 섹션 (KR 주식만) ── */}
      {(ticker.endsWith('.KS') || ticker.endsWith('.KQ')) && (() => {
        const code = ticker.replace(/\.(KS|KQ)$/, '');
        return (
          <>
            <KrxListingSection code={code} />
            <DartCompanySection code={code} />
            <DartFinancialSection code={code} />
            <DartDividendSection code={code} />
          </>
        );
      })()}

      {/* ── AI 분석 ── */}
      <AiAnalysis stock={stock} />

      {/* ── 포트폴리오 & 알림 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">포트폴리오</h2>
          {myPortfolio && pnl !== null && pnlRate !== null && (
            <div className="mb-4 p-3 rounded-lg bg-white/5 text-xs space-y-1.5">
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">보유 수량</span><span>{fmt(myPortfolio.quantity)}주</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">평균 단가</span><span>₩{fmt(myPortfolio.avgPrice)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">평가 금액</span><span>₩{fmt(Math.round(stock.price * myPortfolio.quantity))}</span></div>
              <div className={`flex justify-between font-semibold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <span>손익</span><span>{pnl >= 0 ? '+' : ''}{fmt(Math.round(pnl))}원 ({pnlRate.toFixed(2)}%)</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <input type="number" placeholder="보유 수량 (주)" value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50" />
            <input type="number" placeholder="평균 매입가 (원)" value={avg} onChange={(e) => setAvg(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50" />
            <button onClick={savePortfolio}
              className="w-full py-2 rounded-lg bg-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/30 transition-colors">저장</button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4">가격 알림 🔔</h2>
          {myAlert && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs space-y-1">
              {myAlert.above && <p className="text-yellow-400">↑ ₩{fmt(myAlert.above)} 이상 시 알림</p>}
              {myAlert.below && <p className="text-yellow-400">↓ ₩{fmt(myAlert.below)} 이하 시 알림</p>}
            </div>
          )}
          <div className="space-y-2">
            <input type="number" placeholder="목표가 (이상 시 알림)" value={alertAbove} onChange={(e) => setAlertAbove(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-yellow-500/50" />
            <input type="number" placeholder="하한가 (이하 시 알림)" value={alertBelow} onChange={(e) => setAlertBelow(e.target.value)}
              className="w-full bg-white/5 border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-yellow-500/50" />
            <button onClick={saveAlert}
              className="w-full py-2 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm font-medium hover:bg-yellow-500/30 transition-colors">알림 설정</button>
            {myAlert && (
              <button onClick={() => { removeAlert(ticker); setAlertAbove(''); setAlertBelow(''); }}
                className="w-full py-2 rounded-lg text-[var(--text-muted)] text-xs hover:text-red-400 transition-colors">알림 해제</button>
            )}
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)] opacity-70">브라우저 알림 권한이 필요합니다</p>
        </div>
      </div>
    </div>
  );
}
