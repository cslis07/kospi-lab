'use client';

/**
 * 거래소 단위 수량 한 줄(KL-001) — 위험 예산으로 산 연속 수량을 Bitget 수량 단위로 '내림'하고,
 * 내림한 수량으로 손절 시 손실을 다시 계산해 보여 준다. 최소 수량·최소 주문금액 미달이면 '진입 불가'로 표시.
 * 코인 분석·리스크 계산·위험관리 세 화면이 같은 계산(lib/positionSizing.sizeByRisk)과 같은 규격(/api/futures/specs)을 쓴다.
 * 주문 기능 없음 — 표시용. 규격을 못 받으면 '수량 단위 미확인'으로 남기고 연속값을 그대로 쓰지 말라고 안내한다.
 */
import useSWR from 'swr';
import { sizeByRisk, type StopCostModel, type ContractSpec } from '@/lib/positionSizing';

type SpecRow = ContractSpec & { minNotional?: number | null };
const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));

export function useContractSpec(symbol: string | null | undefined): { spec: ContractSpec | null; loading: boolean } {
  const sym = symbol && /^[A-Z0-9]{2,20}USDT$/.test(symbol) ? symbol : null;
  const { data, isLoading } = useSWR<Record<string, SpecRow> | null>(sym ? `/api/futures/specs?symbols=${sym}` : null, fetcher, { revalidateOnFocus: false, dedupingInterval: 3600_000 });
  const row = sym && data ? data[sym] : null;
  return { spec: row ? { qtyStep: row.qtyStep, minQty: row.minQty, minNotional: row.minNotional ?? undefined } : null, loading: !!sym && isLoading };
}

const fmtQty = (q: number, step: number | null) => {
  if (step == null) return q.toPrecision(4);
  const d = String(step).includes('.') ? String(step).split('.')[1].length : String(step).includes('e-') ? Number(String(step).split('e-')[1]) : 0;
  return q.toFixed(d);
};

export default function ExchangeQtyLine({ symbol, side, entry, stop, riskBudget, costs, leverage, className = '' }: {
  symbol: string | null | undefined; side: 'long' | 'short'; entry: number; stop: number; riskBudget: number;
  costs: StopCostModel; leverage: number; className?: string;
}) {
  const { spec, loading } = useContractSpec(symbol);
  if (!(entry > 0) || !(stop > 0) || !(riskBudget > 0)) return null;
  const base = (symbol ?? '').replace(/USDT$/, '') || '개';
  const r = sizeByRisk({ side, entry, stop, riskBudget, costs, leverage, spec });
  if (r.status === 'REJECT_INPUT' || r.status === 'UNSUPPORTED') {
    return <p className={`text-[11px] leading-relaxed text-amber-400 ${className}`}>계산 불가 — {r.reason}</p>;
  }
  if (r.status === 'BLOCK_MIN_QTY' || r.status === 'BLOCK_MIN_NOTIONAL') {
    return <p className={`rounded-lg bg-red-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-red-400 ${className}`}>⛔ 진입 불가 — {r.reason}</p>;
  }
  return (
    <div className={`text-[11px] leading-relaxed ${className}`}>
      <div className="flex justify-between gap-2">
        <span className="text-[var(--text-muted)]">거래소 단위 수량{spec ? ` (단위 ${spec.qtyStep} 내림)` : ''}</span>
        <span className="font-bold text-[var(--text)] tabular-nums">{fmtQty(r.qty, spec?.qtyStep ?? null)} {base}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-[var(--text-muted)]">그 수량의 손절 시 예상 손실(비용 포함)</span>
        <span className="font-semibold text-red-400 tabular-nums">−{r.estLoss.toFixed(2)} USDT</span>
      </div>
      {!spec && (
        <p className="text-amber-400">{loading ? '거래소 수량 단위 확인 중…' : '수량 단위 미확인 — 거래소 주문 화면에서 위 수량 이하로 내림해 넣으세요(올림 금지).'}</p>
      )}
    </div>
  );
}
