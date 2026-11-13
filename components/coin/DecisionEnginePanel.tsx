'use client';

/**
 * 🧪 의사결정 엔진(실험) — lib/intel 결과 표시. 상태·그룹별 정렬·보류 사유·비용 반영 손익비·트리거·데이터 유효성.
 * 실전 신호가 아니다: READY 는 '조건 충족(실험)'으로만 쓰고 알림·주문으로 이어지지 않는다. 독립 성과 검증은 아직 없음.
 * 끄기: NEXT_PUBLIC_CRYPTO_DECISION_ENGINE_V1=0 (빌드 시 반영).
 */
import { useState } from 'react';
import { GROUPS, GROUP_LABEL, GROUP_WEIGHTS, STATUS_LABEL, type EngineStatus, type SetupEvaluation } from '@/lib/intel/decisionEngine';
import type { DecisionResult, ProviderStatus } from '@/lib/intel/fromAnalysis';
import EngineEvidence from './EngineEvidence';
import { TOPIC_LABEL, VERIFICATION_LABEL, type Verification } from '@/lib/intel/newsEvents';

const STATUS_CLS: Record<EngineStatus, string> = {
  BLOCKED: 'border-red-500/40 bg-red-500/10 text-red-400',
  NO_SETUP: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  WATCH: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  READY: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
};
const VER_CLS: Record<Verification, string> = {
  official: 'bg-emerald-500/15 text-emerald-400', multi_source: 'bg-sky-500/15 text-sky-400', single_source: 'bg-white/[0.06] text-[var(--text-muted)]',
};
const PROV: Record<ProviderStatus['status'], { t: string; c: string }> = {
  ok: { t: '정상', c: 'text-emerald-400' }, stale: { t: '지연', c: 'text-amber-400' }, missing: { t: '없음', c: 'text-red-400' }, na: { t: '해당 없음', c: 'text-[var(--text-muted)]' },
};
const when = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const BIAS_LABEL = { LONG_CONTEXT: '롱 배경', SHORT_CONTEXT: '숏 배경', MIXED: '혼조', UNAVAILABLE: '판단 불가' } as const;

function ScoreBar({ v, empty = '데이터 없음' }: { v: number | null; empty?: string }) {
  if (v == null) return <span className="text-[10px] text-[var(--text-muted)]">{empty}</span>;
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
                <ScoreBar v={o.groupScores[g]} empty={g === 'news' ? '방향 점수 안 씀(원문 확인 전)' : '데이터 없음'} />
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
            {result.events.length > 0 && <p className="text-[10.5px] text-[var(--text-muted)] mt-1">이벤트: {result.events.map((e) => (e.scheduledAt
              ? `${e.name} ${when(e.scheduledAt)}(전 ${e.preMinutes}분·후 ${e.postMinutes}분 보류)`
              : `${e.name}${e.severity === 'critical' && e.blockUntil ? ` — ${when(e.blockUntil)}까지 보류` : ' — 참고(보류 안 함)'}`)).join(', ')}</p>}
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10.5px] font-bold text-[var(--text-muted)] mb-1">뉴스 사건(24시간 · 같은 사건 묶음 · 방향 점수 없음)</p>
            {result.newsEvents.length === 0 && <p className="text-[10.5px] text-[var(--text-muted)]">시각이 확인된 기사 없음</p>}
            {result.newsEvents.slice(0, 6).map((e) => (
              <p key={e.eventId} className="text-[10.5px] text-[var(--text)] leading-snug mb-0.5">
                {e.crisis && <span className="text-red-400 font-bold">⚠ </span>}
                <span className={`text-[9.5px] px-1 py-px rounded mr-1 ${VER_CLS[e.verification]}`}>{VERIFICATION_LABEL[e.verification]}{e.sources.length > 1 ? ` ${e.sources.length}곳` : ''}</span>
                {e.topic && <span className="text-[9.5px] text-[var(--text-muted)] mr-1">[{TOPIC_LABEL[e.topic]}]</span>}
                <a href={e.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.title}</a>
                <span className="text-[var(--text-muted)]"> · {e.sources.slice(0, 2).join('·')} · {when(e.firstSeenAt)}{e.articleCount > 1 ? ` · 기사 ${e.articleCount}건` : ''}</span>
              </p>
            ))}
            <p className="text-[10.5px] font-bold text-[var(--text-muted)] mt-1.5 mb-0.5">연준 공식 자료(48시간)</p>
            {result.fed.length === 0 && <p className="text-[10.5px] text-[var(--text-muted)]">없음</p>}
            {result.fed.slice(0, 5).map((f) => (
              <p key={f.link || f.title} className="text-[10.5px] text-[var(--text)] leading-snug">
                <span className="text-[9.5px] px-1 py-px rounded mr-1 bg-emerald-500/15 text-emerald-400">{f.kind === 'speech' ? '연설' : f.kind === 'testimony' ? '증언' : '통화정책'}</span>
                {f.speaker && <b>{f.speaker} · </b>}<a href={f.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.title}</a>
                <span className="text-[var(--text-muted)]"> · {when(f.publishedAt)}</span>
              </p>
            ))}
            <p className="text-[9.5px] text-[var(--text-muted)] mt-1 leading-snug">매파·비둘기·호재·악재는 제목으로 판단하지 않습니다(원문·문맥·시장 선반영 확인 전). 거래소 사고·전쟁 발발·시장 급락 단어가 담긴 속보는 처음 보인 뒤 2시간 거래 보류로만 씁니다 — 제목 단어 감지라 오탐이 있을 수 있으니 링크로 확인하세요.</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-2">
            <p className="text-[10.5px] font-bold text-[var(--text-muted)] mb-1">데이터 공급자 상태</p>
            {result.providers.map((pv) => (
              <div key={pv.id} className="grid grid-cols-[1fr_auto] gap-x-2 text-[10.5px] leading-snug py-0.5 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--text)]">{pv.label}</span>
                <b className={`text-right ${PROV[pv.status].c}`}>{PROV[pv.status].t}</b>
                <span className="col-span-2 text-[10px] text-[var(--text-muted)]">{pv.delay}{pv.asOf ? ` · 기준 ${when(pv.asOf)}` : ''}{pv.note ? ` · ${pv.note}` : ''}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] tabular-nums">비용 가정: 수수료 {result.costs.feeBps.toFixed(0)}bp(지정가 진입+시장가 청산) · 슬리피지 {result.costs.slippageBps.toFixed(0)}bp · 펀딩 {result.costs.fundingBps.toFixed(1)}bp(보유 시간 기준) — 위험관리 설정 값</p>
        </div>
      )}
      <EngineEvidence />
      <p className="text-[9.5px] text-[var(--text-muted)] mt-2 leading-snug">
        {o.disclaimer} 그룹 가중치·기준값(정렬 ±0.20·순손익비 1.6·데이터 범위 55%)은 검증 전 임시값입니다. <b className="text-[var(--text)]">독립 성과 검증: 아직 없음.</b> 주문·알림으로 이어지지 않습니다.
      </p>
    </div>
  );
}
