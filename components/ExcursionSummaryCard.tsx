'use client';

/**
 * 최근 매매 MAE/MFE 요약 — 이익 매매가 최대 순행 중 얼마나 챙겼나, 손실 매매 중 이익을 지켰다면 손실이 아니었을 매매가 몇 건인가
 * (참고: Edgewonk 'MAE/MFE analysis'). 매매마다 캔들이 필요해 **자동으로 일괄 요청하지 않는다** — 버튼으로 시작, 3건씩.
 * 결과는 이 기기에 저장(lib/excursionFetch)되므로 다음 방문엔 새 매매만 계산한다. 계산은 lib/tradeAutopsy(테스트 고정).
 */
import { useEffect, useMemo, useState } from 'react';
import { excursionSummary, type Excursion } from '@/lib/tradeAutopsy';
import { cachedExcursion, loadExcursions, type ExcursionTrade } from '@/lib/excursionFetch';

const MAX = 60; // 한 번에 계산할 최대 매매 수(최근 순)

export default function ExcursionSummaryCard({ trades }: { trades: ExcursionTrade[] }) {
  const recent = useMemo(() => [...trades].sort((a, b) => b.closeTs - a.closeTs).slice(0, MAX), [trades]);
  const [done, setDone] = useState<Map<string, Excursion>>(new Map());
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0); // 직전 실행에서 못 받은 건수(거래소 응답 제한 등)

  // 이 기기에 저장된 결과부터 채운다(요청 없음)
  useEffect(() => {
    const m = new Map<string, Excursion>();
    for (const t of recent) { const c = cachedExcursion(t.positionId); if (c) m.set(t.positionId, c); }
    setDone(m);
  }, [recent]);

  const missing = recent.filter((t) => !done.has(t.positionId));
  const run = async () => {
    setBusy({ done: 0, total: missing.length });
    const got = await loadExcursions(missing, (d, total) => setBusy({ done: d, total }));
    setFailed(missing.length - got.size);
    setDone((prev) => { const n = new Map(prev); got.forEach((v, k) => n.set(k, v)); return n; });
    setBusy(null);
  };

  const list = recent.filter((t) => done.has(t.positionId)).map((t) => ({ ex: done.get(t.positionId)!, net: t.netProfit }));
  const s = excursionSummary(list);
  if (!recent.length) return null;

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">MAE/MFE 요약</h2>
        <span className="text-[10px] text-[var(--text-muted)]">최근 {recent.length}건 중 {s.n}건 계산 · 보유 구간 캔들 기준</span>
      </div>

      {s.n > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <Tile label="이익 매매의 포착률" value={s.winnersCapturePct != null ? `${Math.round(s.winnersCapturePct)}%` : '—'}
            sub={`이익 ${s.winners}건 · 최대 순행 중 평균`} />
          <Tile label="지켰으면 손실 아니었을 매매" value={`${s.gaveBack}건`}
            sub={`손실 ${s.losers}건 중 · 한때 최종 손실 이상 이익 중`} warn={s.gaveBack > 0} />
          <Tile label="평균 최대 역행(MAE)" value={s.avgMaePct != null ? `−${s.avgMaePct.toFixed(2)}%` : '—'} sub="진입가 대비" color="var(--accent-ink)" />
          <Tile label="평균 최대 순행(MFE)" value={s.avgMfePct != null ? `+${s.avgMfePct.toFixed(2)}%` : '—'} sub="진입가 대비" color="var(--warn)" />
        </div>
      )}
      {s.withStop > 0 && (
        <p className="text-[11.5px] text-[var(--text-muted)] mb-2">
          손절가 기록이 있는 {s.withStop}건 중 <b style={{ color: s.beyondStop ? 'var(--warn)' : 'var(--text)' }}>{s.beyondStop}건</b>이 보유 중 그 손절가를 넘어 역행 — 손절을 옮겼거나 봉 단위 근사.
        </p>
      )}

      {failed > 0 && !busy && (
        <p className="text-[11px] text-[var(--warn)] mb-1.5">{failed}건은 캔들을 받지 못했습니다(거래소 응답 제한 등) — 잠시 뒤 다시 누르면 남은 건만 계산합니다.</p>
      )}
      {missing.length > 0 && (
        <button type="button" onClick={run} disabled={!!busy}
          className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] text-[13px] font-semibold text-[var(--accent-ink)] disabled:opacity-60">
          {busy ? `계산 중… ${busy.done}/${busy.total}` : `${s.n ? '나머지 ' : ''}${missing.length}건 계산하기 (캔들 ${missing.length}회 조회)`}
        </button>
      )}
      <p className="text-[10px] text-[var(--faint)] mt-2 leading-relaxed">
        포착률 = 청산 시점 순행 ÷ 최대 순행. 봉 단위 근사(진입·청산 봉 전체 범위 포함)라 아주 짧은 매매는 실제보다 크게 잡힐 수 있습니다.
        결과는 이 기기에만 저장되며, 매매 행을 누르면 건별 상세가 나옵니다.
      </p>
    </section>
  );
}

function Tile({ label, value, sub, color, warn }: { label: string; value: string; sub: string; color?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[10.5px] text-[var(--text-muted)]">{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums" style={{ color: warn ? 'var(--warn)' : color ?? 'var(--text)' }}>{value}</p>
      <p className="text-[9.5px] text-[var(--faint)] leading-tight">{sub}</p>
    </div>
  );
}
