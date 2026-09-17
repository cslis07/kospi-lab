/**
 * 분석 데이터 결측 공시 배너.
 *
 * 왜: 분석 라우트의 소스 수집 함수들은 외부 API 실패를 삼키고 빈 값을 돌려준다.
 * 그러면 판정은 **결측 위에서** 계산되는데 화면엔 그 사실이 안 보인다(완성도 축4 잔여).
 * 이 컴포넌트가 "무엇이 빠졌고 판정이 그 위에서 나왔다"를 정직하게 알린다.
 *
 * - 전 소스 수집 성공 → 조용히 초록 한 줄(안심 신호, 과하지 않게)
 * - 일부 결측 → 앰버 배너 + 빠진 소스 칩(critical 은 빨강)
 */
export interface SourceStat {
  key: string;
  label: string;
  ok: boolean;
  /** 판정에 핵심적인 소스인가(빠지면 판정 신뢰도가 크게 낮아짐) */
  critical: boolean;
}

export default function SourceStatus({ sources }: { sources?: SourceStat[] }) {
  if (!sources || sources.length === 0) return null;
  const missing = sources.filter((s) => !s.ok);

  if (missing.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-emerald-500 dark:text-emerald-400">
        <span aria-hidden>✓</span> 데이터 {sources.length}개 소스 모두 수집됨
      </p>
    );
  }

  const hasCritical = missing.some((s) => s.critical);
  return (
    <div className={`rounded-xl border p-3 text-xs ${hasCritical
      ? 'border-red-500/40 bg-red-500/5'
      : 'border-amber-500/40 bg-amber-500/5'}`}>
      <p className={`font-semibold ${hasCritical ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
        ⚠ 일부 데이터 결측 — 아래 판정은 <b>남은 데이터로만</b> 계산됐습니다
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {missing.map((s) => (
          <span key={s.key}
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${s.critical
              ? 'border-red-500/40 text-red-500 dark:text-red-400'
              : 'border-amber-500/40 text-amber-600 dark:text-amber-400'}`}
            title={s.critical ? '판정에 핵심적인 소스 — 신뢰도가 크게 낮아집니다' : '보조 소스 — 참고치가 비어 있습니다'}>
            {s.label}{s.critical ? ' (핵심)' : ''}
          </span>
        ))}
      </div>
      {hasCritical && (
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
          핵심 소스가 비어 있으면 점수·판정을 신뢰하지 마세요. 잠시 후 다시 시도하면 복구될 수 있습니다.
        </p>
      )}
    </div>
  );
}
