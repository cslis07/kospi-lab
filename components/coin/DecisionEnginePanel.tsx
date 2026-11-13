'use client';

/**
 * 🧪 의사결정 엔진(실험) — lib/intel 결과 표시. 상태·그룹별 정렬·보류 사유·비용 반영 손익비·트리거·데이터 유효성.
 * 실전 신호가 아니다: READY 는 '조건 충족(실험)'으로만 쓰고 알림·주문으로 이어지지 않는다. 독립 성과 검증은 아직 없음.
 * 끄기: NEXT_PUBLIC_CRYPTO_DECISION_ENGINE_V1=0 (빌드 시 반영).
 */
import { useState } from 'react';
import { GROUPS, GROUP_LABEL, GROUP_WEIGHTS, STATUS_LABEL, type EngineStatus, type SetupEvaluation } from '@/lib/intel/decisionEngine';
import type { DecisionResult } from '@/lib/intel/fromAnalysis';

const STATUS_CLS: Record<EngineStatus, string> = {
  BLOCKED: 'border-red-500/40 bg-red-500/10 text-red-400',
  NO_SETUP: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  WATCH: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  READY: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
};
const BIAS_LABEL = { LONG_CONTEXT: '롱 배경', SHORT_CONTEXT: '숏 배경', MIXED: '혼조', UNAVAILABLE: '판단 불가' } as const;

