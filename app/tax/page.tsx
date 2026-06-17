'use client';

import { useState, useMemo } from 'react';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const fmtW = (n: number) =>
  n >= 100000000 ? `${(n/100000000).toFixed(2)}억원` :
  n >= 10000     ? `${(n/10000).toLocaleString()}만원` : `${n.toLocaleString()}원`;

/* ── 세율 계산 ─────────────────────────────────────────── */
function taxRate(income: number): number {
  if (income <= 14000000)  return 0.06;
  if (income <= 50000000)  return 0.15;
  if (income <= 88000000)  return 0.24;
  if (income <= 150000000) return 0.35;
  if (income <= 300000000) return 0.38;
  if (income <= 500000000) return 0.40;
  return 0.42;
}

export default function TaxPage() {
  const [income,    setIncome]    = useState(50000000);   // 연봉
  const [irpAmt,    setIrpAmt]    = useState(1800000);    // IRP 납입액
  const [pensionAmt,setPensionAmt]= useState(600000);     // 연금저축 납입액
  const [isaAmt,    setIsaAmt]    = useState(10000000);   // ISA 납입액
  const [hasIsa,    setHasIsa]    = useState(false);
  const [hasIrp,    setHasIrp]    = useState(false);
  const [hasPension,setHasPension]= useState(false);

  const calc = useMemo(() => {
    const rate = taxRate(income);
    const localTaxFactor = 1.1; // 지방소득세 10%

    /* IRP + 연금저축 세액공제 */
    const totalPensionInput = irpAmt + pensionAmt;
    const pensionCap = income <= 55000000 ? 9000000 : 7000000; // 총 한도
    const pensionDeductible = Math.min(totalPensionInput, pensionCap);
    const pensionTaxRate  = income <= 55000000 ? 0.165 : 0.132; // 지방세 포함
    const pensionRefund = hasIrp || hasPension
      ? Math.round(pensionDeductible * pensionTaxRate)
      : 0;

    /* ISA 비과세 혜택 (이자·배당 200만원 비과세, 초과분 9.9%) */
    // 가정: ISA 수익률 5%, 일반계좌라면 15.4% 세금
    const isaReturn = isaAmt * 0.05;
    const isaExemptLimit = income <= 50000000 ? 4000000 : 2000000; // 서민형/일반형
    const isaExempt = Math.min(isaReturn, isaExemptLimit);
    const isaOverflow = Math.max(0, isaReturn - isaExemptLimit);
    const normalTax   = isaReturn * 0.154; // 일반계좌
    const isaTax      = isaOverflow * 0.099;
    const isaSaving   = hasIsa ? Math.round(normalTax - isaTax) : 0;

    /* IRP 단독 세액공제 (연금저축 없을 때) */
    const irpOnlyRefund = hasIrp && !hasPension
      ? Math.round(Math.min(irpAmt, 1800000) * pensionTaxRate)
      : 0;

    const totalSaving = pensionRefund + isaSaving;

    return {
      rate,
      pensionTaxRate,
      pensionDeductible,
      pensionRefund,
      isaSaving,
      irpOnlyRefund,
      totalSaving,
      isaReturn,
      isaExempt,
      isaTax,
      normalTax,
    };
  }, [income, irpAmt, pensionAmt, isaAmt, hasIsa, hasIrp, hasPension]);

  const SliderRow = ({
    label, value, min, max, step, onChange, enabled,
  }: {
    label: string; value: number; min: number; max: number;
    step: number; onChange: (v: number) => void; enabled: boolean;
  }) => (
    <div className={`space-y-1.5 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
      <div className="flex justify-between">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-semibold text-[var(--text)]">{fmtW(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-sky-500" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">세제혜택 계산기</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">ISA · IRP · 연금저축 절세 효과를 자동 계산합니다</p>

      <div className="space-y-4">
        {/* 연봉 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">소득 정보</h2>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs text-[var(--text-muted)]">연봉 (세전)</span>
              <span className="text-xs font-semibold text-[var(--text)]">{fmtW(income)}</span>
            </div>
            <input type="range" min={20000000} max={200000000} step={1000000} value={income}
              onChange={(e) => setIncome(+e.target.value)}
              className="w-full accent-sky-500" />
          </div>
          <div className="flex gap-4 mt-1 text-xs">
            <div className="flex-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] px-3 py-2">
              <p className="text-[var(--text-muted)]">적용 세율</p>
              <p className="font-bold text-[var(--text)] mt-0.5">{(calc.rate * 100).toFixed(0)}%</p>
            </div>
            <div className="flex-1 rounded-xl bg-[var(--bg)] border border-[var(--border)] px-3 py-2">
              <p className="text-[var(--text-muted)]">공제 세율 (지방세)</p>
              <p className="font-bold text-[var(--text)] mt-0.5">{(calc.pensionTaxRate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {/* IRP */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text)]">IRP (개인형 퇴직연금)</h2>
            <button onClick={() => setHasIrp(!hasIrp)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                hasIrp ? 'bg-sky-500 text-white' : 'border border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              {hasIrp ? '사용' : '미사용'}
            </button>
          </div>
          <SliderRow label="연간 납입액" value={irpAmt} min={0} max={1800000} step={100000}
            onChange={setIrpAmt} enabled={hasIrp} />
          {hasIrp && (
            <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">세액공제 대상</span>
                <span className="font-semibold text-[var(--text)]">{fmtW(Math.min(irpAmt, 1800000))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">예상 세액공제</span>
                <span className="font-bold text-sky-400">+{fmtW(Math.round(Math.min(irpAmt, 1800000) * calc.pensionTaxRate))}</span>
              </div>
            </div>
          )}
        </div>

        {/* 연금저축 */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text)]">연금저축</h2>
            <button onClick={() => setHasPension(!hasPension)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                hasPension ? 'bg-violet-500 text-white' : 'border border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              {hasPension ? '사용' : '미사용'}
            </button>
          </div>
          <SliderRow label="연간 납입액" value={pensionAmt} min={0} max={6000000} step={100000}
            onChange={setPensionAmt} enabled={hasPension} />
          {hasPension && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">IRP + 연금 합산 공제한도</span>
                <span className="font-semibold text-[var(--text)]">
                  {income <= 55000000 ? '900만원' : '700만원'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">공제 대상 합산액</span>
                <span className="font-semibold text-[var(--text)]">{fmtW(calc.pensionDeductible)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">예상 세액공제</span>
                <span className="font-bold text-violet-400">+{fmtW(calc.pensionRefund)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ISA */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text)]">ISA (개인종합자산관리계좌)</h2>
            <button onClick={() => setHasIsa(!hasIsa)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                hasIsa ? 'bg-emerald-500 text-white' : 'border border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              {hasIsa ? '사용' : '미사용'}
            </button>
          </div>
          <SliderRow label="납입액 (연간 최대 2,000만원)" value={isaAmt}
            min={0} max={20000000} step={500000}
            onChange={setIsaAmt} enabled={hasIsa} />
          {hasIsa && (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">비과세 한도</span>
                <span className="font-semibold text-[var(--text)]">
                  {income <= 50000000 ? '400만원 (서민형)' : '200만원 (일반형)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">일반계좌 세금 (15.4%)</span>
                <span className="text-red-400">-{fmtW(Math.round(calc.normalTax))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">ISA 세금 (초과분 9.9%)</span>
                <span className="text-[var(--text)]">-{fmtW(Math.round(calc.isaTax))}</span>
              </div>
              <div className="flex justify-between border-t border-emerald-500/20 pt-1">
                <span className="text-[var(--text-muted)]">절세 효과</span>
                <span className="font-bold text-emerald-400">+{fmtW(calc.isaSaving)}</span>
              </div>
            </div>
          )}
        </div>

        {/* 최종 결과 */}
        <div className="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 p-5">
          <h2 className="text-sm font-semibold text-sky-400 mb-4">연간 절세 예상 총액</h2>
          <div className="space-y-2 mb-4">
            {(hasIrp || hasPension) && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">IRP · 연금저축 세액공제</span>
                <span className="font-semibold text-[var(--text)]">+{fmtW(calc.pensionRefund)}</span>
              </div>
            )}
            {hasIsa && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">ISA 절세</span>
                <span className="font-semibold text-[var(--text)]">+{fmtW(calc.isaSaving)}</span>
              </div>
            )}
            {!hasIrp && !hasPension && !hasIsa && (
              <p className="text-xs text-[var(--text-muted)] text-center py-2">
                위에서 계좌를 활성화하면 절세액이 계산됩니다
              </p>
            )}
          </div>
          <div className="border-t border-sky-500/20 pt-3 flex justify-between items-center">
            <span className="text-sm font-semibold text-[var(--text)]">합계</span>
            <span className="text-2xl font-bold text-sky-400">+{fmtW(calc.totalSaving)}</span>
          </div>
          {calc.totalSaving > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-2 text-center">
              월 환산 약 {fmtW(Math.round(calc.totalSaving / 12))} 절세
            </p>
          )}
        </div>

        {/* 안내 */}
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-400/80 space-y-1">
          <p className="font-semibold text-amber-400">⚠️ 참고 사항</p>
          <p>• 위 계산은 추정값이며 실제 세액공제는 소득공제 항목에 따라 다를 수 있습니다.</p>
          <p>• ISA 절세는 수익률 5% 가정 기준입니다.</p>
          <p>• 세액공제는 연말정산 시 환급됩니다.</p>
        </div>
      </div>
    </div>
  );
}
