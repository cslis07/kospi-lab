/**
 * Bitget 입출금 대비 누적 손익 — 지금 전체 잔고 − (입금 − 출금 − 출금 수수료). 순수 함수(테스트: tests/cumulativePnl.test.ts).
 *
 * 내 자산 '실적'의 7·30·90일 칸은 거래소 포지션 이력(최대 90일)이라 그 전 손익과 현물 쪽 손익이 빠진다.
 * 이 값은 기간 제한 없이 "넣은 돈 대비 지금 얼마가 남았나"를 보여 준다(수수료·펀딩·강제청산·현물 손익 모두 포함).
 * ⚠ USDT 입출금만 금액으로 센다. 다른 코인 입출금이 있으면 unvalued 에 이름만 남기고(추정 환산 안 함) 화면에 경고한다.
 * ⚠ 잔고는 모든 계정(현물·선물·펀딩·earn·봇·마진)의 USDT 환산 합 — 보유 포지션 미실현 손익 포함.
 */

export interface WalletRecord { coin: string; size: number; fee: number; status: string; ts: number }

export interface Cumulative {
  firstDepositTs: number | null;
  deposits: number; depositN: number;
  withdrawals: number; withdrawN: number; withdrawFees: number;
  netIn: number;          // 입금 − 출금 − 출금 수수료
  balance: number;        // 지금 전체 잔고(USDT 환산)
  pnl: number;            // balance − netIn
  pnlPct: number | null;  // netIn 대비 %
  unvalued: string[];     // USDT 외 코인 입출금(금액 미반영)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Bitget /api/v2/spot/wallet/{deposit,withdrawal}-records 행 → WalletRecord */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseWalletRows(rows: any[]): WalletRecord[] {
  return (rows ?? []).map((r) => ({ coin: String(r.coin ?? ''), size: num(r.size), fee: Math.abs(num(r.fee)), status: String(r.status ?? ''), ts: num(r.cTime) }));
}

export function computeCumulative(deposits: WalletRecord[], withdrawals: WalletRecord[], balanceUsdt: number): Cumulative {
  const ok = (x: WalletRecord) => x.status === 'success';
  const usdt = (x: WalletRecord) => x.coin === 'USDT';
  const dep = deposits.filter(ok), wd = withdrawals.filter(ok);
  const unvalued = [...new Set([...dep, ...wd].filter((x) => !usdt(x)).map((x) => x.coin))];
  const d = dep.filter(usdt), w = wd.filter(usdt);
  const sum = (xs: WalletRecord[], k: 'size' | 'fee') => xs.reduce((a, x) => a + x[k], 0);
  const deposited = sum(d, 'size'), withdrawn = sum(w, 'size'), wfee = sum(w, 'fee');
  const netIn = deposited - withdrawn - wfee;
  const pnl = balanceUsdt - netIn;
  return {
    firstDepositTs: d.length ? Math.min(...d.map((x) => x.ts)) : null,
    deposits: deposited, depositN: d.length, withdrawals: withdrawn, withdrawN: w.length, withdrawFees: wfee,
    netIn, balance: balanceUsdt, pnl, pnlPct: netIn > 0 ? (pnl / netIn) * 100 : null, unvalued,
  };
}
