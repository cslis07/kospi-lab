/**
 * 비용 분석 카드 — 수수료·펀딩이 손익에서 차지하는 비중(참고: TraderSync 'Commissions & Fees').
 * 계산은 lib/tradeCosts(테스트 고정). 월 합계는 월별 보고서에 있으니 여기선 '비율'만.
 */
import type { CostBreakdown, HoldCostRow, CashFlow } from '@/lib/tradeCosts';

const UP = 'var(--warn)';
const DOWN = 'var(--accent-ink)';
const signed = (n: number, fmt: (v: number) => string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? UP : n < 0 ? DOWN : 'var(--text)');

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'border-t border-[var(--line-2)] mt-1 pt-2' : ''}`}>
      <span className={`text-[12.5px] ${bold ? 'font-bold text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'text-[15px] font-extrabold' : 'text-[13px] font-bold'}`} style={{ color }}>{value}</span>
    </div>
  );
}

/** 보유시간별 비용 — 짧은 매매에서 비용이 이익을 얼마나 먹나 */
function HoldCostTable({ rows, fmt }: { rows: HoldCostRow[]; fmt: (n: number) => string }) {
  const eaten = rows.filter((r) => r.eaten);
  return (
    <div className="mt-4">
      <p className="text-[12px] font-bold text-[var(--text)] mb-1">보유시간별 비용 <span className="text-[10px] font-normal text-[var(--text-muted)]">짧게 자주 할수록 비용 몫이 커지나</span></p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[11.5px] tabular-nums mx-1" style={{ minWidth: 300 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">보유</th><th className="font-semibold">건</th>
              <th className="font-semibold">매매손익</th><th className="font-semibold">비용</th><th className="font-semibold">순손익</th>
              <th className="font-semibold">이익 중 비용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--line-2)] text-right" style={{ opacity: r.n < 5 ? 0.55 : 1 }} title={r.n < 5 ? `표본 ${r.n}건 — 5건 미만은 참고만` : undefined}>
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{r.label}</td>
                <td className="text-[var(--text-muted)]">{r.n}</td>
                <td style={{ color: tone(r.gross) }}>{signed(r.gross, fmt)}</td>
                <td className="text-[var(--text-muted)]">{r.cost >= 0 ? '−' : '+'}{fmt(Math.abs(r.cost))}</td>
                <td className="font-bold" style={{ color: tone(r.net) }}>{signed(r.net, fmt)}</td>
                <td style={{ color: r.eaten ? 'var(--warn)' : 'var(--text)' }}>{r.costOfGrossPct == null ? '—' : `${Math.round(r.costOfGrossPct)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
        {eaten.length > 0
          ? <>매매로는 벌었는데 비용이 이익을 다 먹은 구간: <b style={{ color: 'var(--warn)' }}>{eaten.map((r) => r.label).join(', ')}</b>. </>
          : null}
        &lsquo;이익 중 비용&rsquo; = 구간 매매손익이 플러스일 때 그중 비용 비율(100% 이상이면 비용이 이익보다 큼). 흐린 줄은 5건 미만.
      </p>
    </div>
  );
}

/** 출금 — 순손익 중 실제로 거래소 밖으로 나가 손에 쥔 돈(도착 금액 = 보낸 금액 − 출금 수수료) */
function CashBlock({ cash, net, fmt }: { cash: CashFlow; net: number; fmt: (n: number) => string }) {
  const md = (ts: number) => { const d = new Date(ts + 9 * 3600_000); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const pct = cash.arrivedOfNetPct;
  return (
    <div className="mt-4 pt-3 border-t border-[var(--line-2)]">
      <p className="text-[12px] font-bold text-[var(--text)] mb-1">출금 <span className="text-[10px] font-normal text-[var(--text-muted)]">실제로 손에 쥔 돈 · 같은 기간 USDT</span></p>
      {cash.nWithdraw === 0 ? (
        <p className="text-[11.5px] text-[var(--text-muted)] py-1">이 기간에 출금한 내역이 없습니다.</p>
      ) : (
        <>
          <Row label={`보낸 금액 (${cash.nWithdraw}건)`} value={`${fmt(cash.withdrawn)} USDT`} />
          <Row label="출금 수수료" value={`−${fmt(cash.withdrawFees)} USDT`} color={DOWN} />
          <Row label="도착 금액 (받는 곳 입금 기준)" value={`${fmt(cash.arrived)} USDT`} bold />
          <p className="text-[11.5px] text-[var(--text-muted)] mt-1.5 leading-relaxed tabular-nums">
            {pct == null
              ? <>이 기간 순손익이 플러스가 아니라 출금액은 원금(또는 이전 기간 수익)에서 나간 돈입니다. </>
              : pct <= 100
                ? <>순손익 {signed(net, fmt)} 중 <b className="text-[var(--text)]">{Math.round(pct)}%</b>를 출금해 손에 쥐었습니다. </>
                : <>도착 금액이 이 기간 순손익({signed(net, fmt)})보다 <b className="text-[var(--text)]">{fmt(cash.arrived - net)} USDT 많습니다</b> — 그만큼은 원금이나 이전 기간 수익에서 나간 돈입니다. </>}
            출금 수수료까지 빼면 순손익은 {signed(cash.netAfterWithdrawFees, fmt)} USDT.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {cash.list.slice(0, 8).map((m) => (
              <span key={m.ts} className="text-[11px] tabular-nums rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text)]" title={`보낸 ${m.size} − 수수료 ${m.fee}`}>
                {md(m.ts)} · <b>{fmt(m.arrive)}</b>
              </span>
            ))}
            {cash.list.length > 8 && <span className="text-[11px] text-[var(--text-muted)] py-0.5">외 {cash.list.length - 8}건</span>}
          </div>
        </>
      )}
      <p className="text-[10.5px] text-[var(--text-muted)] mt-2 leading-relaxed tabular-nums">
        같은 기간 입금 {cash.nDeposit}건 {fmt(cash.deposited)} USDT —{' '}
        {cash.netOut >= 0
          ? <>넣은 돈보다 <b className="text-[var(--text)]">{fmt(cash.netOut)} USDT 더 뺐습니다</b>(순출금).</>
          : <>뺀 돈보다 <b className="text-[var(--text)]">{fmt(-cash.netOut)} USDT 더 넣었습니다</b>(순입금).</>}
        {' '}출금에는 수익뿐 아니라 입금했던 원금 회수도 섞일 수 있습니다.
      </p>
    </div>
  );
}

export default function CostCard({ c, fmt, sub, holdRows, cash }: { c: CostBreakdown; fmt: (n: number) => string; sub?: string; holdRows?: HoldCostRow[]; cash?: CashFlow | null }) {
  if (c.n === 0) return null;
  const share = c.costOfGrossWinPct;
  const shareW = share == null ? 0 : Math.max(0, Math.min(100, share));
  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">비용 분석</h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? `청산 ${c.n}건 · 수수료·펀딩`}</span>
      </div>

      <Row label="매매손익 (비용 전)" value={`${signed(c.gross, fmt)} USDT`} color={tone(c.gross)} />
      <Row label="수수료" value={`${signed(c.fees, fmt)} USDT`} color={tone(c.fees)} />
      <Row label={`펀딩 (${c.funding >= 0 ? '받음' : '냄'})`} value={`${signed(c.funding, fmt)} USDT`} color={tone(c.funding)} />
      <Row label="순손익" value={`${signed(c.net, fmt)} USDT`} color={tone(c.net)} bold />
      {cash && cash.nWithdraw > 0 && (
        <Row label="└ 이 중 출금해 손에 쥔 돈" value={`${fmt(cash.arrived)} USDT`} />
      )}

      {share != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[var(--text-muted)]">번 돈 중 비용으로 나간 몫</span>
            <b className="tabular-nums" style={{ color: share >= 30 ? 'var(--warn)' : 'var(--text)' }}>{share.toFixed(0)}%</b>
          </div>
          <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full" style={{ width: `${shareW}%`, background: share >= 30 ? 'var(--warn)' : 'var(--amber)' }} />
          </div>
          <p className="text-[10.5px] text-[var(--faint)] mt-1 tabular-nums">이익 매매의 매매손익 합 +{fmt(c.grossWin)} 중 비용 {fmt(Math.abs(c.cost))} USDT{c.cost < 0 ? '(펀딩 수입이 더 큼)' : ''}</p>
          {c.gross > 0 && c.cost > 0 && (
            <p className="text-[11.5px] text-[var(--text-muted)] mt-1.5 leading-relaxed tabular-nums">
              전체 매매손익 +{fmt(c.gross)} 중 <b style={{ color: 'var(--warn)' }}>{Math.round((c.cost / c.gross) * 100)}%</b>가 비용으로 나가 순손익은 {signed(c.net, fmt)} USDT.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
          <p className="text-[10px] text-[var(--text-muted)]">비용에 뒤집힌 매매</p>
          <p className="text-[15px] font-extrabold tabular-nums" style={{ color: c.flipped ? 'var(--warn)' : 'var(--text)' }}>{c.flipped}건</p>
          <p className="text-[9.5px] text-[var(--faint)]">매매론 이겼는데 순손실</p>
        </div>
        <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
          <p className="text-[10px] text-[var(--text-muted)]">건당 수수료</p>
          <p className="text-[15px] font-extrabold tabular-nums text-[var(--text)]">{c.avgFee != null ? fmt(c.avgFee) : '—'}</p>
          <p className="text-[9.5px] text-[var(--faint)]">USDT · 진입+청산</p>
        </div>
        <div className="rounded-xl bg-[var(--surface-2)] px-2.5 py-2">
          <p className="text-[10px] text-[var(--text-muted)]">실효 수수료율</p>
          <p className="text-[15px] font-extrabold tabular-nums text-[var(--text)]">{c.feeRatePct != null ? `${c.feeRatePct.toFixed(3)}%` : '—'}</p>
          <p className="text-[9.5px] text-[var(--faint)]">체결 1회당</p>
        </div>
      </div>
      {holdRows && holdRows.length > 1 && <HoldCostTable rows={holdRows} fmt={fmt} />}
      {cash && <CashBlock cash={cash} net={c.net} fmt={fmt} />}

      <p className="text-[10.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
        실효 수수료율을 거래소 등급표의 메이커(지정가)·테이커(시장가) 요율과 비교해 보세요 — 테이커 쪽에 가깝다면 시장가 체결이 많다는 뜻입니다.
        보유가 짧고 자주 매매할수록 같은 요율이라도 이익에서 비용이 차지하는 몫이 커집니다.
      </p>
    </section>
  );
}
