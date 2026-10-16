'use client';

/** 리드 테스트 — lead_test.json. 발표 전야 게이지가 공식 CPI를 얼마나 앞서 맞혔나(과거 통계). 예측 아님·정직한 한계 표기. */
import { useState } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import type { LeadTest, LeadStat } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };

const WINDOW_LABEL: Record<string, string> = {
  since_2019: '2019~',
  since_2023_07: '2023.7~',
  last_12: '최근 12회',
};
const WINDOW_ORDER = ['last_12', 'since_2023_07', 'since_2019'];
const VARIANT_ORDER = ['cpi_comparable', 'cpi_tracker', 'pce_weighted'];

const ppAbs = (x?: number) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(2)}%p`);
const rate = (x?: number) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(0)}%`);
const corr = (x?: number) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));

export default function LeadPage() {
  const { data: lt } = useSWR<LeadTest>('/api/nf/lead_test.json', fetcher, SWR_OPT);
  const [win, setWin] = useState('last_12');

  const windows = lt?.print_eve?.windows ?? {};
  const avail = WINDOW_ORDER.filter((w) => windows[w]);
  const curKey = windows[win] ? win : (avail[0] ?? '');
  const w = windows[curKey];

  const seg = (on: boolean) => `px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${on ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">리드 테스트</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        발표 전야의 게이지 읽기가 실제 공식 CPI 발표치와 <b className="text-[var(--text)]">과거에 얼마나 가까웠나</b>를 지표별로 집계합니다.
        평균오차·상관·방향 적중, 그리고 "직전값 그대로 쓰기(나이브)"보다 나았던 비율까지. <b className="text-[var(--text)]">과거 성적이며 미래 예측·매매 신호가 아닙니다.</b>
      </p>

      {lt?.locked && <div className="mb-4"><UnlockGate /></div>}

      {lt && !lt.locked && w && (
        <>
          <div className="flex gap-1.5 mb-3">
            {avail.map((k) => <button key={k} type="button" className={seg(curKey === k)} onClick={() => setWin(k)}>{WINDOW_LABEL[k] ?? k}</button>)}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-2 tabular-nums">발표 {w.n_prints}회 · {w.from} ~ {w.to}</p>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden mb-3">
            <div className="grid grid-cols-[1.3fr_0.8fr_0.7fr_0.8fr_0.8fr] gap-1 px-3 py-2 text-[10px] font-semibold text-[var(--text-muted)] border-b border-[var(--border)] bg-[var(--surface-2)]/40">
              <span>지표</span>
              <span className="text-right">평균오차</span>
              <span className="text-right">상관</span>
              <span className="text-right">방향적중</span>
              <span className="text-right">나이브↑</span>
            </div>
            <ul className="divide-y divide-[var(--border)]/60">
              {VARIANT_ORDER.filter((v) => w.by_variant?.[v]).map((v) => (
                <Row key={v} name={lt.variants?.[v] ?? v} st={w.by_variant[v]} />
              ))}
              {w.naive && <Row name="나이브(직전값)" st={w.naive} muted />}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3 mb-3 text-[11px] text-[var(--text-muted)] leading-relaxed space-y-1">
            <p><b className="text-[var(--text)]">평균오차(MAE)</b> 발표치와의 평균 절대차(%p, 작을수록 정확).</p>
            <p><b className="text-[var(--text)]">상관</b> 게이지와 발표치가 함께 움직인 정도(1에 가까울수록 동행).</p>
            <p><b className="text-[var(--text)]">방향적중</b> 전월 대비 오르내림 방향을 맞힌 비율.</p>
            <p><b className="text-[var(--text)]">나이브↑</b> "직전 발표치 그대로" 쓰기보다 나았던 발표 비율. 50% 부근이면 단순 추정 대비 우위가 뚜렷하지 않다는 뜻.</p>
          </div>
        </>
      )}

      {!lt && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 표본이 작고 자기상관이 커 불확실성이 큽니다 — 지표 서프라이즈로 방향을 맞히는 우위는 이 앱의 측정에서 확인되지 않았습니다.
      </p>
    </>
  );
}

function Row({ name, st, muted }: { name: string; st: LeadStat; muted?: boolean }) {
  return (
    <li className="px-3 py-2.5 grid grid-cols-[1.3fr_0.8fr_0.7fr_0.8fr_0.8fr] gap-1 items-baseline tabular-nums">
      <span className={`text-[12px] font-semibold truncate ${muted ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{name}</span>
      <span className="text-right text-[13px] font-bold text-[var(--text)]">{ppAbs(st.mae)}</span>
      <span className="text-right text-[12px] text-[var(--text)]">{corr(st.corr)}</span>
      <span className="text-right text-[12px] text-[var(--text)]">{rate(st.dir_hit)}</span>
      <span className="text-right text-[12px] text-[var(--text)]">{rate(st.beats_naive_rate)}</span>
    </li>
  );
}
