'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR from 'swr';
import { computeReaction, type PricePoint, type ReactionStat, type ReactionResult } from '@/lib/releaseReaction';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Row { date: string; ref: string | null; time: string | null; actual: string | null; forecast: string | null; previous: string | null }
interface IndexItem { id: string; name: string; url: string | null; count: number; newest: string | null; oldest: string | null }
interface IndexFile { updatedAt: string; items: IndexItem[] }
interface DataFile { id: string; name: string; url: string; rows: Row[] }

const num = (s: string | null) => {
  if (!s) return null;
  const v = parseFloat(s.replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? v : null;
};
// 인베스팅 색: 결과>예측 → 파랑 / 결과<예측 → 빨강 (이미지와 동일)
function actualClass(actual: string | null, forecast: string | null) {
  const a = num(actual), f = num(forecast);
  if (a == null) return 'text-[var(--text-muted)]';
  if (f == null) return 'text-[var(--text)]';
  if (a > f) return 'text-blue-400';
  if (a < f) return 'text-red-400';
  return 'text-[var(--text)]';
}

const rxSign = (v: number) => (v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text-muted)]');
// 반응 통계 셀: 평균 변동%·상승 비율(표본)
function RxCell({ s }: { s: ReactionStat }) {
  if (!s || s.n === 0) return <span className="text-[var(--text-muted)]">—</span>;
  return (
    <span className="tabular-nums">
      <b className={rxSign(s.avgPct)}>{s.avgPct >= 0 ? '+' : ''}{s.avgPct.toFixed(2)}%</b>
      <span className="text-[var(--text-muted)]"> · 상승 {s.posRate.toFixed(0)}% <span className={s.n < 10 ? 'text-amber-400' : ''}>({s.n})</span></span>
    </span>
  );
}

