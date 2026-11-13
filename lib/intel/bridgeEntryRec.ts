/**
 * 기존 추천 진입가(lib/entryRec SideRec) → 의사결정 엔진 후보(ProposedSetup) 연결. 새 가격을 만들지 않는다.
 * 진입 확인(트리거)은 닫힌 봉 규칙(lib/intel/trigger)이 판정해 넣는다 — 트리거가 없으면 그 방향 후보를 만들지 않는다.
 */
import type { EntryRec } from '@/lib/entryRec';
import type { ProposedSetup, Side, Strategy } from './decisionEngine';

export interface TriggerState { confirmed: boolean; strategy: Strategy; description: string }

export function bridgeEntryRec(rec: Pick<EntryRec, 'long' | 'short'>, triggers: Partial<Record<Side, TriggerState>>): ProposedSetup[] {
  const out: ProposedSetup[] = [];
  for (const side of ['long', 'short'] as const) {
    const r = rec[side];
    const t = triggers[side];
    if (!r || !t) continue; // 전략·트리거를 지어내지 않는다
    out.push({
      side, strategy: t.strategy,
      entry: r.entry, zoneLow: r.zoneLow, zoneHigh: r.zoneHigh,
      stop: r.stop, target1: r.target1, target2: r.target2,
      basis: r.basis,
      triggerConfirmed: t.confirmed,
      triggerDescription: t.description,
    });
  }
  return out;
}
