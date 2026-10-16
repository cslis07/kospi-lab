'use client';

/** CPI 격차 (vs 공식 BLS 전지표) — gaptable.json. 게이지·나우캐스트가 공식 발표치와 지금 얼마나 벌어져 있나(지표별). */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { pct, signPp, type GapTable } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

export default function GapPage() {
  const { data: g } = useSWR<GapTable>('/api/nf/gaptable.json', fetcher, SWR_OPT);
  const rows = g?.rows ?? [];

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">CPI 격차 (vs 공식 BLS)</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        실시간 게이지가 미 노동통계국(BLS)의 <b className="text-[var(--text)]">마지막 공식 발표치와 지금 얼마나 벌어져 있는지</b>를 지표별로 봅니다.
        격차가 <span className="text-red-400 font-semibold">+</span>면 게이지가 공식보다 높다는 뜻(발표 전 선반영일 수 있음). <b className="text-[var(--text)]">매매 신호가 아닙니다.</b>
      </p>

      {g?.locked && <div className="mb-4"><UnlockGate /></div>}

      {rows.length > 0 && !g?.locked && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
          {/* 헤더 */}
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr] gap-1 px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] border-b border-[var(--border)] bg-[var(--surface-2)]/40">
            <span>지표</span>
            <span className="text-right">게이지</span>
            <span className="text-right">공식</span>
            <span className="text-right">격차</span>
          </div>
          <ul className="divide-y divide-[var(--border)]/60">
            {rows.map((r) => (
              <li key={r.key} className="px-3 py-2.5">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr] gap-1 items-baseline tabular-nums">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-[var(--text)] truncate">{r.label}</span>
                    <span className={`inline-block text-[9px] font-semibold px-1 py-0.5 rounded mt-0.5 ${r.fmc_kind === 'forecast' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                      {r.fmc_kind === 'forecast' ? '나우캐스트 예측' : '실시간 측정'}
                    </span>
                  </span>
                  <span className={`text-right text-[13px] font-bold ${sign(r.fmc_yoy)}`}>{pct(r.fmc_yoy, 2)}</span>
                  <span className="text-right text-[13px] font-bold text-[var(--text)]">{r.official_yoy != null ? pct(r.official_yoy, 2) : '—'}</span>
                  <span className={`text-right text-[13px] font-bold ${sign(r.gap_pp)}`}>{r.gap_pp != null ? signPp(r.gap_pp, 2) : '—'}</span>
                </div>
                {(r.official_month || r.fmc_source) && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">
                    {r.fmc_source && <>출처: {r.fmc_source}. </>}
                    {r.official_month && <>공식 {r.official_month} 발표{r.official_role ? ` (${r.official_role})` : ''}. </>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3 mb-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
        <b className="text-[var(--text)]">실시간 측정</b>은 그날의 게이지 읽기(매일 갱신), <b className="text-[var(--text)]">나우캐스트 예측</b>은 다음 발표분 추정치입니다.
        격차는 <b className="text-[var(--text)]">게이지 읽기 − 마지막 공식 발표치</b>로, 공식이 아직 안 나온 최근 달의 추정 수준을 보여줄 뿐 발표를 예언하지 않습니다.
      </div>

      {!g && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 공식 CPI/PCE는 BLS·BEA 발표치입니다.
      </p>
    </>
  );
}
