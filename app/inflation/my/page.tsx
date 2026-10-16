'use client';

/** 내 물가 — compare.json 품목 가중치를 내 소비에 맞게 조정 → 개인 체감 YoY vs 공식 가중 비교(이 기기 한정). nowflation 'My inflation'. */
import { useMemo } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { useSyncedList } from '@/hooks/useSyncedList';
import { personalYoY, pctFrac, type Compare, type CompareTile } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const MY_KEY = 'kospi-lab-inflation-myweights';
const MULTS = [0, 0.5, 1, 1.5, 2, 3];
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

interface MultLine { component: string; mult: number }

export default function MyInflationPage() {
  const { data: cmp } = useSWR<Compare>('/api/nf/compare.json', fetcher, SWR_OPT);
  const { list: saved, mounted, save } = useSyncedList<MultLine>(MY_KEY, []);
  const tiles: CompareTile[] = useMemo(() => [...(cmp?.tiles ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 10), [cmp]);

  const mult = useMemo(() => Object.fromEntries(saved.map((m) => [m.component, m.mult])), [saved]);
  const setMult = (component: string, m: number) => {
    const next = saved.filter((x) => x.component !== component);
    if (m !== 1) next.push({ component, mult: m });
    save(next);
  };
  const { personal, official } = useMemo(() => personalYoY(tiles, mounted ? mult : {}), [tiles, mult, mounted]);
  const diff = personal != null && official != null ? (personal - official) * 100 : null;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">내 물가</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        품목 비중을 <b className="text-[var(--text)]">내 소비 성향에 맞게</b> 조정하면, 공식 가중치로 계산한 물가와 <b className="text-[var(--text)]">체감 물가</b>가 얼마나 다른지 보여줍니다. 조정값은 이 기기에만 저장됩니다.
      </p>

      {cmp?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!cmp?.locked && tiles.length > 0 && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[10px] text-[var(--text-muted)]">공식 가중 YoY</p><p className={`text-xl font-extrabold tabular-nums ${sign(official)}`}>{pctFrac(official, 1)}</p></div>
              <div><p className="text-[10px] text-[var(--text-muted)]">내 체감 YoY</p><p className={`text-xl font-extrabold tabular-nums ${sign(personal)}`}>{pctFrac(personal, 1)}</p></div>
              <div><p className="text-[10px] text-[var(--text-muted)]">차이</p><p className={`text-xl font-extrabold tabular-nums ${sign(diff)}`}>{diff != null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%p` : '—'}</p></div>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">비중 1배 = 공식과 동일. 자주 사는 품목 비중을 올리고 안 쓰는 건 0으로.</p>
          </div>

          <ul className="space-y-2 mb-3">
            {tiles.map((t) => {
              const m = mounted ? (mult[t.component] ?? 1) : 1;
              return (
                <li key={t.component} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[12px] font-semibold text-[var(--text)] truncate">{t.label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums"><span className="text-[var(--text-muted)]">공식 {pctFrac(t.weight, 1)} · </span><b className={sign(t.yoy)}>{pctFrac(t.yoy, 1)}</b></span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {MULTS.map((mm) => (
                      <button key={mm} type="button" onClick={() => setMult(t.component, mm)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${m === mm ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                        {mm === 0 ? '안 씀' : `×${mm}`}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {saved.length > 0 && <button type="button" onClick={() => save([])} className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] mb-2">기본값으로 초기화</button>}
        </>
      )}

      {!cmp && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 상위 품목만 조정 대상이며, 간이 추정으로 공식 개인소비 가중과 다를 수 있습니다.
      </p>
    </>
  );
}
