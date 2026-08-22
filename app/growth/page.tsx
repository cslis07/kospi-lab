'use client';

/**
 * 성장주·기대주 발굴 — PER·PEG·성장률·컨센서스 기반 스캔.
 *
 * 흐름: 유니버스(KRX 시총 상위) 선택 → 스캔 버튼 → 15개씩 배치 조회(진행률 표시)
 *       → 점수 정렬 테이블. 행의 "정밀 분석"으로 /stock-analysis 연결.
 * 원칙: 페이지 진입만으로는 아무것도 호출하지 않는다(버튼 실행 — §0 비용 원칙).
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCandidates } from '@/hooks/useCandidates';
import CandidateBoard from '@/components/CandidateBoard';

interface UniverseItem {
  code: string; name: string; market: string; sector?: string; themes?: string[];
  close: number; changeRate: number; marketCap: number; tradingValue: number;
  adhoc?: boolean;
}
interface SearchHit { symbol: string; name: string; exchange: string; us: boolean }
interface ScoreMetrics {
  revYoY: number | null; opYoY: number | null; revYoYPrev: number | null;
  cRevGrowth: number | null; cOpGrowth: number | null; cEpsGrowth: number | null;
  trailingPer: number | null; forwardPer: number | null; peg: number | null;
  roe: number | null; opMarginTrend: number | null; debtRatio: number | null;
}
interface Score {
  total: number;
  parts: { growth: number; outlook: number; quality: number; valuation: number };
  metrics: ScoreMetrics;
  badges: string[]; hasConsensus: boolean; warnings: string[];
  buffett: { pass: number; total: number; checks: { label: string; pass: boolean | null; note: string }[] };
  comment: string;
}
/** KR 배치 항목: { code, score } / US 배치 항목: { ticker, name, sector, price, marketCap, score } */
interface KrScanItem { code: string; score: Score }
interface UsScanItem { ticker: string; name: string; sector: string; themes: string[]; price: number | null; marketCap: number | null; adhoc: boolean; score: Score }
type ResultRow = UniverseItem & Score;

interface EnvIndicator {
  key: string; label: string; value: number; unit: string; asOf: string;
  monthAgo: number | null; changePct: number | null;
  tone: 'good' | 'neutral' | 'warn'; comment: string;
}
interface MarketEnv {
  indicators: EnvIndicator[];
  overall: { tone: 'good' | 'neutral' | 'warn'; label: string; comment: string };
}

const BATCH = 15;

const MARKETS = [
  { key: 'ALL', label: '한국 전체' },
  { key: 'KOSPI', label: 'KOSPI' },
  { key: 'KOSDAQ', label: 'KOSDAQ' },
  { key: 'US', label: '🇺🇸 미국' },
] as const;

/** 섹터 합계 = 전체 종목 수 (테마는 중복 태깅이라 합이 다르다) */
const US_TOTAL = (c: { sectorCounts: Record<string, number> }) =>
  Object.values(c.sectorCounts).reduce((a, b) => a + b, 0);

const TONE_STYLE = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  neutral: 'bg-white/5 text-[var(--text-muted)] border-[var(--border)]',
  warn: 'bg-red-500/10 text-red-400 border-red-500/30',
} as const;

const BADGE_STYLE: Record<string, string> = {
  '고성장': 'bg-red-500/15 text-red-400 border-red-500/40',
  '기대주': 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  '턴어라운드': 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  '저평가성장': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
};

type SortKey = 'total' | 'revYoY' | 'opYoY' | 'cOpGrowth' | 'peg' | 'forwardPer' | 'roe' | 'marketCap';

function fmtCap(won: number, isUs = false): string {
  if (isUs) {
    if (won >= 1e12) return `$${(won / 1e12).toFixed(1)}T`;
    if (won >= 1e9) return `$${Math.round(won / 1e9).toLocaleString()}B`;
    return won > 0 ? `$${won.toLocaleString()}` : '-';
  }
  if (won >= 1e12) return `${(won / 1e12).toFixed(1)}조`;
  if (won >= 1e8) return `${Math.round(won / 1e8).toLocaleString()}억`;
  return won > 0 ? won.toLocaleString() : '-';
}
function pctCell(v: number | null, digits = 1): string {
  return v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
function pctColor(v: number | null): string {
  if (v == null) return 'text-[var(--text-muted)]';
  return v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text-muted)]';
}

