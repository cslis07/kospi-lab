'use client';

/**
 * BNF 모의 검증 봇(선행 테스트) 기록 — GitHub Actions(bnf-forward.yml)가 bnf-forward 브랜치에 쓴 JSON 을 브라우저가 직접 읽는다.
 * Vercel 함수 미사용. 사전등록: docs/bnf/FORWARD.md
 * ⚠ 진입가·손절·목표는 모의 기록이며 매매 권유가 아니다(검증 전). 실거래 주문 없음.
 */
import useSWR from 'swr';
import { jsonFetcher, ApiError } from '@/lib/fetcher';
import type { ForwardResult, CandidateResult } from '@/lib/bnf/forward';

const URL = 'https://raw.githubusercontent.com/cslis07/kospi-lab/bnf-forward/data/bnf-forward.json';
const REASON: Record<string, string> = { target: '목표', stop: '손절', stop_gap: '갭 손절', time: '72h 만기' };
const kst = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(2, 16).replace('T', ' ') : '—');
const sgn = (v: number | null | undefined, d = 2, unit = '') => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${unit}`);
const tone = (v: number | null | undefined) => (v == null || v === 0 ? 'var(--text-muted)' : v > 0 ? 'var(--up)' : 'var(--down)');
const px = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

function Candidate({ c }: { c: CandidateResult }) {
  const s = c.summary;
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <div className="text-[13.5px] font-extrabold text-[var(--text)]">{c.name}</div>
        <div className="text-[12px] font-bold" style={{ color: c.verdict ? (c.verdict === 'candidate' ? 'var(--accent)' : 'var(--warn)') : 'var(--text-muted)' }}>
          {c.verdictLabel ?? `진행 중 · 청산 ${c.progress}`}
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2 text-[12px] tabular-nums">
        {[
          ['청산', `${s.trades}회`], ['승률', s.winRate == null ? '—' : `${s.winRate.toFixed(0)}%`],
          ['PF', s.trades === 0 ? '—' : s.pf == null ? '∞' : s.pf.toFixed(2)], ['평균 R', sgn(s.avgR, 3)],
          ['MDD', `${s.mddPct.toFixed(2)}%`], ['자산', `${c.equity.toFixed(1)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--surface-2)' }}>
            <div className="text-[10.5px] text-[var(--text-muted)]">{k}</div>
            <div className="font-bold text-[var(--text)]" style={k === '평균 R' ? { color: tone(s.avgR) } : undefined}>{v}</div>
          </div>
        ))}
      </div>
      {c.open && (
        <div className="mt-2 text-[12px] leading-relaxed rounded-lg px-2.5 py-2 border border-[var(--line)]">
          <b className="text-[var(--text)]">모의 보유 중</b> · 진입 {kst(c.open.entryT)} @ {px(c.open.entry)} · 손절 {px(c.open.stop)} · 목표 {px(c.open.target)} · 만기 {kst(c.open.expiresT)}
          <span className="text-[var(--text-muted)]"> · 마지막 종가 {px(c.open.lastClose)} (</span><span style={{ color: tone(c.open.unrealizedR) }}>{sgn(c.open.unrealizedR, 2, 'R')}</span><span className="text-[var(--text-muted)]">)</span>
        </div>
      )}
      {c.pending && (
        <div className="mt-2 text-[12px] rounded-lg px-2.5 py-2 border border-[var(--line)]">
          <b className="text-[var(--text)]">모의 진입 예정</b> · 신호 봉 {kst(c.pending.signalT)} 확정 → {kst(c.pending.entryAtBarT)} 봉 시가에 모의 진입
        </div>
      )}
      {c.closed.length > 0 && (
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[11.5px] min-w-[520px] tabular-nums">
            <thead><tr className="text-[var(--text-muted)] border-b border-[var(--line)]">
              <th className="text-left font-bold py-1">진입</th><th className="text-left font-bold px-1">청산</th><th className="text-left font-bold px-1">사유</th>
              <th className="text-right font-bold px-1">진입가</th><th className="text-right font-bold px-1">청산가</th><th className="text-right font-bold px-1">R</th><th className="text-right font-bold pl-1">처음 기록</th>
            </tr></thead>
            <tbody>
              {[...c.closed].reverse().slice(0, 12).map((t) => (
                <tr key={t.entryT} className="border-b border-[var(--line)]">
                  <td className="py-1 pr-1 whitespace-nowrap">{kst(t.entryT)}</td><td className="px-1 whitespace-nowrap">{kst(t.exitT)}</td><td className="px-1">{REASON[t.reason] ?? t.reason}</td>
                  <td className="px-1 text-right">{px(t.entry)}</td><td className="px-1 text-right">{px(t.exit)}</td>
                  <td className="px-1 text-right" style={{ color: tone(t.r) }}>{sgn(t.r, 2)}</td><td className="pl-1 text-right whitespace-nowrap text-[var(--text-muted)]">{kst(t.firstSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BnfForwardCard() {
  const { data, error } = useSWR<ForwardResult>(URL, jsonFetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const notYet = error instanceof ApiError && error.status === 404;

  return (
    <section aria-label="모의 검증 봇 선행 테스트" className="fin-card p-4 mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-1">
        <h3 className="text-[15px] font-extrabold text-[var(--text)]">모의 검증 봇 · 선행 테스트</h3>
        <span className="fin-chip warn">모의 기록 — 매매 권유 아님</span>
      </div>
      <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed mb-3">
        2026-11-05 00:00 UTC 이후 Bitget ETHUSDT 확정 봉만으로 두 규칙(A 목표 1.8R · B 목표 1.0R)을 모의로 기록합니다.
        규칙과 판정 기준은 시작 전에 고정했고, 청산 30회가 쌓이면(약 14개월 예상) 한 번 판정합니다. 3시간마다 GitHub 에서 갱신합니다.
      </p>
      {notYet && <p className="text-[12.5px] text-[var(--text-muted)]">아직 첫 기록이 없습니다. GitHub Actions 의 첫 실행을 기다리는 중입니다.</p>}
      {error && !notYet && <p className="text-[12.5px] text-[var(--warn)]">기록을 불러오지 못했습니다: {String((error as Error).message ?? error)}</p>}
      {!data && !error && <div className="skeleton rounded-xl h-[120px]" aria-hidden />}
      {data && (
        <>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)] mb-3">
            <span>상태 <b style={{ color: data.status === 'ok' ? 'var(--text)' : 'var(--warn)' }}>{data.status === 'ok' ? '정상' : data.status === 'waiting' ? '시작 대기' : '데이터 결측으로 멈춤'}</b></span>
            <span>데이터 {kst(data.dataThroughUtc)} KST까지</span>
            <span>갱신 {kst(data.updatedAt)} KST</span>
          </div>
          {data.statusNote && <p className="text-[12px] text-[var(--warn)] mb-2">{data.statusNote}</p>}
          {data.now && (
            <div className="text-[12px] rounded-lg px-2.5 py-2 mb-3" style={{ background: 'var(--surface-2)' }}>
              <b className="text-[var(--text)]">규칙 상태</b> · 최신 1시간봉 {kst(data.now.barUtc)} 종가 {px(data.now.close)} · 25일 이격도 {sgn(data.now.deviation == null ? null : data.now.deviation * 100, 2, '%')}
              {' '}/ 과매도 기준 {sgn(data.now.q10 == null ? null : data.now.q10 * 100, 2, '%')} · 최근 4봉 과매도 {data.now.oversoldRecent ? '있음' : '없음'}
              <span className="text-[var(--text-muted)]"> — 신호 조건을 그대로 보여 줄 뿐 방향 예측이 아닙니다.</span>
            </div>
          )}
          {data.revisions.length > 0 && (
            <div className="text-[12px] text-[var(--warn)] mb-3">⚠ 기록 변경 {data.revisions.length}건 — 이전에 기록된 청산 거래가 재계산에서 달라졌습니다(이전 값 보존): {data.revisions.map((x) => `${x.candidate} ${kst(x.entryT)}`).join(', ')}</div>
          )}
          <div className="space-y-3">{data.candidates.map((c) => <Candidate key={c.id} c={c} />)}</div>
        </>
      )}
    </section>
  );
}
