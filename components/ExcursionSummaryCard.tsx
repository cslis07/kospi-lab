'use client';

/**
 * 최근 매매 MAE/MFE 요약 — 이익 매매가 최대 순행 중 얼마나 챙겼나, 손실 매매 중 이익을 지켰다면 손실이 아니었을 매매가 몇 건인가
 * (참고: Edgewonk 'MAE/MFE analysis'). 매매마다 캔들이 필요해 **자동으로 일괄 요청하지 않는다** — 버튼으로 시작, 3건씩.
 * 결과는 이 기기에 저장(lib/excursionFetch)되므로 다음 방문엔 새 매매만 계산한다. 계산은 lib/tradeAutopsy(테스트 고정).
 */
import { useEffect, useMemo, useState } from 'react';
import { excursionSummary, isGaveBack, peakPrice, type Excursion } from '@/lib/tradeAutopsy';
import { cachedExcursion, loadExcursions, type ExcursionTrade } from '@/lib/excursionFetch';

const MAX = 60; // 한 번에 계산할 최대 매매 수(최근 순)
/** 가격 — 거래소 값 그대로(큰 값은 소수 2자리, 작은 값은 유효숫자 유지) */
const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : n >= 1 ? 4 : 6 });
const kstStamp = (ts: number) => { const d = new Date(ts + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

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
  // '지켰으면 손실 아니었을 매매' 건별 — 진입가·가장 유리했던 가격·청산가(거래소 체결 평균가 그대로)
  const gave = recent
    .filter((t) => done.has(t.positionId) && isGaveBack(done.get(t.positionId)!, t.netProfit))
    .map((t) => { const ex = done.get(t.positionId)!; return { t, ex, peak: peakPrice(t.openAvg, t.side, ex.mfePct) }; });
  const [showGave, setShowGave] = useState(false);
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
      {gave.length > 0 && (
        <div className="mb-2.5">
          <button type="button" onClick={() => setShowGave((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--text)]">
            <span>지켰으면 손실 아니었을 매매 {gave.length}건 — 진입가·청산가 보기</span>
            <span className="text-[var(--text-muted)]">{showGave ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showGave && (
            <>
              <div className="overflow-x-auto mt-1.5 rounded-xl border border-[var(--line-2)]">
                <table className="w-full text-[11.5px] tabular-nums" style={{ minWidth: 470 }}>
                  <thead>
                    <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                      <th className="text-left font-semibold px-2.5 py-1.5">청산(KST) · 종목</th>
                      <th className="font-semibold px-2">진입가</th>
                      <th className="font-semibold px-2">가장 유리했던 가격</th>
                      <th className="font-semibold px-2">청산가</th>
                      <th className="font-semibold px-2.5">순손익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gave.map(({ t, ex, peak }) => (
                      <tr key={t.positionId} className="border-t border-[var(--line-2)] text-right">
                        <td className="text-left px-2.5 py-1.5 whitespace-nowrap">
                          <span className="text-[var(--text-muted)]">{kstStamp(t.closeTs)}</span>{' '}
                          <b className="text-[var(--text)]">{t.symbol.replace('USDT', '')}</b>{' '}
                          <span style={{ color: t.side === 'long' ? 'var(--warn)' : 'var(--accent-ink)' }}>{t.side === 'long' ? '롱' : '숏'}</span>
                        </td>
                        <td className="px-2 text-[var(--text)]">{px(t.openAvg)}</td>
                        <td className="px-2" style={{ color: 'var(--warn)' }}>{px(peak)}<span className="block text-[10px]">+{ex.mfePct.toFixed(2)}%{ex.rough ? ' 근사' : ''}</span></td>
                        <td className="px-2 text-[var(--text)]">{px(t.closeAvg)}<span className="block text-[10px] text-[var(--accent-ink)]">{ex.exitPct >= 0 ? '+' : ''}{ex.exitPct.toFixed(2)}%</span></td>
                        <td className="px-2.5 font-bold" style={{ color: 'var(--accent-ink)' }}>{t.netProfit.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                진입가·청산가는 거래소 체결 평균가 그대로입니다. &lsquo;가장 유리했던 가격&rsquo;은 보유 중 봉의 고가(롱)·저가(숏) 기준이라 실제 체결 가능 가격과 조금 다를 수 있습니다.
                이 매매들은 한때 최종 손실폭보다 크게 이익 중이었습니다 — 그 구간에서 손절을 본전으로 올렸다면 손실은 피할 수 있었습니다(사후 확인이며, 그렇게 하면 이긴 매매가 일찍 잘리는 경우도 생깁니다).
              </p>
            </>
          )}
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
