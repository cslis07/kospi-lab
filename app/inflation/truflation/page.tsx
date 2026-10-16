'use client';

/** Nowflation vs Truflation — 두 민간 실시간 물가 추정치를 일별로 겹쳐 본다(compare_daily.gauge·truflation + truflation.json). */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import InflationChartLazy from '@/components/InflationChartLazy';
import { truflationTrendRows, pct, signPp, type CompareDaily } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

interface Truf { asof?: string; truflation?: { yoy_today?: number; date?: string; dod_pp?: number } }

/** compare_daily.gauge 의 마지막 유효값 */
function latestGauge(cd?: CompareDaily | null): number | null {
  const g = cd?.series?.gauge?.data ?? [];
  for (let i = g.length - 1; i >= 0; i--) { const v = g[i]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return null;
}

export default function TruflationPage() {
  const { data: cd } = useSWR<CompareDaily>('/api/nf/compare_daily.json', fetcher, SWR_OPT);
  const { data: tf } = useSWR<Truf>('/api/nf/truflation.json', fetcher, SWR_OPT);
  const locked = cd?.locked;

  const gauge = latestGauge(cd);
  const truf = tf?.truflation?.yoy_today ?? null;
  const spread = gauge != null && truf != null ? gauge - truf : null;
  const rows = truflationTrendRows(cd, 24);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">Nowflation vs Truflation</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        둘 다 공식 CPI 발표를 기다리지 않고 매일 갱신하는 <b className="text-[var(--text)]">민간 실시간 물가 추정치</b>입니다. 방법론·바스켓·범위가 달라 수치가 갈릴 수 있어,
        같은 기간을 겹쳐 흐름을 비교합니다. <b className="text-[var(--text)]">예측·매매 신호가 아닙니다.</b>
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && cd && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">Nowflation 게이지</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(gauge)}`}>{pct(gauge)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">YoY · 최신</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">Truflation</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(truf)}`}>{pct(truf)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">YoY · {tf?.truflation?.date ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">격차(게이지−Truf)</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(spread)}`}>{signPp(spread)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{spread == null ? '' : spread >= 0 ? '게이지가 높음' : '게이지가 낮음'}</p>
              </div>
            </div>
            {tf?.truflation?.dod_pp != null && (
              <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-3 border-t border-[var(--border)] tabular-nums">Truflation 전일 <b className={sign(tf.truflation.dod_pp)}>{signPp(tf.truflation.dod_pp)}</b></p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">일별 추이 (최근 24개월)</h2>
            <InflationChartLazy kind="trend" rows={rows} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
              YoY(%) · <span style={{ color: '#1c6cff' }}>■</span> Nowflation 게이지 vs <span style={{ color: '#10b981' }}>■</span> Truflation.
              두 추정치 모두 공식 발표치가 아니며, 방향이 같아도 매매 우위를 보장하지 않습니다.
            </p>
          </div>
        </>
      )}

      {!cd && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). Truflation 수치는 Nowflation 비교 데이터에 포함된 값입니다.
      </p>
    </>
  );
}
