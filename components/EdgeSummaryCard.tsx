/**
 * 성적 요약 — 승률·손익비·Profit Factor·기대값·평균 익절/손절 (참고: Edgewonk·TraderSync).
 * 계산은 lib/journalAnalytics.edgeSummary(테스트 고정). 매매일지(거래소 실현손익 USDT)용.
 * 방향 예측이 아니라 "지금 내 매매 방식이 산수상 남는가"를 보는 카드.
 */
import type { EdgeSummary } from '@/lib/journalAnalytics';

const UP = 'var(--warn)';
const DOWN = 'var(--accent-ink)';

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[10.5px] text-[var(--text-muted)]">{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums leading-tight mt-0.5" style={{ color: color ?? 'var(--text)' }}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--faint)] mt-0.5 tabular-nums">{sub}</p>}
    </div>
  );
}

/** 해석 한 줄 — 숫자를 말로(매도·매수 권유 아님) */
function verdict(e: EdgeSummary): string {
  if (e.n < 5) return `표본 ${e.n}건 — 5건 이상 쌓여야 의미가 생깁니다.`;
  if (e.profitFactor == null) return '아직 손실 매매가 없어 Profit Factor를 계산할 수 없습니다.';
  const pf = e.profitFactor;
  const gap = e.winRate != null && e.breakevenWinRate != null ? e.winRate - e.breakevenWinRate : null;
  const gapTxt = gap != null ? ` 승률이 손익분기보다 ${Math.abs(gap).toFixed(0)}%p ${gap >= 0 ? '높습니다' : '낮습니다'}.` : '';
  if (pf >= 1.5) return `번 돈이 잃은 돈의 ${pf.toFixed(1)}배 — 지금 방식이 산수상 남습니다.${gapTxt}`;
  if (pf >= 1) return `번 돈이 잃은 돈보다 약간 많습니다(PF ${pf.toFixed(2)}). 수수료·실수 몇 번에 뒤집힐 수 있는 얇은 우위입니다.${gapTxt}`;
  return `잃은 돈이 번 돈보다 많습니다(PF ${pf.toFixed(2)}). 승률을 올리거나 손절을 줄이거나 익절을 늘려야 합니다.${gapTxt}`;
}

export default function EdgeSummaryCard({ e, unit, fmt, sub }: {
  e: EdgeSummary;
  unit: string;
  /** 부호 없는 금액 표기 */
  fmt: (n: number) => string;
  sub?: string;
}) {
  if (e.n === 0) return null;
  const pfColor = e.profitFactor == null ? undefined : e.profitFactor >= 1 ? UP : DOWN;
  const exColor = e.expectancy == null ? undefined : e.expectancy > 0 ? UP : e.expectancy < 0 ? DOWN : undefined;
  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">성적 요약</h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? `청산 ${e.n}건 · ${unit}`}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Tile label="승률" value={e.winRate != null ? `${e.winRate.toFixed(0)}%` : '—'} sub={`${e.wins}승 ${e.losses}패`} />
        <Tile label="손익비 (평균 익절 ÷ 손절)" value={e.payoff != null ? e.payoff.toFixed(2) : '—'}
          sub={e.breakevenWinRate != null ? `손익분기 승률 ${e.breakevenWinRate.toFixed(0)}%` : undefined} />
        <Tile label="Profit Factor" value={e.profitFactor != null ? e.profitFactor.toFixed(2) : e.wins ? '손실 없음' : '—'}
          sub="총이익 ÷ 총손실 · 1 초과 = 순이익" color={pfColor} />
        <Tile label="기대값 (건당 평균)" value={e.expectancy != null ? `${e.expectancy > 0 ? '+' : e.expectancy < 0 ? '−' : ''}${fmt(Math.abs(e.expectancy))}` : '—'}
          sub={unit} color={exColor} />
        <Tile label="평균 익절" value={e.avgWin != null ? `+${fmt(e.avgWin)}` : '—'} sub={`총 +${fmt(e.grossWin)}`} color={e.avgWin != null ? UP : undefined} />
        <Tile label="평균 손절" value={e.avgLoss != null ? `−${fmt(e.avgLoss)}` : '—'} sub={`총 −${fmt(e.grossLoss)}`} color={e.avgLoss != null ? DOWN : undefined} />
      </div>
      <p className="text-[11.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">{verdict(e)}</p>
      <p className="text-[10px] text-[var(--faint)] mt-1">손익비가 1보다 낮아도 승률이 손익분기 승률보다 높으면 남습니다. 둘을 함께 보세요. 과거 성적이며 앞으로를 보장하지 않습니다.</p>
    </section>
  );
}
