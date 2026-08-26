'use client';

/**
 * 실행 가능 판정 — "사도 되는가"에 정직하게 답하는 화면.
 *
 * ⚠ 이 화면의 GO 는 "오른다"가 아니다. 이 앱의 엔진은 방향을 못 맞힌다는 게 측정으로 확인됐다.
 *   여기서 단언하는 것은 **"틀려도 계좌가 버티는 크기인가"** 뿐이고, 그건 예측이 아니라 산수라서 단언할 수 있다.
 *   그 구분을 화면에서도 반복해 말한다 — 초록 배지를 매수 신호로 읽는 순간 이 도구는 해로워진다.
 */

import { evaluateTradeGate, type TradePlan } from '@/lib/tradeGate';

const STATE_ICON = { pass: '✓', fail: '✕', unknown: '?' } as const;

export default function TradeGate({ plan }: { plan: TradePlan }) {
  const g = evaluateTradeGate(plan);

  const box =
    g.verdict === 'go' ? 'border-sky-500/40 bg-sky-500/[0.07]'
    : g.verdict === 'resize' ? 'border-amber-500/40 bg-amber-500/[0.06]'
    : 'border-red-500/40 bg-red-500/[0.07]';
  const tone =
    g.verdict === 'go' ? 'text-sky-400' : g.verdict === 'resize' ? 'text-amber-400' : 'text-red-400';
  const title =
    g.verdict === 'go' ? '실행 가능' : g.verdict === 'resize' ? '크기 조정 필요' : '지금은 실행 금지';

  return (
    <div className={`rounded-2xl border p-4 ${box}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-sm font-bold text-[var(--text)]">
          실행 가능 판정 <span className="text-[10px] font-normal text-[var(--text-muted)]">이 크기로 걸어도 되는가</span>
        </h3>
        <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${box} ${tone}`}>{title}</span>
      </div>
      <p className={`text-[13px] font-semibold ${tone} mb-1`}>{g.headline}</p>
      {/* 오해를 부르는 지점이라 매번 다시 말한다 */}
      <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
        이 판정은 <strong className="text-[var(--text)]">방향이 맞는지를 말하지 않습니다</strong> — 방향은 직접 고르신 것이고,
        여기서 보는 건 <strong className="text-[var(--text)]">틀렸을 때 계좌가 버티는가</strong>뿐입니다.
        (이 앱 엔진의 방향 예측은 측정에서 우위가 확인되지 않았습니다)
      </p>

      <div className="space-y-1.5">
        {g.checks.map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-[11px]">
            <span className={`w-4 shrink-0 text-center font-bold ${
              c.state === 'pass' ? 'text-emerald-400' : c.state === 'fail' ? 'text-red-400' : 'text-[var(--text-muted)]'
            }`}>{STATE_ICON[c.state]}</span>
            <span className="w-24 shrink-0 text-[var(--text-muted)]">{c.label}</span>
            <span className="flex-1 text-[var(--text)] tabular-nums">
              {c.detail}
              {c.fix && <span className="block text-[10px] text-amber-400 mt-0.5 leading-relaxed">→ {c.fix}</span>}
            </span>
          </div>
        ))}
      </div>

      {(g.suggest.maxLeverage != null || g.suggest.maxNotion != null || g.suggest.maxRiskPct != null) && (
        <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className="text-[var(--text-muted)]">권장 상한:</span>
          {g.suggest.maxLeverage != null && <span className="text-[var(--text)]">레버리지 <strong>{g.suggest.maxLeverage}배</strong> 이하</span>}
          {g.suggest.maxNotion != null && <span className="text-[var(--text)]">노션 <strong>{g.suggest.maxNotion.toLocaleString()}</strong> USDT 이하</span>}
          {g.suggest.maxRiskPct != null && <span className="text-[var(--text)]">허용손실 <strong>{g.suggest.maxRiskPct}%</strong> 이하</span>}
        </div>
      )}
    </div>
  );
}
