'use client';

/**
 * 매매당 손실 크기 vs 계좌 자본 — 손실 매매마다 자본의 몇 %를 잃었나, 2% 초과 손실은 '크게 걸어서'인지 '크게 역행해서'인지.
 * 계산은 lib/riskSize(헤더 주석·테스트 고정). 자본은 지금 선물 계좌 자본(/api/bitget/positions 의 account.equity)이라
 * 과거 매매는 오늘 자본으로 나눈 근사다 — 실현손익만 되돌린 '당시 자본 추정' 기준도 함께 보여준다.
 */
import { useMemo, useState } from 'react';
import { riskSize, DRIVER_TEXT, RISK_LIMIT_PCT, type RiskTrade } from '@/lib/riskSize';

const kstStamp = (ts: number) => { const d = new Date(ts + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const SIZE_Q = ['하위', '중하', '중상', '상위'];

export default function RiskSizeCard({ trades, equity, fmt, sub }: { trades: (RiskTrade & { positionId?: string })[]; equity: number | null; fmt: (n: number) => string; sub?: string }) {
  const s = useMemo(() => (equity && equity > 0 ? riskSize(trades, equity) : null), [trades, equity]);
  const [open, setOpen] = useState(false);
  if (!trades.length) return null;

  const head = (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      <h2 className="text-sm font-bold text-[var(--text)]">매매당 손실 크기 <span className="text-[10px] font-normal text-[var(--text-muted)]">계좌 자본 대비 %</span></h2>
      <span className="text-[10px] text-[var(--text-muted)]">{sub ?? `손실 매매 ${s?.losers ?? 0}건`}</span>
    </div>
  );
  if (!s) {
    return (
      <section className="fin-card p-4 mb-3">
        {head}
        <p className="text-[12px] text-[var(--text-muted)]">선물 계좌 자본을 불러오지 못해 비율을 계산할 수 없습니다(키 권한·잠금 확인).</p>
      </section>
    );
  }
  if (!s.losers) {
    return <section className="fin-card p-4 mb-3">{head}<p className="text-[12px] text-[var(--text-muted)]">이 기간 손실 매매가 없습니다.</p></section>;
  }

  return (
    <section className="fin-card p-4 mb-3">
      {head}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Tile label={`${RISK_LIMIT_PCT}% 초과 손실`} value={`${s.overCount}건`} sub={`손실 ${s.losers}건 중 · 당시 자본 추정 기준 ${s.overCountThen}건`} warn={s.overCount > 0} />
        <Tile label="가장 큰 손실" value={s.largest ? `${s.largest.lossPct.toFixed(1)}%` : '—'}
          sub={s.largest ? `−${fmt(s.largest.loss)} USDT · ${s.largest.symbol.replace('USDT', '')} ${kstStamp(s.largest.closeTs)}` : ''} warn={!!s.largest?.over} />
        <Tile label={`손실 중 ${RISK_LIMIT_PCT}% 초과 매매 몫`} value={s.overLossSharePct != null ? `${Math.round(s.overLossSharePct)}%` : '—'}
          sub={`전체 손실 −${fmt(s.totalLoss)} USDT 중`} warn={(s.overLossSharePct ?? 0) >= 50} />
        <Tile label="기준 자본(지금)" value={`${fmt(s.equity)}`} sub="USDT · 선물 계좌 현재 자본" />
      </div>

      {s.driver && (
        <p className="text-[12px] text-[var(--text)] leading-relaxed mb-1">
          {DRIVER_TEXT[s.driver]}
          <span className="block text-[10.5px] text-[var(--text-muted)] mt-0.5">{RISK_LIMIT_PCT}% 초과 {s.overCount}건 중 진입 금액 상위 25% {s.overBigSize}건 · 불리한 가격 이동 상위 25% {s.overBigMove}건</span>
        </p>
      )}
      {!s.overCount && <p className="text-[12px] text-[var(--text-muted)] mb-1">한 번에 자본의 {RISK_LIMIT_PCT}%를 넘게 잃은 매매가 없습니다.</p>}

      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 mt-1.5 rounded-xl bg-[var(--surface-2)] text-[12px] font-semibold text-[var(--text)]">
        <span>손실 {s.losers}건 자본 대비 %</span>
        <span className="text-[var(--text-muted)] whitespace-nowrap">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto mt-1.5 rounded-xl border border-[var(--line-2)]">
          <table className="w-full text-[11.5px] tabular-nums" style={{ minWidth: 470 }}>
            <thead>
              <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                <th className="text-left font-semibold px-2.5 py-1.5">청산(KST) · 종목</th>
                <th className="font-semibold px-2">손실</th>
                <th className="font-semibold px-2">자본 대비</th>
                <th className="font-semibold px-2">당시 추정</th>
                <th className="font-semibold px-2">진입 금액</th>
                <th className="font-semibold px-2.5">역행</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line-2)] text-right">
                  <td className="text-left px-2.5 py-1.5 whitespace-nowrap">
                    <span className="text-[var(--text-muted)]">{kstStamp(r.closeTs)}</span>{' '}
                    <b className="text-[var(--text)]">{r.symbol.replace('USDT', '')}</b>{' '}
                    <span style={{ color: r.side === 'long' ? 'var(--warn)' : 'var(--accent-ink)' }}>{r.side === 'long' ? '롱' : '숏'}</span>
                  </td>
                  <td className="px-2" style={{ color: 'var(--accent-ink)' }}>−{fmt(r.loss)}</td>
                  <td className="px-2 font-bold" style={{ color: r.over ? 'var(--warn)' : 'var(--text)' }}>{r.lossPct.toFixed(2)}%{r.over ? ' ⚠' : ''}</td>
                  <td className="px-2 text-[var(--text-muted)]">{r.lossPctThen != null ? `${r.lossPctThen.toFixed(2)}%` : '—'}</td>
                  <td className="px-2 text-[var(--text)]">{fmt(r.notional)}{r.sizeQuartile != null && <span className="block text-[9.5px] text-[var(--faint)]">{SIZE_Q[r.sizeQuartile]} 25%</span>}</td>
                  <td className="px-2.5" style={{ color: r.bigMove ? 'var(--warn)' : 'var(--text)' }}>{r.movePct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-[var(--faint)] mt-2 leading-relaxed">
        근사: 과거 매매도 <b>오늘 자본</b>으로 나눴습니다(그 사이 손익·입출금만큼 실제 당시 비율과 다름). &lsquo;당시 추정&rsquo;은 지금 자본에서 그 매매 이후 청산 순손익을 되돌린 값으로, 입출금·현물↔선물 이체·미실현손익은 반영하지 않습니다.
        역행 = 진입가→청산가 불리한 이동(%), 진입 금액 분위는 이 기간 전체 매매 기준. 손실 = 수수료·펀딩 포함 순손실.
      </p>
    </section>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <p className="text-[10.5px] text-[var(--text-muted)]">{label}</p>
      <p className="text-[16px] font-extrabold tabular-nums" style={{ color: warn ? 'var(--warn)' : 'var(--text)' }}>{value}</p>
      <p className="text-[9.5px] text-[var(--faint)] leading-tight">{sub}</p>
    </div>
  );
}
