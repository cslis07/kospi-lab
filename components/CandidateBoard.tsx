'use client';

/**
 * 후보 보드 — 담아둔 종목을 "재무(성장 점수) × 타이밍(수급 판정)" 2축으로 배치한다.
 *
 * 두 점수를 하나로 합치지 않는 것이 핵심이다. 재무 91점 + 수급 이탈을 평균 내면
 * 거짓말이 되므로, 두 축을 그대로 두고 사분면으로 읽게 한다.
 *
 * 수급 판정은 /api/portfolio-verdicts 재사용 — 일봉+수급만 쓰는 경량 판정이라
 * AI 호출도 인증 게이트도 없고 티커당 10분 캐시가 걸려 있다.
 * 미국 종목은 국내 수급 데이터가 없으므로 타이밍 축 없이 따로 표시한다.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Candidate } from '@/hooks/useCandidates';

interface Verdict {
  stance: 'buy' | 'neutral' | 'reduce';
  score: number;
  entryOk: boolean;
  price: number;
  stop: number;
  supplyMissing: boolean;
}

/** 성장 점수 상·하 구분선 — 사분면 배치 기준 */
const GROWTH_HI = 60;

const QUADRANTS = [
  { key: 'act', icon: '🎯', title: '정밀 분석 대상', desc: '재무도 좋고 수급도 들어온다 — 지금 볼 것', cls: 'border-emerald-500/40 bg-emerald-500/[0.06]' },
  { key: 'watch', icon: '👀', title: '관찰 — 타이밍 대기', desc: '재무는 검증됨. 수급이 돌아올 때까지 대기', cls: 'border-sky-500/30 bg-sky-500/[0.04]' },
  { key: 'suspect', icon: '⚠️', title: '수급만 좋음', desc: '펀더멘털이 약한데 돈이 들어온다 — 테마성 의심', cls: 'border-amber-500/30 bg-amber-500/[0.04]' },
  { key: 'drop', icon: '🗑', title: '정리 후보', desc: '재무도 수급도 근거 없음', cls: 'border-[var(--border)] bg-white/[0.02]' },
] as const;
type QuadKey = (typeof QUADRANTS)[number]['key'];

function quadrantOf(growth: number, v: Verdict | undefined): QuadKey {
  const hiGrowth = growth >= GROWTH_HI;
  const goodFlow = v?.stance === 'buy';
  if (hiGrowth && goodFlow) return 'act';
  if (hiGrowth) return 'watch';
  if (goodFlow) return 'suspect';
  return 'drop';
}

const STANCE_LABEL: Record<Verdict['stance'], { t: string; cls: string }> = {
  buy: { t: '매수우위 ▲', cls: 'text-red-400' },
  neutral: { t: '중립 ⏸', cls: 'text-amber-400' },
  reduce: { t: '비중축소 ▼', cls: 'text-blue-400' },
};

