'use client';

/**
 * 계절성 — 코스피·코스닥·S&P500·나스닥·비트코인의 월별 수익률(최대 20년).
 * 위: 월별 평균·중앙값·상승 확률 막대(이번 달 강조) · 아래: 연도 × 월 히트맵 표.
 * 참고: TradingView Seasonals · 인베스팅 월별 수익률. 과거 통계일 뿐 다음 달 예측이 아니다(표본 연수 함께 표시).
 */
import { useState } from 'react';
import useSWR from 'swr';
import Segmented from '@/components/ui/Segmented';
import type { Seasonality } from '@/lib/seasonality';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
type Asset = 'kospi' | 'kosdaq' | 'sp500' | 'nasdaq' | 'btc';
const ASSETS: readonly (readonly [Asset, string])[] = [['kospi', '코스피'], ['kosdaq', '코스닥'], ['sp500', 'S&P 500'], ['nasdaq', '나스닥'], ['btc', '비트코인']];
type Stat = 'avg' | 'median' | 'upPct';
const STATS: readonly (readonly [Stat, string])[] = [['avg', '평균'], ['median', '중앙값'], ['upPct', '상승 확률']];
const M = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const sp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;

/** 셀 배경 — 상승 빨강·하락 파랑, 포화 기준은 자산 변동성에 맞춰(비트코인 25%, 그 외 8%) */
function cell(v: number | null, cap: number) {
  if (v == null) return 'transparent';
  const t = Math.min(1, Math.abs(v) / cap);
  return `color-mix(in srgb, ${v > 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(12 + t * 68)}%, var(--surface))`;
}

export default function SeasonalityPage() {
  const [asset, setAsset] = useState<Asset>('kospi');
  const [stat, setStat] = useState<Stat>('avg');
  const { data, error } = useSWR<Seasonality & { name: string; error?: string }>(`/api/seasonality?asset=${asset}`, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const [nowM] = useState(() => new Date().getMonth() + 1);
  const cap = asset === 'btc' ? 25 : 8;
  const stats = data?.stats ?? [];
  const vals = stats.map((s) => (stat === 'upPct' ? (s.upPct == null ? null : s.upPct - 50) : s[stat]));
  const max = Math.max(1, ...vals.map((v) => Math.abs(v ?? 0)));
  const yrs = data?.years ?? [];
  const nYears = Math.max(0, ...stats.map((s) => s.n));

  return (
    <div className="max-w-6xl mx-auto pb-6">
      <div className="fin-card p-4 lg:p-5 mb-3">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <div className="overflow-x-auto max-w-full" style={{ scrollbarWidth: 'none' }}><Segmented label="자산" value={asset} options={ASSETS} onChange={setAsset} /></div>
          <div className="sm:ml-auto"><Segmented label="통계" value={stat} options={STATS} onChange={setStat} /></div>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mt-2">
          {data?.name ?? ''} 월별 {stat === 'avg' ? '평균 수익률' : stat === 'median' ? '수익률 중앙값' : '상승 확률(50% 기준선 위·아래)'} · 최근 {nYears}년 · 진행 중인 달은 통계에서 제외
        </p>

        {error || data?.error ? <p className="py-10 text-center text-[13px] text-[var(--text-muted)]">불러오지 못했습니다. 잠시 후 다시 시도하세요.</p> : !data ? <div className="skeleton mt-3" style={{ height: 200 }} /> : (
          <div className="mt-4 flex items-stretch gap-0.5 sm:gap-2" role="img" aria-label={stats.map((s, i) => `${M[i]} ${vals[i] == null ? '없음' : stat === 'upPct' ? `${s.upPct}%` : sp(vals[i]!)}`).join(', ')}>
            {stats.map((s, i) => {
              const v = vals[i];
              const h = v == null ? 0 : (Math.abs(v) / max) * 100;
              const on = s.month === nowM;
              return (
                <div key={s.month} className={`flex-1 min-w-0 flex flex-col items-center rounded-lg py-1 ${on ? 'bg-[var(--accent-soft)]' : ''}`}>
                  {/* 폰은 12칸이 좁아 % 기호를 빼고 작게(단위는 위 설명줄에) */}
                  <span className="text-[8.5px] sm:text-[11px] tabular-nums font-semibold whitespace-nowrap tracking-tighter sm:tracking-normal" style={{ color: v == null ? 'var(--faint)' : v >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {v == null ? '—' : stat === 'upPct' ? <>{s.upPct}<span className="hidden sm:inline">%</span></> : <>{sp(v).replace('%', '')}<span className="hidden sm:inline">%</span></>}
                  </span>
                  <div className="relative w-full" style={{ height: 150 }}>
                    <span className="absolute left-0 right-0 top-1/2 border-t border-[var(--line)]" />
                    {v != null && <span className="absolute left-1/2 -translate-x-1/2 w-[62%] max-w-[30px] rounded-[3px]" style={{ height: `${h / 2}%`, ...(v >= 0 ? { bottom: '50%' } : { top: '50%' }), background: v >= 0 ? 'var(--up)' : 'var(--down)', opacity: on ? 1 : 0.8 }} />}
                  </div>
                  <span className={`text-[10px] sm:text-[12px] whitespace-nowrap ${on ? 'font-bold text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}`}>{M[i]}</span>
                  <span className="text-[8.5px] sm:text-[9.5px] text-[var(--faint)] tabular-nums whitespace-nowrap">{s.n}년</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[10.5px] text-[var(--faint)] mt-3">과거 월별 통계이며 다음 달 방향 예측이나 매매 신호가 아닙니다. 연수가 적으면(특히 비트코인) 우연의 폭이 큽니다. 출처: Yahoo Finance 월봉(배당 조정 종가).</p>
      </div>

      {yrs.length > 0 && (
        <div className="fin-card p-3 lg:p-4">
          <p className="text-[13px] font-bold text-[var(--ink)] mb-2 px-1">연도별 월 수익률(%)</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[11.5px] tabular-nums border-separate" style={{ borderSpacing: 2 }}>
              <thead><tr className="text-[var(--text-muted)]"><th className="text-left font-medium px-1">연도</th>{M.map((m, i) => <th key={m} className={`font-medium ${i + 1 === nowM ? 'text-[var(--accent-ink)]' : ''}`}>{m}</th>)}<th className="font-semibold">연간</th></tr></thead>
              <tbody>
                {yrs.map((y) => (
                  <tr key={y.year}>
                    <td className="px-1 text-[var(--text-muted)]">{y.year}</td>
                    {y.months.map((v, i) => (
                      <td key={i} className="text-center rounded-[4px] py-1 text-[var(--ink)]" style={{ background: cell(v, cap) }}>{v == null ? '' : v.toFixed(1)}</td>
                    ))}
                    <td className="text-center font-semibold rounded-[4px]" style={{ background: cell(y.total, cap * 3), color: 'var(--ink)' }}>{y.total == null ? '' : sp(y.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