function ScoreBar({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[10px] text-[var(--text-muted)]">데이터 없음</span>;
  const w = Math.min(50, Math.abs(v) * 50);
  return (
    <span className="relative inline-block w-full h-2 rounded bg-white/[0.06]" aria-label={`정렬 ${v}`}>
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border)]" />
      <span className={`absolute top-0 bottom-0 rounded ${v >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
        style={v >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
    </span>
  );
}

function SetupRow({ e, fmt, selected }: { e: SetupEvaluation; fmt: (n: number) => string; selected: boolean }) {
  const long = e.side === 'long';
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${selected ? 'border-sky-500/50 bg-sky-500/[0.06]' : 'border-[var(--border)] bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2 flex-wrap text-[11.5px] tabular-nums">
        <b className={long ? 'text-emerald-400' : 'text-red-400'}>{long ? '▲ 롱' : '▼ 숏'}</b>
        <span className="text-[var(--text)]">${fmt(e.zoneLow)}~${fmt(e.zoneHigh)}</span>
        <span className="text-[var(--text-muted)]">손절 <b className="text-red-400">${fmt(e.stop)}</b></span>
        <span className="text-[var(--text-muted)]">순손익비 <b className={(e.rr1Net ?? 0) >= 1.6 ? 'text-emerald-400' : 'text-amber-400'}>{e.rr1Net ?? '—'}</b> / {e.rr2Net ?? '—'}</span>
        {selected && <span className="ml-auto text-[9.5px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-bold">엔진 선택</span>}
      </div>
      <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5">트리거: <span className={e.triggerConfirmed ? 'text-emerald-400' : ''}>{e.triggerDescription}</span></p>
      {e.maxNotionalUsd != null && (
        <p className="text-[10px] text-[var(--text-muted)] tabular-nums">계좌 $1,000·위험 0.5% 기준 명목 최대 ${e.maxNotionalUsd.toLocaleString('en-US')} · 손절 시 약 −${e.modeledMaxLossUsd} (비용 포함, 갭·미체결 제외)</p>
      )}
      {e.issues.length > 0 && <p className="text-[10px] text-amber-400 mt-0.5">{e.issues.join(' · ')}</p>}
    </div>
  );
}

export default function DecisionEnginePanel({ result, fmt, asOfMs, updatedAt }: { result: DecisionResult; fmt: (n: number) => string; asOfMs: number; updatedAt: number }) {
  const [open, setOpen] = useState(false);
  const o = result.output;
  const ageMin = Math.max(0, Math.round((asOfMs - updatedAt) / 60000));
  return (
    <div className="rounded-xl border border-violet-500/35 bg-violet-500/[0.04] p-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-extrabold text-[var(--text)]">🧪 의사결정 엔진</span>
        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold">실험 v0.1 · 연구용</span>
        <span className={`ml-auto text-[11px] font-extrabold px-2 py-0.5 rounded-lg border ${STATUS_CLS[o.status]}`}>{STATUS_LABEL[o.status]}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">
        <span>배경 <b className="text-[var(--text)]">{BIAS_LABEL[o.bias]}</b>{o.alignment != null ? ` (정렬 ${o.alignment > 0 ? '+' : ''}${o.alignment.toFixed(2)})` : ''}</span>
        <span>데이터 범위 <b className={o.coverage >= 0.55 ? 'text-[var(--text)]' : 'text-amber-400'}>{Math.round(o.coverage * 100)}%</b></span>
        <span>분석 {ageMin}분 전 시세</span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {o.reasons.map((r) => <li key={r} className={`text-[11px] ${o.status === 'BLOCKED' ? 'text-red-400' : 'text-[var(--text)]'}`}>• {r}</li>)}
      </ul>

      {o.evaluated.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {o.evaluated.map((e) => <SetupRow key={e.side} e={e} fmt={fmt} selected={o.selected?.side === e.side} />)}
        </div>
      )}

      <button type="button" onClick={() => setOpen((x) => !x)} className="mt-2 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">
        {open ? '근거 접기 ▴' : '그룹별 근거·데이터 유효성 ▾'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="space-y-1">
            {GROUPS.map((g) => (
              <div key={g} className="grid grid-cols-[92px_1fr_44px] items-center gap-2 text-[11px] whitespace-nowrap">
                <span className="text-[var(--text)]">{GROUP_LABEL[g]} <span className="text-[9.5px] text-[var(--text-muted)]">{Math.round(GROUP_WEIGHTS[g] * 100)}%</span></span>
                <ScoreBar v={o.groupScores[g]} />
                <span className="text-right tabular-nums text-[var(--text-muted)]">{o.groupScores[g] == null ? '—' : o.groupScores[g]!.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10.5px] font-bold text-[var(--text-muted)] mb-1">반영한 관측값</p>
            {result.observations.map((x) => (
              <p key={x.id} className={`text-[10.5px] ${o.staleIds.includes(x.id) || o.ignoredIds.includes(x.id) ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>
                <span className={x.direction > 0 ? 'text-emerald-400' : x.direction < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}>{x.direction > 0 ? '롱' : x.direction < 0 ? '숏' : '중립'}</span>{' '}
                {x.explanation} <span className="text-[var(--text-muted)]">· {x.source} · 기준 {new Date(x.availableAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {o.staleIds.includes(x.id) && <span className="text-amber-400"> (유효기간 지남)</span>}
              </p>
            ))}
            <p className="text-[10.5px] font-bold text-[var(--text-muted)] mt-1.5 mb-0.5">연결 안 된 데이터</p>
            {result.missing.map((m) => <p key={m} className="text-[10.5px] text-[var(--text-muted)]">○ {m}</p>)}
            {result.events.length > 0 && <p className="text-[10.5px] text-[var(--text-muted)] mt-1">이벤트: {result.events.map((e) => `${e.name} ${new Date(e.scheduledAt!).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}(전 ${e.preMinutes}분·후 ${e.postMinutes}분 보류)`).join(', ')}</p>}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] tabular-nums">비용 가정: 수수료 {result.costs.feeBps.toFixed(0)}bp(지정가 진입+시장가 청산) · 슬리피지 {result.costs.slippageBps.toFixed(0)}bp · 펀딩 {result.costs.fundingBps.toFixed(1)}bp(보유 시간 기준) — 위험관리 설정 값</p>
        </div>
      )}
      <p className="text-[9.5px] text-[var(--text-muted)] mt-2 leading-snug">
        {o.disclaimer} 그룹 가중치·기준값(정렬 ±0.20·순손익비 1.6·데이터 범위 55%)은 검증 전 임시값입니다. <b className="text-[var(--text)]">독립 성과 검증: 아직 없음.</b> 주문·알림으로 이어지지 않습니다.
      </p>
    </div>
  );
}
