'use client';

import { useState } from 'react';
import useSWR from 'swr';
import MacroDetail, { FLAG } from '@/components/MacroDetail';
import type { MacroIndicator } from '@/lib/macroData';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmtNum(v: number | null | undefined, dec: number) {
  return v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number | null) {
  return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
// 상승=빨강 / 하락=파랑 (국내 관행)
function chgClass(v: number | null) {
  if (v == null || v === 0) return 'text-[var(--text-muted)]';
  return v > 0 ? 'text-red-400' : 'text-blue-400';
}

export default function MacroPage() {
  const { data, isLoading } = useSWR<MacroIndicator[]>('/api/macro/indicators', fetcher, { refreshInterval: 300000 });
  const [sel, setSel] = useState('cpi');
  const list = data ?? [];
  const cur = list.find((x) => x.id === sel) ?? list[0];

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">경제지표</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">
        미국 물가·달러·유가와 원/달러를 <b className="text-[var(--text)]">FRED 공식 발표치</b>로 봅니다. 실제값·이전값·추세 중심이며,
        예상치(컨센서스)는 무료로 제공하는 곳이 없어 생략했습니다. 숫자는 실시간이 아니라 <b className="text-[var(--text)]">공식 발표 기준(기준일 표기)</b>입니다.
      </p>

      {/* 지표 선택 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        {(isLoading && list.length === 0 ? MACRO_SKELETON : list).map((it) => {
          const active = it.id === sel;
          const chg = it.changePct;
          return (
            <button key={it.id} onClick={() => setSel(it.id)}
              className={`text-left rounded-xl border p-3 transition-all ${active ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--text-muted)]'}`}>
              <p className="text-[11px] text-[var(--text-muted)] leading-tight">{FLAG[it.country]} {it.label}</p>
              <p className="text-base font-bold tabular-nums text-[var(--text)] mt-1">{fmtNum(it.latest?.value, it.decimals)}</p>
              <p className={`text-[11px] font-semibold tabular-nums ${chgClass(chg)}`}>
                {chg == null ? '—' : `${chg > 0 ? '▲' : chg < 0 ? '▼' : ''} ${fmtPct(chg)}`}
              </p>
            </button>
          );
        })}
      </div>

      {/* 상세 */}
      {cur ? (
        <MacroDetail cur={cur} />
      ) : (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">
          {isLoading ? '지표 불러오는 중…' : 'FRED 응답이 비었습니다(키 미설정 또는 일시 오류). 잠시 후 다시 시도하세요.'}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: FRED(세인트루이스 연은). 공식 발표치라 실시간이 아니며 월간 지표(CPI·PPI)는 1~2개월, 일간 지표는 1~5일 지연될 수 있습니다.
        달러지수는 연준 광의 달러지수(DTWEXBGS)로 ICE DXY와 구성이 다릅니다. 투자 권유가 아닙니다.
      </p>
    </div>
  );
}

const MACRO_SKELETON: MacroIndicator[] = ['cpi', 'ppi', 'dxy', 'wti', 'usdkrw'].map((id) => ({
  id, fred: '', label: '…', country: 'US', unit: '', periodicity: 'daily', decimals: 2,
  desc: '', impact: '', schedule: '', latest: null, prev: null, changePct: null, yoyPct: null, history: [],
}));
