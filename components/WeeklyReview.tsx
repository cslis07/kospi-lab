'use client';

/**
 * 주간 리뷰 — 이번 주(월요일 기준) 성적을 지난 주와 대조하고, 규율 지표와 최다 실수를 한 장에.
 * 기록→개선 루프의 요약. 방향이 아니라 "내가 계획대로 쳤는가"를 본다.
 * R 은 계획(손절·사이징)을 기록한 매매에서만 — 없는 걸 0 으로 세지 않는다.
 */
import { useMemo } from 'react';

interface Row { ts: number; result: 'open' | 'win' | 'loss' | 'even'; resultR: number | null }

const DAY = 86_400_000;
function weekStart(t: number) {
  const x = new Date(t);
  const dow = (x.getDay() + 6) % 7;       // 월=0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - dow);
  return x.getTime();
}

interface WeekAgg {
  total: number; open: number; closed: number;
  wins: number; losses: number;
  winRate: number | null; avgR: number | null;
  rCount: number; noRClosed: number;         // 청산인데 R 없음(계획 없이 친 매매)
  plannedRate: number | null;                // 청산 중 계획(R) 비율
  worstR: number | null;
}
function agg(rows: Row[]): WeekAgg {
  const closed = rows.filter((r) => r.result !== 'open');
  const wins = closed.filter((r) => r.result === 'win').length;
  const losses = closed.filter((r) => r.result === 'loss').length;
  const decided = wins + losses;
  const rVals = closed.map((r) => r.resultR).filter((x): x is number => x != null);
  return {
    total: rows.length, open: rows.length - closed.length, closed: closed.length,
    wins, losses,
    winRate: decided ? (wins / decided) * 100 : null,
    avgR: rVals.length ? rVals.reduce((a, v) => a + v, 0) / rVals.length : null,
    rCount: rVals.length,
    noRClosed: closed.length - rVals.length,
    plannedRate: closed.length ? (rVals.length / closed.length) * 100 : null,
    worstR: rVals.length ? Math.min(...rVals) : null,
  };
}

const fpct = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`);
const fR = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);

/** 이번 주 - 지난 주 델타 표시 */
function Delta({ cur, prev, kind }: { cur: number | null; prev: number | null; kind: 'pct' | 'r' }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < (kind === 'r' ? 0.05 : 0.5)) return <span className="text-[10px] text-[var(--text-muted)]">±0</span>;
  const up = d > 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? 'text-emerald-500' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {kind === 'r' ? `${Math.abs(d).toFixed(2)}R` : `${Math.abs(d).toFixed(0)}%`}
    </span>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-center">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="text-base font-bold text-[var(--text)] tabular-nums leading-tight">{value}</p>
      {delta && <p className="mt-0.5">{delta}</p>}
    </div>
  );
}

export default function WeeklyReview({ rows }: { rows: Row[] }) {
  const { cur, prev, mistakes, verdict } = useMemo(() => {
    const now = Date.now();
    const tw = weekStart(now);
    const lw = tw - 7 * DAY;
    const cur = agg(rows.filter((r) => r.ts >= tw));
    const prev = agg(rows.filter((r) => r.ts >= lw && r.ts < tw));

    // 최다 실수 — 심각도 순
    const mistakes: string[] = [];
    if (cur.noRClosed > 0)
      mistakes.push(`계획(손절·사이징) 없이 친 매매 ${cur.noRClosed}건 — 1R을 몰라 성적이 흐려집니다.`);
    if (cur.open >= 3)
      mistakes.push(`미청산 방치 ${cur.open}건 — 결과를 안 채우면 실측이 안 됩니다.`);
    if (cur.worstR != null && cur.worstR <= -1.5)
      mistakes.push(`손절 초과 손실 발생(최악 ${cur.worstR.toFixed(1)}R) — 계획한 1R보다 크게 잃었습니다.`);
    if (cur.avgR != null && cur.avgR < 0 && cur.rCount >= 3)
      mistakes.push(`이번 주 기대값 ${fR(cur.avgR)} — 계획대로 쳤어도 마이너스입니다. 진입 빈도를 줄이세요.`);

    // 한 줄 총평
    let verdict = '';
    if (cur.total === 0) verdict = '이번 주 기록이 없습니다. 매매했다면 계획과 결과를 남겨 두세요.';
    else if (cur.plannedRate != null && cur.plannedRate >= 80 && (cur.avgR ?? 0) >= 0)
      verdict = '규율 양호 — 대부분 계획대로 쳤고 기대값도 플러스입니다. 지금 방식을 유지하세요.';
    else if (cur.plannedRate != null && cur.plannedRate < 50)
      verdict = '계획 없이 친 매매가 절반 이상입니다. 진입 전 플래너로 손절·사이징을 먼저 정하세요.';
    else if ((cur.avgR ?? 0) < 0)
      verdict = '계획은 지켰지만 기대값이 마이너스입니다. 잃는 게 실력이 아니라 빈도일 수 있어요 — 표본을 늘리기 전 매매 수를 줄이세요.';
    else verdict = '무난한 한 주입니다. 계획 준수율과 기대값을 계속 지켜보세요.';

    return { cur, prev, mistakes, verdict };
  }, [rows]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">이번 주 리뷰</h2>
        <span className="text-[10px] text-[var(--text-muted)]">월요일 기준 · 지난 주 대비</span>
        <span className="flex-1" />
        <span className="text-[10px] text-[var(--text-muted)]">마감 {cur.closed} · 미청산 {cur.open}</span>
      </div>

      {cur.total === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-4 text-center">{verdict}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <Metric label="마감" value={`${cur.closed}건`} />
            <Metric label="승률" value={fpct(cur.winRate)} delta={<Delta cur={cur.winRate} prev={prev.winRate} kind="pct" />} />
            <Metric label="기대값" value={fR(cur.avgR)} delta={<Delta cur={cur.avgR} prev={prev.avgR} kind="r" />} />
            <Metric label="계획 준수율" value={fpct(cur.plannedRate)} delta={<Delta cur={cur.plannedRate} prev={prev.plannedRate} kind="pct" />} />
          </div>

          {mistakes.length > 0 && (
            <div className="rounded-xl bg-[var(--surface-2)] p-3 mb-3">
              <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wide">이번 주 최다 실수</p>
              <ul className="space-y-1">
                {mistakes.slice(0, 3).map((m, i) => (
                  <li key={i} className="text-[11px] text-[var(--text)] flex gap-1.5">
                    <span className="text-amber-600 shrink-0">•</span><span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-[var(--text)] leading-relaxed">
            <strong className="text-[var(--accent)]">총평 </strong>{verdict}
          </p>
        </>
      )}
    </div>
  );
}
