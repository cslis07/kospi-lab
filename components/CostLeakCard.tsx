'use client';

/**
 * 비용 누수 집중 분석 — 비용 탭 맨 위. "가격으로는 벌었는데 왜 순손익이 마이너스인가"를 한 화면에:
 *  ① 비용 = 수수료 몇 % + 펀딩 몇 % ② 가장 큰 구멍 순위(렌즈별, 겹침) ③ 수수료를 진입/청산 × 시장가/지정가 × 이익/손실로 쪼갬
 *  ④ 본전에 필요한 가격 이동·매매당 비용.
 * 계산은 lib/costLeak(테스트 고정). 포지션은 매매일지가 이미 불러온 것, 체결은 /api/bitget/fills(lib/fillsFetch 공유).
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchFillsResp, type FillsResp } from '@/lib/fillsFetch';
import { posLeak, rankLeaks, type LeakPosition, type FeeBucket } from '@/lib/costLeak';

const signed = (n: number, fmt: (v: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

function Split({ feePct }: { feePct: number }) {
  const f = Math.max(0, Math.min(100, feePct));
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }} aria-hidden>
      <div style={{ width: `${f}%`, background: 'var(--warn)' }} />
      <div style={{ width: `${100 - f}%`, background: 'var(--amber)' }} />
    </div>
  );
}

export default function CostLeakCard({ positions, days, fmt }: { positions: LeakPosition[]; days: number; fmt: (n: number) => string }) {
  const [state, setState] = useState<{ days: number; r: FillsResp } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchFillsResp(days).then((r) => { if (alive) setState({ days, r }); });
    return () => { alive = false; };
  }, [days]);

  const pl = useMemo(() => posLeak(positions), [positions]);
  const fl = state?.days === days && !state.r.error ? state.r.leak ?? null : null;
  const ranks = useMemo(() => rankLeaks(fl, pl), [fl, pl]);
  if (pl.n === 0 || pl.cost <= 0) return null;

  const top = ranks[0];
  const feePct = pl.feeShareOfCostPct ?? 0;
  const maxUsdt = ranks.reduce((m, r) => Math.max(m, r.usdt), 0);

  const rows: Array<[string, FeeBucket, string]> = fl ? [
    ['진입 · 시장가', fl.openTaker, '지정가로 바꿀 수 있음'],
    ['진입 · 지정가', fl.openMaker, ''],
    ['이익 청산 · 시장가', fl.closeTakerWin, '지정가 익절로 바꿀 수 있음'],
    ['손실 청산 · 시장가', fl.closeTakerLoss, '손절 — 시장가가 맞을 수 있음'],
    ['청산 · 지정가', fl.closeMaker, ''],
  ] : [];

  return (
    <section className="fin-card p-4 mb-3" aria-label="비용 누수 집중 분석">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">비용 누수 집중 분석</h2>
        <span className="text-[10px] text-[var(--text-muted)]">청산 {pl.n}건 · 어디서 새나</span>
      </div>

      <p className="text-[13px] text-[var(--text)] leading-relaxed tabular-nums">
        가격으로 <b style={{ color: pl.gross >= 0 ? 'var(--warn)' : 'var(--accent-ink)' }}>{signed(pl.gross, fmt)}</b> →
        비용 <b>−{fmt(pl.cost)}</b> → 순손익 <b style={{ color: pl.net >= 0 ? 'var(--warn)' : 'var(--accent-ink)' }}>{signed(pl.net, fmt)}</b> USDT
      </p>

      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[11.5px] mb-1 tabular-nums">
          <span style={{ color: 'var(--warn)' }}>■ 수수료 {fmt(pl.fee)} ({feePct.toFixed(0)}%)</span>
          <span style={{ color: 'var(--amber)' }}>낸 펀딩 {fmt(pl.fundingPaid)} ({(pl.fundingShareOfCostPct ?? 0).toFixed(0)}%) ■</span>
        </div>
        <Split feePct={feePct} />
        <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
          {feePct >= 80
            ? <>구멍은 <b className="text-[var(--text)]">펀딩이 아니라 수수료</b>입니다.</>
            : <>펀딩 몫도 큽니다 — 오래 들고 가는 매매를 점검하세요.</>}
          {pl.fundingFromLongHoldPct != null && <> 낸 펀딩의 {Math.round(pl.fundingFromLongHoldPct)}%는 8시간 넘게 보유한 매매에서 나왔습니다.</>}
        </p>
      </div>

      {top && (
        <div className="rounded-xl px-3 py-2.5 mt-3" style={{ background: 'var(--surface-2)' }}>
          <p className="text-[11px] font-semibold text-[var(--text-muted)]">가장 큰 구멍</p>
          <p className="text-[14px] font-bold text-[var(--text)] mt-0.5">{top.label} <span className="tabular-nums" style={{ color: 'var(--warn)' }}>{fmt(top.usdt)} USDT</span></p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{top.note}</p>
        </div>
      )}

      {ranks.length > 1 && (
        <ul className="mt-2.5 space-y-1.5">
          {ranks.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between text-[12px] tabular-nums">
                <span className="text-[var(--text)] font-semibold">{r.label} <span className="text-[10px] font-normal text-[var(--faint)]">{r.kind === 'assumed' ? '가정' : '실제'}</span></span>
                <b className="text-[var(--text)]">{fmt(r.usdt)}</b>
              </div>
              <div className="h-1.5 rounded-full mt-0.5 overflow-hidden" style={{ background: 'var(--surface-2)' }} aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${maxUsdt > 0 ? (r.usdt / maxUsdt) * 100 : 0}%`, background: r.kind === 'assumed' ? 'var(--amber)' : 'var(--warn)' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {ranks.length > 1 && <p className="text-[10.5px] text-[var(--faint)] mt-1">렌즈마다 겹치는 매매가 있어 합치면 안 됩니다(예: 1시간 미만 매매의 시장가 진입은 두 줄에 다 들어감).</p>}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
          <p className="text-[10px] text-[var(--text-muted)]">본전에 필요한 가격 이동</p>
          <p className="text-[15px] font-extrabold tabular-nums text-[var(--text)]">{pl.breakEvenMovePct != null ? `${pl.breakEvenMovePct.toFixed(3)}%` : '—'}</p>
          <p className="text-[9.5px] text-[var(--faint)]">진입+청산 수수료 ÷ 진입 금액</p>
        </div>
        <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
          <p className="text-[10px] text-[var(--text-muted)]">매매당 비용 vs 가격손익</p>
          <p className="text-[15px] font-extrabold tabular-nums text-[var(--text)]">{pl.costPerTrade != null ? fmt(pl.costPerTrade) : '—'} <span className="text-[11px] font-semibold text-[var(--text-muted)]">vs {pl.grossPerTrade != null ? signed(pl.grossPerTrade, fmt) : '—'}</span></p>
          <p className="text-[9.5px] text-[var(--faint)]">USDT · 1건 평균</p>
        </div>
      </div>
      {pl.short.n > 0 && (
        <p className="text-[11.5px] text-[var(--text-muted)] mt-2 leading-relaxed tabular-nums">
          1시간 미만 매매 <b className="text-[var(--text)]">{pl.short.n}건</b>이 수수료의 <b style={{ color: 'var(--warn)' }}>{Math.round(pl.short.feeShareOfFeePct ?? 0)}%</b>({fmt(pl.short.fee)})를 냈고,
          수수료 전 손익도 {signed(pl.short.gross, fmt)} USDT{pl.short.gross < 0 ? ' — 비용 이전에 이미 지는 구간입니다' : ''}.
        </p>
      )}

      {fl ? (
        <div className="mt-3">
          <p className="text-[12px] font-bold text-[var(--text)] mb-1">수수료가 나간 곳 <span className="text-[10px] font-normal text-[var(--text-muted)]">체결 {fl.n}건 · 최근 {days}일</span></p>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[11.5px] tabular-nums mx-1" style={{ minWidth: 300 }}>
              <thead>
                <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                  <th className="text-left font-semibold py-1">체결</th><th className="font-semibold">건</th><th className="font-semibold">수수료</th><th className="font-semibold">몫</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter(([, b]) => b.n > 0).map(([lbl, b, hint]) => (
                  <tr key={lbl} className="border-t border-[var(--line-2)] text-right">
                    <td className="text-left py-1.5 whitespace-nowrap">
                      <span className="font-semibold text-[var(--text)]">{lbl}</span>
                      {hint && <span className="block text-[9.5px] text-[var(--faint)]">{hint}</span>}
                    </td>
                    <td className="text-[var(--text-muted)]">{b.n}</td>
                    <td className="font-bold text-[var(--text)]">{fmt(b.fee)}</td>
                    <td>{fl.totalFee > 0 ? `${Math.round((b.fee / fl.totalFee) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fl.closeTakerLoss.n > 0 && (
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed tabular-nums">
              손실 청산 {fl.closeTakerLoss.n}건 중 예약 손절 주문이 발동한 건 <b className="text-[var(--text)]">{fl.lossCloseBySl}건</b>, 직접 시장가로 닫은 건 <b className="text-[var(--text)]">{fl.lossCloseManual}건</b>
              {fl.lossCloseManual > fl.lossCloseBySl ? ' — 손절을 미리 걸어두기보다 보면서 닫는 편입니다.' : '.'}
            </p>
          )}
          <p className="text-[10.5px] text-[var(--faint)] mt-1 leading-relaxed">
            가정 절감은 메이커 요율 {(fl.makerRateUsed * 100).toFixed(3)}%({fl.makerRateSource === 'observed' ? '이 기간 실제 지정가 체결 관측값' : 'Bitget 표준 참고값'})로 계산 — 지정가는 체결되지 않을 수 있습니다.
          </p>
        </div>
      ) : state?.days !== days ? (
        <div className="skeleton rounded-xl mt-3" style={{ height: 120 }} aria-label="체결 내역 불러오는 중" />
      ) : null}
    </section>
  );
}
