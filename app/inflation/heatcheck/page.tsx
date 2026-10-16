'use client';

/** 경기 열지수 — labor.recession.signals(Sahm·금리커브·실업수당·산업생산·소매판매). 침체 신호 점검, 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { signalTone, type Labor } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };

export default function HeatcheckPage() {
  const { data: lb } = useSWR<Labor>('/api/nf/labor.json', fetcher, SWR_OPT);
  const signals = lb?.recession?.signals ?? [];
  const alerts = signals.filter((s) => signalTone(s.state).ko !== '양호').length;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">경기 열지수</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        널리 보는 <b className="text-[var(--text)]">침체 신호</b>를 한 화면에서 점검합니다(Sahm 법칙·장단기 금리차·실업수당·산업생산·소매판매). 물가·고용과 함께 경기 국면을 읽는 맥락 도구입니다.
        <b className="text-[var(--text)]"> 예측·매매 신호가 아닙니다.</b>
      </p>

      {lb?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!lb?.locked && signals.length > 0 && (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3 mb-3 text-[12px] text-[var(--text-muted)]">
            {alerts === 0
              ? <>현재 추적 신호 {signals.length}개 모두 <b className="text-emerald-400">양호</b> — 두드러진 침체 신호 없음.</>
              : <>추적 신호 {signals.length}개 중 <b className="text-amber-400">{alerts}개</b>가 주의/경보 상태입니다.</>}
          </div>
          <ul className="space-y-2 mb-3">
            {signals.map((s) => {
              const tone = signalTone(s.state);
              return (
                <li key={s.key} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-[var(--text)] truncate">{s.label}</span>
                    <span className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[12px] font-bold tabular-nums text-[var(--text)]">{s.value}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tone.cls}`}>{tone.ko}</span>
                    </span>
                  </div>
                  {s.why && <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{s.why}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!lb && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · FRED. 단일 신호가 침체를 확정하지 않으며, 표본·시차가 커 해석에 주의가 필요합니다.
      </p>
    </>
  );
}
