/**
 * 비용 분석 카드 — 수수료·펀딩이 손익에서 차지하는 비중(참고: TraderSync 'Commissions & Fees').
 * 계산은 lib/tradeCosts(테스트 고정). 월 합계는 월별 보고서에 있으니 여기선 '비율'만.
 */
import type { CostBreakdown } from '@/lib/tradeCosts';

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

export default function CostCard({ c, fmt, sub }: { c: CostBreakdown; fmt: (n: number) => string; sub?: string }) {
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
      <p className="text-[10.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
        실효 수수료율을 거래소 등급표의 메이커(지정가)·테이커(시장가) 요율과 비교해 보세요 — 테이커 쪽에 가깝다면 시장가 체결이 많다는 뜻입니다.
        보유가 짧고 자주 매매할수록 같은 요율이라도 이익에서 비용이 차지하는 몫이 커집니다.
      </p>
    </section>
  );
}
