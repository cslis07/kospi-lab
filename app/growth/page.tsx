'use client';

/**
 * 성장주·기대주 발굴 — PER·PEG·성장률·컨센서스 기반 스캔.
 *
 * 흐름: 유니버스(KRX 시총 상위) 선택 → 스캔 버튼 → 15개씩 배치 조회(진행률 표시)
 *       → 점수 정렬 테이블. 행의 "정밀 분석"으로 /stock-analysis 연결.
 * 원칙: 페이지 진입만으로는 아무것도 호출하지 않는다(버튼 실행 — §0 비용 원칙).
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface UniverseItem {
  code: string; name: string; market: string;
  close: number; changeRate: number; marketCap: number; tradingValue: number;
}
interface ScoreMetrics {
  revYoY: number | null; opYoY: number | null; revYoYPrev: number | null;
  cRevGrowth: number | null; cOpGrowth: number | null; cEpsGrowth: number | null;
  trailingPer: number | null; forwardPer: number | null; peg: number | null;
  roe: number | null; opMarginTrend: number | null; debtRatio: number | null;
}
interface ScoredRow {
  code: string;
  score: {
    total: number;
    parts: { growth: number; outlook: number; quality: number; valuation: number };
    metrics: ScoreMetrics;
    badges: string[]; hasConsensus: boolean; warnings: string[];
  };
}
type ResultRow = UniverseItem & ScoredRow['score'];

const BATCH = 15;

const MARKETS = [
  { key: 'ALL', label: '전체 (시총 상위)' },
  { key: 'KOSPI', label: 'KOSPI' },
  { key: 'KOSDAQ', label: 'KOSDAQ' },
] as const;

const BADGE_STYLE: Record<string, string> = {
  '고성장': 'bg-red-500/15 text-red-400 border-red-500/40',
  '기대주': 'bg-sky-500/15 text-sky-400 border-sky-500/40',
  '턴어라운드': 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  '저평가성장': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
};

type SortKey = 'total' | 'revYoY' | 'opYoY' | 'cOpGrowth' | 'peg' | 'forwardPer' | 'roe' | 'marketCap';

function fmtCap(won: number): string {
  if (won >= 1e12) return `${(won / 1e12).toFixed(1)}조`;
  if (won >= 1e8) return `${Math.round(won / 1e8).toLocaleString()}억`;
  return won.toLocaleString();
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
  const abortRef = useRef(false);

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
    try {
      const uRes = await fetch(`/api/growth-scan?mode=universe&market=${market}&top=${top}`);
      const u = await uRes.json();
      if (!uRes.ok || u.error) throw new Error(u.error ?? `유니버스 조회 실패 (HTTP ${uRes.status})`);
      if (u.configured === false) throw new Error('KRX API 키가 설정되지 않았습니다 — 유니버스(시총 순위)를 만들 수 없습니다.');
      const universe: UniverseItem[] = u.items ?? [];
      if (!universe.length) throw new Error('유니버스가 비었습니다 — KRX 데이터 미수신.');

      setScanInfo({ date: u.date, market, top });
      setProgress({ done: 0, total: universe.length });
      const byCode = new Map(universe.map((x) => [x.code, x]));
      const acc: ResultRow[] = [];
      const failedAcc: string[] = [];

      for (let i = 0; i < universe.length; i += BATCH) {
        if (abortRef.current) break;
        const chunk = universe.slice(i, i + BATCH);
        try {
          const r = await fetch(`/api/growth-scan?codes=${chunk.map((c) => c.code).join(',')}`);
          const j = await r.json();
          if (r.ok && j.items) {
            for (const it of j.items as ScoredRow[]) {
              const base = byCode.get(it.code);
              if (base) acc.push({ ...base, ...it.score });
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
      const m = r.metrics[sortKey];
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
          KRX 시총 상위 종목의 재무(확정 3개년)와 애널리스트 컨센서스(추정 1개년)를 훑어
          <strong className="text-[var(--text)]"> 확정 성장 35 · 미래 기대 30 · 수익성 15 · 밸류에이션 20</strong> 으로 점수화합니다.
          기대주 = 컨센서스가 큰 폭의 성장을 보는 종목, 저평가성장 = PEG&lt;1.
        </p>
      </div>

      {/* 컨트롤 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[10px] text-[var(--text-muted)] mb-1">유니버스</p>
            <div className="flex gap-1">
              {MARKETS.map((m) => (
                <button key={m.key} onClick={() => setMarket(m.key)} disabled={scanning}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                    market === m.key ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}>{m.label}</button>
              ))}
            </div>
          </div>
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
          {!scanning ? (
            <button onClick={scan}
              className="px-5 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-bold hover:bg-sky-400 transition-colors">
              🔍 스캔 실행
            </button>
          ) : (
            <button onClick={() => { abortRef.current = true; }}
              className="px-5 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-colors">
              ⏹ 중단
            </button>
          )}
          <p className="text-[10px] text-[var(--text-muted)]">
            버튼을 눌러야만 실행됩니다 · 종목당 네이버 재무 1콜(12시간 캐시) · {top}종목 ≈ {Math.ceil(top / BATCH)}배치
          </p>
        </div>

        {scanning && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">{progress.done} / {progress.total} 종목 조회 중…</p>
          </div>
        )}
      </div>

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
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--text-muted)]">종목</th>
                  {th('total', '점수')}
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-[var(--text-muted)]">배지</th>
                  {th('revYoY', '매출YoY', '최근 확정 연도 매출 성장률')}
                  {th('opYoY', '영업YoY', '최근 확정 연도 영업이익 성장률')}
                  {th('cOpGrowth', '컨센영업', '컨센서스(추정) 영업이익 성장률')}
                  {th('forwardPer', 'fwdPER', '컨센서스 EPS 기준 포워드 PER')}
                  {th('peg', 'PEG', '포워드 PER ÷ 컨센서스 EPS 성장률 — 1 미만이면 성장 대비 저평가')}
                  {th('roe', 'ROE')}
                  {th('marketCap', '시총')}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(view ?? []).map((r, i) => (
                  <>
                    <tr key={r.code}
                      className="border-b border-[var(--border)]/50 hover:bg-white/[0.03] cursor-pointer"
                      onClick={() => setExpanded(expanded === r.code ? null : r.code)}>
                      <td className="px-3 py-2 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2">
                        <span className="font-semibold text-[var(--text)]">{r.name}</span>
                        <span className="text-[9px] text-[var(--text-muted)] ml-1">{/KOSDAQ/i.test(r.market) ? 'KQ' : 'KS'}</span>
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
                      <td className={`px-2 py-2 text-right tabular-nums ${pctColor(r.metrics.cOpGrowth)}`}>{pctCell(r.metrics.cOpGrowth)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">{r.metrics.forwardPer?.toFixed(1) ?? '-'}</td>
                      <td className={`px-2 py-2 text-right tabular-nums font-semibold ${r.metrics.peg != null && r.metrics.peg < 1 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>{r.metrics.peg?.toFixed(2) ?? '-'}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text)]">{r.metrics.roe != null ? `${r.metrics.roe.toFixed(1)}%` : '-'}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmtCap(r.marketCap)}</td>
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/stock-analysis?ticker=${r.code}`}
                          className="text-[10px] text-sky-400 hover:underline whitespace-nowrap">정밀 분석 →</Link>
                      </td>
                    </tr>
                    {expanded === r.code && (
                      <tr key={`${r.code}-detail`} className="border-b border-[var(--border)]/50 bg-white/[0.02]">
                        <td colSpan={12} className="px-4 py-3">
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
                            <span>현재가 {r.close.toLocaleString()}원 ({r.changeRate > 0 ? '+' : ''}{r.changeRate}%)</span>
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
                  </>
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
