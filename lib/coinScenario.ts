/**
 * 코인 분석 판정 카드의 '↗ 상승 / ↘ 하락' 시나리오 가격(/coin-analysis).
 * 상승 = 현재가 위 첫 저항 돌파 → 그보다 위 가격, 하락 = 현재가 아래 첫 지지 붕괴 → 그보다 아래 가격.
 * 판정 플랜의 가격은 방향이 맞을 때만 쓴다 — 롱: 위=목표1·아래=손절, 숏: 위=손절·아래=목표1.
 * (예전엔 숏일 때도 위에 목표1·아래에 손절을 붙여 '상승 돌파 → 더 낮은 가격'이 나왔다.)
 */
export interface ScenarioLevels { up1?: number; up2?: number; dn1?: number; dn2?: number }

export function scenarioLevels(
  price: number,
  resistances: number[],
  supports: number[],
  direction: 'long' | 'short' | 'wait',
  plan: { stop: number; target1: number },
): ScenarioLevels {
  const resAbove = resistances.filter((p) => p > price).sort((a, b) => a - b);
  const supBelow = supports.filter((p) => p < price).sort((a, b) => b - a);
  const up1 = resAbove[0];
  const dn1 = supBelow[0];
  const planUp = direction === 'long' ? plan.target1 : direction === 'short' ? plan.stop : undefined;
  const planDn = direction === 'long' ? plan.stop : direction === 'short' ? plan.target1 : undefined;
  const up2 = up1 == null ? undefined
    : planUp != null && Number.isFinite(planUp) && planUp > up1 ? planUp : resAbove.find((p) => p > up1);
  const dn2 = dn1 == null ? undefined
    : planDn != null && Number.isFinite(planDn) && planDn < dn1 ? planDn : supBelow.find((p) => p < dn1);
  return { up1, up2, dn1, dn2 };
}