export default function ReleasesPage() {
  const { data: idx } = useSWR<IndexFile>('/data/investing/index.json', fetcher);
  const items = idx?.items ?? [];
  const [sel, setSel] = useState<string>('');
  // ?id= 딥링크(초기 1회) — /macro 등에서 특정 지표로 바로 진입
  useEffect(() => {
    try { const q = new URLSearchParams(window.location.search).get('id'); if (q) setSel(q); } catch {}
  }, []);
  const curId = sel || items[0]?.id || '';
  const { data: file } = useSWR<DataFile>(curId ? `/data/investing/${curId}.json` : null, fetcher);
  const meta = items.find((x) => x.id === curId);

  // 서프라이즈 → 다음 거래일 반응 (BTC·S&P는 발표 당일, 코스피는 다음 세션)
  const { data: daily } = useSWR<{ btc: PricePoint[]; sp: PricePoint[]; nasdaq: PricePoint[]; kospi: PricePoint[] }>('/api/macro/daily', fetcher);
  const reaction = useMemo(() => {
    if (!file) return null;
    const rel = file.rows.map((r) => ({ date: r.date, actual: r.actual, forecast: r.forecast }));
    const scored = rel.filter((r) => r.actual && r.forecast).length;
    if (scored < 5) return { tooFew: scored };
    if (!daily) return { loading: true };
    return {
      btc: computeReaction(rel, daily.btc, 0),
      sp: computeReaction(rel, daily.sp, 0),
      kospi: computeReaction(rel, daily.kospi, 1),
    };
  }, [file, daily]);

  const [year, setYear] = useState<string>('전체');
  const years = useMemo(() => {
    const ys = new Set<string>();
    (file?.rows ?? []).forEach((r) => ys.add(r.date.slice(0, 4)));
    return ['전체', ...[...ys].sort((a, b) => b.localeCompare(a))];
  }, [file]);
  const rows = useMemo(() => {
    const all = file?.rows ?? [];
    return year === '전체' ? all : all.filter((r) => r.date.startsWith(year));
  }, [file, year]);

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">경제지표 발표 이력</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        인베스팅닷컴의 지표별 발표 내역(<b className="text-[var(--text)]">결과·예측·이전</b>)을 2021년 1월부터 모았습니다.
        예측(컨센서스)까지 포함한 스냅샷이며, 자동 갱신되지 않습니다(필요 시 재수집).
      </p>

      {/* 지표 선택 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={curId} onChange={(e) => { setSel(e.target.value); setYear('전체'); }}
          className="flex-1 min-w-[200px] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]">
          {items.length === 0 && <option>불러오는 중…</option>}
          {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.count})</option>)}
        </select>
        <span className="text-[11px] text-[var(--text-muted)]">{items.length}개 지표{idx ? ` · 수집 ${idx.updatedAt}` : ''}</span>
        <Link href="/macro" className="text-[11px] font-semibold text-[var(--accent-ink)] shrink-0">FRED 지표(/macro) →</Link>
      </div>

      {meta && file ? (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-[var(--text)]">{file.name}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{meta.oldest} ~ {meta.newest} · {meta.count}건</p>
              </div>
              {file.url && (
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[var(--accent-ink)] shrink-0">인베스팅 원본 ↗</a>
              )}
            </div>
          </div>

          {/* 연도 필터 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${year === y ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                {y}{y !== '전체' ? '년' : ''}
              </button>
            ))}
          </div>

          {/* 발표 내역 표 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[var(--bg)] border-b border-[var(--border)]">
                    <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-semibold">발표일</th>
                    <th className="text-left px-2 py-2.5 text-[var(--text-muted)] font-semibold">시간</th>
                    <th className="text-right px-2 py-2.5 text-[var(--text-muted)] font-semibold">결과</th>
                    <th className="text-right px-2 py-2.5 text-[var(--text-muted)] font-semibold">예측</th>
                    <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-semibold">이전</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.date + i} className={`border-b border-[var(--border)]/50 ${!r.actual ? 'bg-[var(--surface-2)]/40' : ''}`}>
                      <td className="px-3 py-2 font-semibold text-[var(--text)] whitespace-nowrap">{r.date}{r.ref ? <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">({r.ref})</span> : ''}</td>
                      <td className="px-2 py-2 text-[var(--text-muted)] whitespace-nowrap">{r.time ?? '-'}</td>
                      <td className={`px-2 py-2 text-right font-bold tabular-nums ${actualClass(r.actual, r.forecast)}`}>{r.actual || (r.actual === '' ? '-' : '발표 전')}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.forecast || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{r.previous || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2">결과 색: <span className="text-blue-400 font-semibold">예측 상회</span> · <span className="text-red-400 font-semibold">예측 하회</span> (인베스팅 표기와 동일). 표시행 {rows.length}건.</p>

          {/* 서프라이즈 → 다음 거래일 시장 반응 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mt-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">서프라이즈 → 다음 거래일 반응</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5 mb-3">결과가 <b className="text-[var(--text)]">예측을 벗어난 날</b>, 그 다음 시장이 어떻게 움직였나(과거 평균). 美 지표라 S&P·BTC는 발표 당일, 코스피는 다음 거래일 기준.</p>
            {reaction && 'tooFew' in reaction ? (
              <p className="text-[12px] text-[var(--text-muted)]">이 지표는 예측(컨센서스) 있는 발표가 {reaction.tooFew}건뿐이라 반응 분석을 생략합니다(국채 입찰·ADP 등은 컨센서스가 없음).</p>
            ) : reaction && 'loading' in reaction ? (
              <p className="text-[12px] text-[var(--text-muted)]">시세 불러오는 중…</p>
            ) : reaction ? (
              <>
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--bg)] border-b border-[var(--border)]">
                        <th className="text-left px-3 py-2 text-[var(--text-muted)] font-semibold">자산</th>
                        <th className="text-right px-2 py-2 text-[var(--text-muted)] font-semibold">예측 상회일</th>
                        <th className="text-right px-2 py-2 text-[var(--text-muted)] font-semibold">예측 하회일</th>
                        <th className="text-right px-3 py-2 text-[var(--text-muted)] font-semibold">대조군(전체)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([{ k: 'btc', label: '비트코인' }, { k: 'sp', label: 'S&P500' }, { k: 'kospi', label: '코스피' }] as const).map((a) => {
                        const R = (reaction as unknown as Record<string, ReactionResult>)[a.k];
                        return (
                          <tr key={a.k} className="border-b border-[var(--border)]/50">
                            <td className="px-3 py-2 font-semibold text-[var(--text)] whitespace-nowrap">{a.label}</td>
                            <td className="px-2 py-2 text-right"><RxCell s={R.up} /></td>
                            <td className="px-2 py-2 text-right"><RxCell s={R.down} /></td>
                            <td className="px-3 py-2 text-right"><RxCell s={R.control} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  각 칸 = 평균 변동% · 상승 비율(표본 수). <b>상회/하회는 좋고 나쁨이 아니라 결과가 예측보다 높았나 낮았나</b>일 뿐입니다(지표마다 의미 다름).
                  변동폭이 대조군과 비슷하거나 표본(괄호)이 적으면(주황) <b className="text-amber-400">우연</b>입니다 — 이 앱의 측정에서 지표 서프라이즈로 다음날을 맞히는 우위는 거의 없었습니다. 상관이지 인과 아님.
                </p>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
          {items.length === 0 ? '지표 목록을 불러오는 중…' : '지표를 선택하세요.'}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: 인베스팅닷컴(수집 스냅샷). 결과·예측·이전은 발표 당시 값이며 사후 수정분이 반영되지 않을 수 있습니다. 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
