'use client';

/**
 * 수수료 진단 — 메이커(지정가) vs 테이커(시장가) 체결 비중과 '전부 지정가였다면' 가정 절감액.
 * 데이터: /api/bitget/fills?days=N (게이트·읽기 전용, 체결 단위). 계산은 lib/feeDiag(테스트 고정).
 * 청산 포지션 기준 비용 분석(CostCard)과 달리 '체결 1건' 단위라 수수료 합이 약간 다를 수 있다(펀딩 제외).
 */
import { useEffect, useState } from 'react';
import type { FeeDiag } from '@/lib/feeDiag';

type Resp = { configured?: boolean; diag?: FeeDiag; truncated?: boolean; error?: string; locked?: boolean };

const pct = (v: number | null, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`);

function Bar({ makerPct }: { makerPct: number }) {
  const m = Math.max(0, Math.min(100, makerPct));
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }} aria-hidden>
      <div style={{ width: `${m}%`, background: 'var(--amber)' }} />
      <div style={{ width: `${100 - m}%`, background: 'var(--warn)', opacity: 0.75 }} />
    </div>
  );
}

export default function FeeDiagCard({ days, fmt }: { days: number; fmt: (n: number) => string }) {
  const [state, setState] = useState<{ days: number; r: Resp } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/bitget/fills?days=${days}`)
      .then(async (res) => (res.status === 401 ? { locked: true } : ((await res.json()) as Resp)))
      .catch((e) => ({ error: String(e) }) as Resp)
      .then((r) => { if (alive) setState({ days, r }); });
    return () => { alive = false; };
  }, [days]);

  const busy = state?.days !== days; // 기간을 바꿔 새로 불러오는 중
  const r = state?.r;
  if (!r || r.locked || r.configured === false) {
    return busy ? <div className="fin-card mb-3 skeleton" style={{ height: 180 }} aria-label="수수료 진단 불러오는 중" /> : null;
  }

  const head = (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <h2 className="text-sm font-bold text-[var(--text)]">수수료 진단 <span className="text-[10px] font-normal text-[var(--text-muted)]">지정가(메이커) vs 시장가(테이커)</span></h2>
      <span className="text-[10px] text-[var(--text-muted)]">최근 {state!.days}일 · 체결 단위{busy ? ' · 갱신 중…' : ''}</span>
    </div>
  );

  if (r.error || !r.diag) {
    return (
      <section className="fin-card p-4 mb-3">
        {head}
        <p className="text-[12px] text-[var(--text-muted)]">체결 내역을 불러오지 못했습니다{r.error ? ` — ${r.error.slice(0, 120)}` : ''}.</p>
      </section>
    );
  }
  const d = r.diag;
  if (d.n === 0) {
    return <section className="fin-card p-4 mb-3">{head}<p className="text-[12px] text-[var(--text-muted)]">이 기간 체결이 없습니다.</p></section>;
  }

  const makerCntPct = (d.maker.n / d.n) * 100;
  const rateLabel = `${(d.makerRateUsed * 100).toFixed(3)}%`;

  return (
    <section className="fin-card p-4 mb-3">
      {head}

      <div className="flex items-center justify-between text-[11.5px] mb-1 tabular-nums">
        <span style={{ color: 'var(--amber)' }}>■ 메이커 {d.maker.n}건 ({makerCntPct.toFixed(0)}%)</span>
        <span style={{ color: 'var(--warn)' }}>테이커 {d.taker.n}건 ({(100 - makerCntPct).toFixed(0)}%) ■</span>
      </div>
      <Bar makerPct={makerCntPct} />

      <div className="overflow-x-auto -mx-1 mt-3">
        <table className="w-full text-[11.5px] tabular-nums mx-1" style={{ minWidth: 300 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">체결</th><th className="font-semibold">건</th>
              <th className="font-semibold">체결 금액</th><th className="font-semibold">수수료</th>
              <th className="font-semibold">실효 요율</th><th className="font-semibold">수수료 몫</th>
            </tr>
          </thead>
          <tbody>
            {([['메이커(지정가)', d.maker], ['테이커(시장가)', d.taker]] as const).map(([lbl, s]) => (
              <tr key={lbl} className="border-t border-[var(--line-2)] text-right">
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{lbl}</td>
                <td className="text-[var(--text-muted)]">{s.n}</td>
                <td className="text-[var(--text-muted)]">{fmt(s.notional)}</td>
                <td className="font-bold text-[var(--text)]">{fmt(s.fee)}</td>
                <td>{s.ratePct == null ? '—' : `${s.ratePct.toFixed(3)}%`}</td>
                <td>{pct(s.feeSharePct)}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--line-2)] text-right font-bold">
              <td className="text-left py-1.5 text-[var(--text)]">합계</td>
              <td className="text-[var(--text-muted)]">{d.n}</td>
              <td className="text-[var(--text-muted)]">{fmt(d.notional)}</td>
              <td className="text-[var(--text)]">{fmt(d.totalFee)}</td>
              <td>{d.effRatePct == null ? '—' : `${d.effRatePct.toFixed(3)}%`}</td>
              <td>100%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-[var(--faint)] mt-1 tabular-nums">
        테이커 비중 — 진입 체결 {pct(d.takerShareOpenPct)} · 청산 체결 {pct(d.takerShareClosePct)} (USDT, 체결 금액 기준 요율)
      </p>

      <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5 mt-3">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">가정 · 전부 지정가(메이커)였다면</p>
        <p className="text-[13px] text-[var(--text)] mt-0.5 tabular-nums">
          수수료 {fmt(d.totalFee)} → <b>{fmt(d.hypoAllMakerFee)}</b> USDT, 차이{' '}
          <b style={{ color: d.hypoSaving > 0 ? 'var(--warn)' : 'var(--text)' }}>{fmt(d.hypoSaving)} USDT</b>
          {d.hypoSavingPct != null && <span className="text-[var(--text-muted)]"> (수수료의 {d.hypoSavingPct.toFixed(0)}%)</span>}
        </p>
        <p className="text-[10.5px] text-[var(--faint)] mt-1 leading-relaxed">
          메이커 요율 {rateLabel} = {d.makerRateSource === 'observed' ? '이 기간 실제 메이커 체결의 실효 요율(관측값)' : 'Bitget 표준 메이커 요율(이 기간 메이커 체결이 없어 참고값 사용)'}.
          테이커 체결 금액에 이 요율을 곱해 계산했습니다.
        </p>
      </div>

      <p className="text-[10.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
        ⚠ 가정 계산이지 약속이 아닙니다 — 지정가 주문은 체결되지 않을 수 있고(놓친 진입·늦은 손절), 같은 가격에 체결됐다고 가정했습니다.
        손절은 체결 보장이 더 중요해 시장가가 맞을 수 있습니다. 펀딩비는 포함하지 않았습니다(위 비용 분석 참고).
        {r.truncated && ' 체결이 너무 많아 일부 구간은 최근 2,000건까지만 집계했습니다.'}
      </p>
    </section>
  );
}