export default function CandidateBoard({
  candidates, onRemove, onClear,
}: {
  candidates: Candidate[];
  onRemove: (code: string) => void;
  onClear: () => void;
}) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const krCodes = candidates.filter((c) => c.market === 'KR').map((c) => c.code);
  const krKey = krCodes.join(',');

  // 국내 후보의 수급 판정 — 라우트가 15개 제한이라 배치로 나눠 호출
  useEffect(() => {
    if (!krKey) { setVerdicts({}); return; }
    let alive = true;
    const codes = krKey.split(',');
    setLoading(true); setFailed(false);
    (async () => {
      const acc: Record<string, Verdict> = {};
      let anyFail = false;
      for (let i = 0; i < codes.length; i += 15) {
        try {
          const r = await fetch(`/api/portfolio-verdicts?tickers=${codes.slice(i, i + 15).join(',')}`);
          if (!r.ok) { anyFail = true; continue; }
          Object.assign(acc, await r.json());
        } catch { anyFail = true; }
      }
      if (!alive) return;
      setVerdicts(acc); setFailed(anyFail); setLoading(false);
    })();
    return () => { alive = false; };
  }, [krKey]);

  if (!candidates.length) return null;

  const kr = candidates.filter((c) => c.market === 'KR');
  const us = candidates.filter((c) => c.market === 'US');
  const grouped: Record<QuadKey, Candidate[]> = { act: [], watch: [], suspect: [], drop: [] };
  for (const c of kr) grouped[quadrantOf(c.growthScore, verdicts[c.code])].push(c);
  for (const k of Object.keys(grouped) as QuadKey[]) {
    grouped[k].sort((a, b) => b.growthScore - a.growthScore);
  }

  const row = (c: Candidate, showFlow: boolean) => {
    const v = verdicts[c.code];
    return (
      <div key={c.code} className="flex items-center gap-2 py-1 group">
        <span className="font-semibold text-[var(--text)] text-xs truncate">{c.name}</span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">{Math.round(c.growthScore)}점</span>
        {showFlow && (
          v ? <span className={`text-[10px] shrink-0 ${STANCE_LABEL[v.stance].cls}`}>{STANCE_LABEL[v.stance].t}</span>
            : <span className="text-[10px] text-[var(--text-muted)] shrink-0 opacity-60">{loading ? '수급 확인 중…' : '수급 없음'}</span>
        )}
        {v?.supplyMissing && <span className="text-[9px] text-amber-400 shrink-0" title="투자자 수급 데이터가 없어 판정 신뢰도가 낮다">수급결측</span>}
        <span className="flex-1" />
        {c.market === 'KR' && (
          <Link href={`/stock-analysis?ticker=${c.code}`}
            className="text-[10px] text-sky-400 hover:underline shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">분석 →</Link>
        )}
        <button onClick={() => onRemove(c.code)}
          className="text-[10px] text-[var(--text-muted)] hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={`${c.name} 후보에서 제거`}>✕</button>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h2 className="text-sm font-bold text-[var(--text)]">⭐ 후보 보드</h2>
        <span className="text-[10px] text-[var(--text-muted)]">
          재무(성장 점수 {GROWTH_HI}점 기준) × 타이밍(수급 판정) — 두 축을 합치지 않고 그대로 봅니다
        </span>
        <span className="flex-1" />
        <span className="text-[10px] text-[var(--text-muted)]">{candidates.length}종목</span>
        <button onClick={() => { if (confirm(`후보 ${candidates.length}종목을 전부 비울까요?`)) onClear(); }}
          className="text-[10px] text-[var(--text-muted)] hover:text-red-400">전체 비우기</button>
      </div>
      {failed && (
        <p className="text-[10px] text-amber-400 mb-2">일부 종목의 수급 판정을 가져오지 못했습니다 — 아래 배치는 재무 점수만 반영된 상태일 수 있습니다.</p>
      )}

      {kr.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {QUADRANTS.map((q) => (
            <div key={q.key} className={`rounded-xl border p-3 ${q.cls}`}>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xs font-bold text-[var(--text)]">{q.icon} {q.title}</span>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{grouped[q.key].length}</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mb-1.5">{q.desc}</p>
              {grouped[q.key].length === 0
                ? <p className="text-[10px] text-[var(--text-muted)] opacity-50">—</p>
                : grouped[q.key].map((c) => row(c, true))}
            </div>
          ))}
        </div>
      )}

      {us.length > 0 && (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-white/[0.02] p-3">
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-xs font-bold text-[var(--text)]">🇺🇸 미국 후보</span>
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{us.length}</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
            국내 투자자 수급 데이터가 없어 <strong>타이밍 축은 적용하지 않습니다</strong> — 성장 점수만 표시합니다.
          </p>
          {[...us].sort((a, b) => b.growthScore - a.growthScore).map((c) => row(c, false))}
        </div>
      )}
    </div>
  );
}