export default function GrowthPage() {
  const [market, setMarket] = useState<(typeof MARKETS)[number]['key']>('ALL');
  const [top, setTop] = useState(100);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanInfo, setScanInfo] = useState<{ date: string; market: string; top: number } | null>(null);
  const [env, setEnv] = useState<MarketEnv | null>(null);
  const abortRef = useRef(false);
  const isUs = market === 'US';

  // 후보 — 스캔 결과가 휘발되지 않도록 ☆ 로 담아 보드에서 이어서 본다
  const cand = useCandidates();
  const toggleCandidate = (r: ResultRow) => {
    if (cand.has(r.code)) { cand.remove(r.code); return; }
    cand.add({
      code: r.code, name: r.name, market: r.market === 'US' ? 'US' : 'KR',
      sector: r.sector, themes: r.themes,
      growthScore: r.total, badges: r.badges,
      buffettPass: r.buffett.pass, buffettTotal: r.buffett.total,
      peg: r.metrics.peg, comment: r.comment,
    });
  };

  // 미국 카테고리 (섹터 × 테마) — 유니버스 API 가 목록·개수를 함께 준다
  const [catMode, setCatMode] = useState<'sector' | 'theme'>('theme');
  const [sector, setSector] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [cats, setCats] = useState<{
    sectors: string[]; themes: string[];
    sectorCounts: Record<string, number>; themeCounts: Record<string, number>;
  } | null>(null);

  // 종목 검색
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  // 미국 탭을 켜면 카테고리 목록을 한 번 받아둔다 (정적 리스트라 저렴)
  useEffect(() => {
    if (!isUs || cats) return;
    fetch('/api/growth-scan?mode=universe&market=US')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.sectors) setCats({ sectors: j.sectors, themes: j.themes, sectorCounts: j.sectorCounts, themeCounts: j.themeCounts }); })
      .catch(() => {});
  }, [isUs, cats]);

  // 검색 디바운스
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        // 검색 대상 시장은 탭이 아니라 '검색어'로 판정한다 — 한국 탭인 채로 'coinbase'를 쳐도
        // 미국 종목이 나오도록. 숫자코드·한글=국내(어느 탭이든), 영문=미국(어느 탭이든).
        // 한글을 탭에 맡기면 US 탭에서 '삼성전자'가 Yahoo로 가 005930.KS(스캔 불가 형식)를 받는다.
        const isKrCode = /^\d{4,6}$/.test(q);
        const hasKorean = /[가-힣]/.test(q);
        const asciiName = !hasKorean && /[A-Za-z]/.test(q);
        const useUs = isKrCode || hasKorean ? false : asciiName ? true : isUs;
        const url = useUs ? `/api/overseas/search?q=${encodeURIComponent(q)}` : `/api/stock-search?q=${encodeURIComponent(q)}`;
        const r = await fetch(url);
        const j = await r.json();
        setHits(
          useUs
            ? (Array.isArray(j) ? j : []).slice(0, 8).map((x: { symbol: string; name: string; exchange?: string }) => ({
                symbol: x.symbol, name: x.name, exchange: x.exchange ?? 'US', us: true,
              }))
            : (Array.isArray(j) ? j : []).slice(0, 8).map((x: { code?: string; ticker?: string; name: string }) => ({
                symbol: x.code ?? String(x.ticker ?? '').replace(/\.(KS|KQ)$/, ''), name: x.name, exchange: 'KRX', us: false,
              })),
        );
      } catch { setHits([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, isUs]);

  /** 검색 결과 한 종목만 스캔해 결과 맨 위에 추가 — 스캔 시장은 탭이 아니라 '선택한 종목'을 따른다 */
  const scanOne = async (hit: SearchHit) => {
    let { symbol, us } = hit;
    const { name } = hit;
    // Yahoo는 영문 질의('samsung')에도 국내 상장(005930.KS/.KQ)을 돌려준다 —
    // 그대로 tickers= 로 보내면 서버 정규식(숫자 불허)에서 걸러져 실패하므로 국내 코드로 정규화
    const krListed = symbol.match(/^(\d{6})\.K[SQ]$/);
    if (us && krListed) { symbol = krListed[1]; us = false; }
    setQuery(''); setHits([]);
    // 선택한 종목의 시장으로 탭을 맞춰 결과 표기(현재가·시총·컬럼)를 일치시킨다
    if (us && market !== 'US') { setMarket('US'); setSector(null); setTheme(null); }
    else if (!us && isUs) { setMarket('ALL'); setSector(null); setTheme(null); }
    setScanning(true); setScanError(null);
    try {
      const param = us ? `tickers=${encodeURIComponent(symbol)}` : `codes=${encodeURIComponent(symbol)}`;
      const r = await fetch(`/api/growth-scan?${param}`);
      const j = await r.json();
      const items = j.items ?? [];
      if (!items.length) throw new Error(`${name}(${symbol}) 재무 데이터를 가져오지 못했습니다 — 신규상장·ETF·소형주일 수 있습니다.`);
      const row: ResultRow = us
        ? (() => {
            const it = items[0] as UsScanItem;
            return {
              // Yahoo 가 이름을 안 주면(티커만 반환) 검색 결과의 이름을 쓴다
              code: it.ticker, name: it.name && it.name !== it.ticker ? it.name : name,
              market: 'US', sector: it.sector, themes: it.themes,
              close: it.price ?? 0, changeRate: 0, marketCap: it.marketCap ?? 0, tradingValue: 0,
              adhoc: it.adhoc, ...it.score,
            };
          })()
        : (() => {
            const it = items[0] as KrScanItem;
            return {
              code: it.code, name, market: 'KOSPI', close: 0, changeRate: 0, marketCap: 0, tradingValue: 0,
              ...it.score,
            };
          })();
      setRows((prev) => [row, ...(prev ?? []).filter((x) => x.code !== row.code)]);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  // 필터·정렬
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortAsc, setSortAsc] = useState(false);
  const [onlyConsensus, setOnlyConsensus] = useState(false);
  const [onlyProfit, setOnlyProfit] = useState(false);
  const [maxPeg, setMaxPeg] = useState<number | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true); setScanError(null); setRows(null); setFailed([]);
    abortRef.current = false;
    // 시장 환경(유가·금리·VIX·달러)은 스캔과 함께 로드 — 서버 6h 캐시라 저렴
    fetch('/api/growth-scan?mode=environment')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.indicators) setEnv(j); })
      .catch(() => {});
    try {
      const catQ = market === 'US'
        ? `${sector ? `&sector=${encodeURIComponent(sector)}` : ''}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`
        : '';
      const uRes = await fetch(`/api/growth-scan?mode=universe&market=${market}&top=${top}${catQ}`);
      const u = await uRes.json();
      if (!uRes.ok || u.error) throw new Error(u.error ?? `유니버스 조회 실패 (HTTP ${uRes.status})`);
      if (u.configured === false) throw new Error('KRX API 키가 설정되지 않았습니다 — 유니버스(시총 순위)를 만들 수 없습니다.');
      const universe: UniverseItem[] = market === 'US' ? (u.items ?? []) : (u.items ?? []);
      if (!universe.length) throw new Error('유니버스가 비었습니다 — 데이터 미수신.');

      setScanInfo({ date: u.date, market, top });
      setProgress({ done: 0, total: universe.length });
      const byCode = new Map(universe.map((x) => [x.code, x]));
      const acc: ResultRow[] = [];
      const failedAcc: string[] = [];

      for (let i = 0; i < universe.length; i += BATCH) {
        if (abortRef.current) break;
        const chunk = universe.slice(i, i + BATCH);
        const param = market === 'US'
          ? `tickers=${chunk.map((c) => c.code).join(',')}`
          : `codes=${chunk.map((c) => c.code).join(',')}`;
        try {
          const r = await fetch(`/api/growth-scan?${param}`);
          const j = await r.json();
          if (r.ok && j.items) {
            if (market === 'US') {
              for (const it of j.items as UsScanItem[]) {
                const base = byCode.get(it.ticker);
                if (base) acc.push({
                  ...base,
                  name: it.name || base.name, sector: it.sector,
                  close: it.price ?? 0, marketCap: it.marketCap ?? 0,
                  ...it.score,
                });
              }
            } else {
              for (const it of j.items as KrScanItem[]) {
                const base = byCode.get(it.code);
                if (base) acc.push({ ...base, ...it.score });
              }
            }
            failedAcc.push(...(j.failed ?? []));
          } else {
            failedAcc.push(...chunk.map((c) => c.code));
          }
        } catch {
          failedAcc.push(...chunk.map((c) => c.code));
        }
        setProgress({ done: Math.min(i + BATCH, universe.length), total: universe.length });
        setRows([...acc].sort((a, b) => b.total - a.total));   // 중간 결과도 보여준다
      }
      setFailed(failedAcc);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const view = useMemo(() => {
    if (!rows) return null;
    let v = rows;
    if (onlyConsensus) v = v.filter((r) => r.hasConsensus);
    if (onlyProfit) v = v.filter((r) => r.metrics.trailingPer != null);   // trailing PER 존재 = 흑자
    if (maxPeg != null) v = v.filter((r) => r.metrics.peg != null && r.metrics.peg <= maxPeg);
    if (badgeFilter) v = v.filter((r) => r.badges.includes(badgeFilter));
    const dir = sortAsc ? 1 : -1;
    const val = (r: ResultRow): number => {
      if (sortKey === 'total') return r.total;
      if (sortKey === 'marketCap') return r.marketCap;
      // 미국은 컨센서스 영업이익 대신 포워드 EPS 성장이 대응 지표
      const m = sortKey === 'cOpGrowth'
        ? (r.metrics.cOpGrowth ?? r.metrics.cEpsGrowth)
        : r.metrics[sortKey];
      // 결측은 항상 맨 뒤로
      return m == null ? (sortAsc ? Infinity : -Infinity) : m;
    };
    return [...v].sort((a, b) => (val(a) - val(b)) * dir);
  }, [rows, onlyConsensus, onlyProfit, maxPeg, badgeFilter, sortKey, sortAsc]);

  const th = (key: SortKey, label: string, tip?: string) => (
    <th
      className="px-2 py-2 text-right text-[10px] font-semibold text-[var(--text-muted)] cursor-pointer select-none whitespace-nowrap hover:text-[var(--text)]"
      title={tip}
      onClick={() => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(key === 'peg' || key === 'forwardPer'); } }}
    >
      {label}{sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-[var(--text)]">성장주 발굴 <span className="text-xs font-normal text-[var(--text-muted)]">PER·PEG·성장률·컨센서스</span></h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          한국(KRX 시총 상위)·미국(대형주 큐레이션)의 재무와 애널리스트 컨센서스를 훑어
          <strong className="text-[var(--text)]"> 확정 성장 35 · 미래 기대 30 · 수익성 15 · 밸류에이션 20</strong> 으로 점수화합니다.
          여기에 <strong className="text-[var(--text)]">시장 환경(유가·금리·VIX·달러)</strong>과
          <strong className="text-[var(--text)]"> 버핏 체크 7항목</strong>(ROE·이익률·흑자·부채·성장·배당·지급능력)을 함께 봅니다.
        </p>
      </div>

      {/* 컨트롤 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] mb-1">유니버스</p>
            <div className="flex gap-1">
              {MARKETS.map((m) => (
                <button key={m.key} onClick={() => { setMarket(m.key); setSector(null); setTheme(null); }} disabled={scanning}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    market === m.key ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}>{m.label}</button>
              ))}
            </div>
          </div>
          {!isUs && (
            <div>
              <p className="text-[10px] text-[var(--text-muted)] mb-1">시총 상위</p>
              <div className="flex gap-1">
                {[50, 100, 150].map((t) => (
                  <button key={t} onClick={() => setTop(t)} disabled={scanning}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      top === t ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}>{t}종목</button>
                ))}
              </div>
            </div>
          )}
          {!scanning ? (
            <button onClick={scan}
              className="px-5 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-400 transition-colors">
              🔍 {isUs && (theme || sector) ? `${theme ?? sector} 스캔` : '스캔 실행'}
            </button>
          ) : (
            <button onClick={() => { abortRef.current = true; }}
              className="px-5 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-colors">
              ⏹ 중단
            </button>
          )}
          <p className="text-[10px] text-[var(--text-muted)]">
            버튼을 눌러야만 실행됩니다 · {isUs ? '종목당 Yahoo 재무 1콜(1시간 캐시)' : `종목당 네이버 재무 1콜(12시간 캐시) · ${top}종목 ≈ ${Math.ceil(top / BATCH)}배치`}
          </p>
        </div>

        {/* 종목 검색 — 유니버스에 없어도 티커로 직접 스캔 */}
        <div className="mt-3 relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isUs ? '종목 검색 — 예: NVDA, Palantir, 로블록스' : '종목 검색 — 예: 삼성전자, 005930'}
            className="w-full sm:max-w-md px-3 py-2 text-sm bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50"
          />
          {(hits.length > 0 || (searching && query.trim())) && (
            <div className="absolute z-20 mt-1 w-full sm:max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
              {searching && !hits.length && <p className="px-3 py-2 text-xs text-[var(--text-muted)]">검색 중…</p>}
              {hits.map((h) => (
                <button key={h.symbol} onClick={() => scanOne(h)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors">
                  <span className="text-xs text-[var(--text)] truncate">
                    <span className="font-semibold">{h.symbol}</span> <span className="text-[var(--text-muted)]">{h.name}</span>
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] shrink-0">{h.exchange}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[var(--text-muted)] mt-1">
            찾는 종목이 카테고리에 없으면 여기서 직접 검색하세요 — 선택 즉시 그 종목만 스캔해 맨 위에 추가합니다. 영문명·티커(예: coinbase, COIN)는 어느 탭에서든 미국 종목을 찾습니다.
          </p>
        </div>

        {/* 미국 카테고리 — 섹터(GICS 11) × 테마(증권사 스타일) */}
        {isUs && cats && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex gap-1">
                {(['theme', 'sector'] as const).map((m) => (
                  <button key={m} onClick={() => { setCatMode(m); setSector(null); setTheme(null); }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                      catMode === m ? 'bg-white/10 text-[var(--text)] border-[var(--border)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text)]'
                    }`}>{m === 'theme' ? '테마별' : '섹터별'}</button>
                ))}
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {catMode === 'theme' ? 'AI·반도체, 원자력, 우주항공 등 증권사 테마 분류' : 'GICS 11개 섹터 (글로벌 표준 산업 분류)'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => { setSector(null); setTheme(null); }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                  !sector && !theme ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                }`}>전체 {US_TOTAL(cats)}</button>
              {(catMode === 'theme' ? cats.themes : cats.sectors).map((c) => {
                const active = catMode === 'theme' ? theme === c : sector === c;
                const n = catMode === 'theme' ? cats.themeCounts[c] : cats.sectorCounts[c];
                return (
                  <button key={c}
                    onClick={() => {
                      if (catMode === 'theme') { setTheme(active ? null : c); setSector(null); }
                      else { setSector(active ? null : c); setTheme(null); }
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                      active ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                    }`}>{c} <span className="opacity-60">{n}</span></button>
                );
              })}
            </div>
          </div>
        )}

        {scanning && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{progress.done} / {progress.total} 종목 조회 중…</p>
          </div>
        )}
      </div>

      {/* 후보 보드 — 담아둔 종목을 재무 × 타이밍으로. 스캔보다 위에 둔다(매일 먼저 볼 화면) */}
      {cand.ready && <CandidateBoard candidates={cand.candidates} onRemove={cand.remove} onClear={cand.clear} />}
      {cand.saveError && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">⚠ {cand.saveError}</p>
      )}

      {/* 시장 환경 — 종목과 무관하게 "지금 성장주 하기 좋은 날씨인가" */}
      {env && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-[var(--text)]">🌡 시장 환경</h2>
            <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${TONE_STYLE[env.overall.tone]}`}>{env.overall.label}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{env.overall.comment}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {env.indicators.map((ind) => (
              <div key={ind.key} className={`rounded-xl border p-2.5 ${TONE_STYLE[ind.tone]}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold">{ind.label}</span>
                  <span className="text-xs font-bold tabular-nums">
                    {ind.unit === '$' ? '$' : ''}{ind.value.toFixed(ind.value >= 100 ? 1 : 2)}{ind.unit !== '$' ? ind.unit : ''}
                    {ind.changePct != null && (
                      <span className="ml-1 text-[10px] font-normal">
                        (1M {ind.changePct > 0 ? '+' : ''}{ind.changePct}{ind.key === 'us10y' ? '%p' : '%'})
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed opacity-80">{ind.comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {scanError && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400 mb-4">스캔 실패: {scanError}</div>
      )}

      {!rows && !scanning && !scanError && (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <p className="text-3xl mb-3">🌱</p>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">유니버스를 고르고 <span className="text-sky-400">스캔 실행</span>을 누르세요</p>
          <p className="text-xs text-[var(--text-muted)]">페이지를 열 때 자동으로 실행되지 않습니다. 시총 상위 종목의 재무·컨센서스를 배치로 수집합니다.</p>
        </div>
      )}

      {rows && (
        <>
          {/* 상위 추천 — 점수 상위 5종목 + 이유 코멘트 */}
          {!scanning && rows.length >= 5 && (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4 mb-4">
              <h2 className="text-sm font-bold text-[var(--text)] mb-2">🏆 상위 추천 5 <span className="text-[10px] font-normal text-[var(--text-muted)]">점수순 · 룰 기반 자동 코멘트</span></h2>
              <div className="space-y-1.5">
                {[...rows].sort((a, b) => b.total - a.total).slice(0, 5).map((r, i) => (
                  <div key={r.code} className="flex items-start gap-2 text-xs">
                    <span className="text-[var(--text-muted)] tabular-nums w-4 shrink-0">{i + 1}.</span>
                    <span className="font-bold text-[var(--text)] shrink-0">{r.name}</span>
                    <span className="font-bold text-sky-400 tabular-nums shrink-0">{Math.round(r.total)}점</span>
                    <span className="text-[var(--text-muted)] leading-relaxed">{r.comment}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            <button onClick={() => setOnlyConsensus(!onlyConsensus)}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${onlyConsensus ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'}`}>
              컨센서스 있는 종목만</button>
            <button onClick={() => setOnlyProfit(!onlyProfit)}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${onlyProfit ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'}`}>
              흑자 기업만</button>
            <button onClick={() => setMaxPeg(maxPeg == null ? 1.5 : null)}
              className={`px-2.5 py-1 rounded-lg border transition-colors ${maxPeg != null ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'}`}>
              PEG ≤ 1.5</button>
            {Object.keys(BADGE_STYLE).map((b) => (
              <button key={b} onClick={() => setBadgeFilter(badgeFilter === b ? null : b)}
                className={`px-2.5 py-1 rounded-lg border transition-colors ${badgeFilter === b ? BADGE_STYLE[b] : 'text-[var(--text-muted)] border-[var(--border)]'}`}>
                {b}</button>
            ))}
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">
              {view?.length ?? 0}/{rows.length}종목 표시
              {scanInfo && ` · 기준일 ${scanInfo.date}`}
              {failed.length > 0 && ` · 조회 실패 ${failed.length}건`}
            </span>
          </div>

          {/* 결과 테이블 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto">
            <table className="w-full text-xs min-w-[880px]">
              <thead className="border-b border-[var(--border)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-[var(--text-muted)]">#</th>
                  <th className="px-1 py-2" title="후보로 담기" />
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--text-muted)]">종목</th>
                  {th('total', '점수')}
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--text-muted)]">배지</th>
                  {/* US는 Yahoo 필드 특성상 주기·항목이 KR과 다르다 — 라벨·툴팁으로 정직하게 구분 */}
                  {th('revYoY', isUs ? '매출YoY·분기' : '매출YoY', isUs ? '최근 분기 매출 YoY (Yahoo revenueGrowth) — 한국 탭의 연간 YoY와 주기가 다름' : '최근 확정 연도 매출 성장률')}
                  {th('opYoY', isUs ? '순익YoY·분기' : '영업YoY', isUs ? '최근 분기 순이익 YoY (Yahoo earningsGrowth) — 영업이익이 아닌 순이익 기준' : '최근 확정 연도 영업이익 성장률')}
                  {th('cOpGrowth', isUs ? '포워드EPS' : '컨센영업', isUs ? '포워드 EPS 성장률 (트레일링→포워드 PER 격차)' : '컨센서스(추정) 영업이익 성장률')}
                  {th('forwardPer', 'fwdPER', '컨센서스 EPS 기준 포워드 PER')}
                  {th('peg', 'PEG', '포워드 PER ÷ 컨센서스 EPS 성장률 — 1 미만이면 성장 대비 저평가')}
                  {th('roe', 'ROE')}
                  {th('marketCap', '시총')}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(view ?? []).map((r, i) => (
                  <Fragment key={r.code}>
                    <tr
                      className="border-b border-[var(--border)]/50 hover:bg-white/[0.03] cursor-pointer"
                      onClick={() => setExpanded(expanded === r.code ? null : r.code)}>
                      <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                      <td className="px-1 py-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleCandidate(r)}
                          className={`text-sm leading-none transition-colors ${cand.has(r.code) ? 'text-amber-400' : 'text-[var(--text-muted)] opacity-40 hover:opacity-100'}`}
                          title={cand.has(r.code) ? '후보에서 제거' : '후보로 담기'}
                          aria-label={cand.has(r.code) ? `${r.name} 후보에서 제거` : `${r.name} 후보로 담기`}>
                          {cand.has(r.code) ? '★' : '☆'}
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <span className="font-semibold text-[var(--text)]">{r.name}</span>
                        {r.market === 'US' && <span className="text-[9px] text-[var(--text-muted)] ml-1">{r.code}</span>}
                        <span className="text-[9px] text-[var(--text-muted)] ml-1">
                          {r.market === 'US' ? (r.sector ?? '') : /KOSDAQ/i.test(r.market) ? 'KQ' : 'KS'}
                        </span>
                        {r.adhoc && <span className="text-[9px] text-amber-400 ml-1" title="큐레이션 목록 밖 — 검색으로 추가한 종목">검색</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-14 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className={`h-full ${r.total >= 60 ? 'bg-red-400' : r.total >= 40 ? 'bg-amber-400' : 'bg-white/30'}`} style={{ width: `${r.total}%` }} />
                          </div>
                          <span className="font-bold text-[var(--text)] tabular-nums w-8">{Math.round(r.total)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.badges.map((b) => (
                            <span key={b} className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${BADGE_STYLE[b] ?? ''}`}>{b}</span>
                          ))}
                          {!r.hasConsensus && <span className="text-[9px] text-[var(--text-muted)]">미커버</span>}
                        </div>
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${pctColor(r.metrics.revYoY)}`}>{pctCell(r.metrics.revYoY)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${pctColor(r.metrics.opYoY)}`}>{pctCell(r.metrics.opYoY)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${pctColor(r.metrics.cOpGrowth ?? r.metrics.cEpsGrowth)}`}>{pctCell(r.metrics.cOpGrowth ?? r.metrics.cEpsGrowth)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">{r.metrics.forwardPer?.toFixed(1) ?? '-'}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-semibold ${r.metrics.peg != null && r.metrics.peg < 1 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>{r.metrics.peg?.toFixed(2) ?? '-'}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">{r.metrics.roe != null ? `${r.metrics.roe.toFixed(1)}%` : '-'}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmtCap(r.marketCap, r.market === 'US')}</td>
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {r.market !== 'US' && (
                          <Link href={`/stock-analysis?ticker=${r.code}`}
                            className="text-[10px] text-sky-400 hover:underline whitespace-nowrap">정밀 분석 →</Link>
                        )}
                      </td>
                    </tr>
                    {expanded === r.code && (
                      <tr key={`${r.code}-detail`} className="border-b border-[var(--border)]/50 bg-white/[0.02]">
                        <td colSpan={13} className="px-4 py-3">
                          <p className="text-[11px] text-[var(--text)] mb-2.5">
                            💬 <span className="text-[var(--text-muted)]">{r.comment}</span>
                          </p>
                          {r.themes && r.themes.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2.5">
                              {r.themes.map((t) => (
                                <button key={t}
                                  onClick={(e) => { e.stopPropagation(); setCatMode('theme'); setTheme(t); setSector(null); }}
                                  className="px-1.5 py-0.5 rounded border border-[var(--border)] text-[9px] text-[var(--text-muted)] hover:text-sky-400 hover:border-sky-500/40 transition-colors"
                                  title={`${t} 테마로 필터`}>#{t}</button>
                              ))}
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] mb-2">
                            {([
                              ['확정 성장', r.parts.growth, 35],
                              ['미래 기대', r.parts.outlook, 30],
                              ['수익성', r.parts.quality, 15],
                              ['밸류·안정', r.parts.valuation, 20],
                            ] as const).map(([label, v, max]) => (
                              <div key={label}>
                                <p className="text-[var(--text-muted)] mb-0.5">{label} <span className="tabular-nums">{v}/{max}</span></p>
                                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                                  <div className="h-full bg-sky-400" style={{ width: `${(v / max) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)] tabular-nums">
                            <span>매출YoY(직전) {pctCell(r.metrics.revYoYPrev)}</span>
                            <span>컨센 매출 {pctCell(r.metrics.cRevGrowth)}</span>
                            <span>컨센 EPS {pctCell(r.metrics.cEpsGrowth)}</span>
                            <span>PER(확정) {r.metrics.trailingPer?.toFixed(1) ?? '-'}</span>
                            <span>이익률 개선 {r.metrics.opMarginTrend != null ? `${r.metrics.opMarginTrend > 0 ? '+' : ''}${r.metrics.opMarginTrend}%p` : '-'}</span>
                            <span>부채비율 {r.metrics.debtRatio != null ? `${r.metrics.debtRatio.toFixed(0)}%` : '-'}</span>
                            <span>현재가 {r.market === 'US' ? `$${r.close.toLocaleString()}` : `${r.close.toLocaleString()}원 (${r.changeRate > 0 ? '+' : ''}${r.changeRate}%)`}</span>
                          </div>
                          {/* 버핏식 품질 체크 7항목 */}
                          <div className="mt-2.5">
                            <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1">
                              🎩 버핏 체크 <span className="tabular-nums text-[var(--text)]">{r.buffett.pass}/{r.buffett.total}</span>
                            </p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {r.buffett.checks.map((c) => (
                                <span key={c.label} className={`text-[10px] ${c.pass === true ? 'text-emerald-400' : c.pass === false ? 'text-red-400/70' : 'text-[var(--text-muted)] opacity-50'}`}>
                                  {c.pass === true ? '✓' : c.pass === false ? '✗' : '–'} {c.label} <span className="opacity-70">({c.note})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          {r.warnings.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {r.warnings.map((w, wi) => (
                                <p key={wi} className="text-[10px] text-amber-400">⚠ {w}</p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {view && view.length === 0 && (
              <p className="p-6 text-center text-xs text-[var(--text-muted)]">필터 조건에 맞는 종목이 없습니다.</p>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-muted)] mt-3 leading-relaxed">
            ※ 컨센서스는 애널리스트 추정치이며 빗나갈 수 있습니다. 점수는 재무·추정 기반 1차 선별일 뿐 매수 신호가 아닙니다 —
            선별 후 반드시 <Link href="/stock-analysis" className="text-sky-400 hover:underline">정밀 분석</Link>(수급·추세·공시)으로 진입 시점을 판단하세요.
            투자 판단과 책임은 투자자 본인에게 있습니다.
          </p>
        </>
      )}
    </div>
  );
}
