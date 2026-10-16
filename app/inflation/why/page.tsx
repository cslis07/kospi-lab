'use client';

/** 오늘 왜 움직였나 — latestSnapshot.json. 게이지 최신값·전일/전주/전월·연율 페이스·한 달 기여 품목. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { snapDrivers, gapExplainedParts, categorize, pct, signPp, type LatestSnapshot, type GapExplained, type Cat } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

const CAT_STYLE: Record<Cat, string> = {
  식품: 'bg-amber-500/15 text-amber-400',
  주거: 'bg-violet-500/15 text-violet-400',
  연료: 'bg-sky-500/15 text-sky-400',
  기타: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
};

export default function WhyPage() {
  const { data: s } = useSWR<LatestSnapshot>('/api/nf/latestSnapshot.json', fetcher, SWR_OPT);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">오늘 왜 움직였나</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        실시간 게이지의 <b className="text-[var(--text)]">최신 수치와 움직인 이유</b>를 하루 단위로 봅니다. 전일·전주·전월 변화, 연율로 환산한 최근 흐름(페이스),
        지난 한 달 동안 게이지를 밀어올리거나 끌어내린 품목까지. <b className="text-[var(--text)]">예측·매매 신호가 아닙니다.</b>
      </p>

      {s?.locked && <div className="mb-4"><UnlockGate /></div>}

      {s && !s.locked && (
        <>
          {/* 헤더 — 게이지 최신값 + 변화 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <p className="text-[11px] text-[var(--text-muted)]">CPI 게이지(나우캐스트) · YoY</p>
            <p className={`text-3xl font-extrabold tabular-nums leading-tight ${sign(s.gauge_yoy_pct)}`}>{pct(s.gauge_yoy_pct)}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.gauge_date ?? s.asof} 기준</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[var(--border)] text-[11px] tabular-nums">
              <span className="text-[var(--text-muted)]">전일 <b className={sign(s.gauge_dod_pp)}>{signPp(s.gauge_dod_pp)}</b></span>
              <span className="text-[var(--text-muted)]">전주 <b className={sign(s.gauge_wow_pp)}>{signPp(s.gauge_wow_pp)}</b></span>
              <span className="text-[var(--text-muted)]">전월 <b className={sign(s.gauge_mom_pp)}>{signPp(s.gauge_mom_pp)}</b></span>
            </div>
            {typeof s.gauge_gap_explained === 'string' && s.gauge_gap_explained && (
              <p className="text-[12px] text-[var(--text)] leading-relaxed mt-3 pt-3 border-t border-[var(--border)]">{s.gauge_gap_explained}</p>
            )}
            {s.gauge_changes_note && <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">{s.gauge_changes_note}</p>}
          </div>

          {/* 페이스(연율) */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">흐름(연율 환산)</h2>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="최근 1개월·연율" value={pct(s.pace_1m_ann_pct)} cls={sign(s.pace_1m_ann_pct)} />
              <Stat label="최근 3개월·연율" value={pct(s.pace_3m_ann_pct)} cls={sign(s.pace_3m_ann_pct)} />
              <Stat label="YoY 기준" value={pct(s.pace_basis_yoy_pct ?? s.gauge_yoy_pct)} />
            </div>
            {s.pace_1m_change_pct != null && s.pace_1m_window && (
              <p className="text-[11px] text-[var(--text-muted)] mt-2 tabular-nums">
                한 달 변화({s.pace_1m_window.from}→{s.pace_1m_window.to}) <b className={sign(s.pace_1m_change_pct)}>{s.pace_1m_change_pct >= 0 ? '+' : ''}{s.pace_1m_change_pct.toFixed(2)}%</b>
              </p>
            )}
            {s.pace_basis && <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">기준: {s.pace_basis}</p>}
          </div>

          {/* 이달 공식 대비 격차 분해 */}
          {typeof s.gauge_gap_explained === 'object' && s.gauge_gap_explained && (
            <GapExplainedCard g={s.gauge_gap_explained} />
          )}

          {/* 한 달 기여 품목 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">지난 한 달, 무엇이 움직였나</h2>
            <DriverBars s={s} />
          </div>

          {s.live_coverage_pct != null && (
            <p className="text-[11px] text-[var(--text-muted)] mb-2">실시간 반영 범위 약 {s.live_coverage_pct.toFixed(0)}% (나머지는 직전 공식 발표치로 보간).</p>
          )}
        </>
      )}

      {!s && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 모델 추정치이며 예측·투자 권유가 아닙니다.
      </p>
    </>
  );
}

function GapExplainedCard({ g }: { g: GapExplained }) {
  const parts = gapExplainedParts(g);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">공식 대비 격차, 어디서</h2>
        {g.month_label && <span className="text-[10px] text-[var(--text-muted)]">{g.month_label}</span>}
      </div>
      {g.gap_pp != null && (
        <p className="text-[12px] text-[var(--text-muted)] mb-2 tabular-nums">
          이달 게이지−공식 격차 <b className={sign(g.gap_pp)}>{signPp(g.gap_pp)}</b>
          {g.total_pp != null && <> · 주요 품목 설명분 <b className={sign(g.total_pp)}>{signPp(g.total_pp)}</b></>}
        </p>
      )}
      {parts && parts.length > 0 ? (
        <ul className="space-y-1">
          {parts.slice(0, 6).map((p) => (
            <li key={p.key} className="flex items-center justify-between text-[11px] tabular-nums">
              <span className="text-[var(--text)] truncate pr-2">{p.label}</span>
              <span className="shrink-0">
                {p.ours_pct != null && <span className="text-[var(--text-muted)]">게이지 {p.ours_pct.toFixed(1)}% · 공식 {p.official_pct != null ? `${p.official_pct.toFixed(1)}%` : '—'} · </span>}
                <b className={sign(p.pp)}>{signPp(p.pp)}</b>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[11px] text-[var(--text-muted)]">분해 데이터가 없습니다.</p>}
      <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">각 품목이 이달 격차(게이지−공식)에 더한 몫(%p). 매매 신호가 아닙니다.</p>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className={`text-base font-bold tabular-nums ${cls ?? 'text-[var(--text)]'}`}>{value}</p>
    </div>
  );
}

function DriverBars({ s }: { s: LatestSnapshot }) {
  const ds = snapDrivers(s);
  if (!ds.length) return <p className="text-[11px] text-[var(--text-muted)]">기여 품목 데이터가 없습니다.</p>;
  const maxAbs = Math.max(...ds.map((d) => Math.abs(d.contribution_pp)), 0.01);
  return (
    <ul className="space-y-1.5">
      {ds.map((d) => {
        const cat = categorize(d.component);
        const w = Math.round((Math.abs(d.contribution_pp) / maxAbs) * 100);
        const up = d.contribution_pp >= 0;
        return (
          <li key={d.component}>
            <div className="flex items-center justify-between gap-2 mb-0.5 text-[11px]">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded ${CAT_STYLE[cat]}`}>{cat}</span>
                <span className="text-[var(--text)] truncate">{d.label}</span>
                {d.live ? <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400">실시간</span>
                  : d.new_print && <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">{d.new_print.to_month} 발표</span>}
              </span>
              <span className="shrink-0 tabular-nums"><b className={sign(d.contribution_pp)}>{d.contribution_pp >= 0 ? '+' : ''}{d.contribution_pp.toFixed(3)}%p</b></span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div className={`h-full rounded-full ${up ? 'bg-red-400/70' : 'bg-blue-400/70'}`} style={{ width: `${w}%` }} />
            </div>
          </li>
        );
      })}
      <p className="text-[10px] text-[var(--text-muted)] pt-1 leading-relaxed">막대 = 지난 한 달 게이지에 더한 기여(%p). 빨강=상승 기여, 파랑=하락 기여. <b className="text-[var(--text)]">실시간</b>은 매일 갱신, 나머지는 직전 공식 발표 반영.</p>
    </ul>
  );
}
