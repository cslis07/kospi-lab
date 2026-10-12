'use client';

import { useState } from 'react';
import useSWR from 'swr';
import MacroChartLazy from '@/components/MacroChartLazy';
import type { MacroIndicator } from '@/lib/macroData';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const FLAG: Record<string, string> = { US: '🇺🇸', KR: '🇰🇷' };

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
function fmtPeriod(d: string, monthly: boolean) {
  const [y, m, day] = d.split('-');
  return monthly ? `${y}.${m}` : `${y.slice(2)}.${m}.${day}`;
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
      {cur && cur.latest ? (
        <div className="space-y-4">
          {/* 현재값 요약 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">{FLAG[cur.country]} {cur.label}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">기준일 {cur.latest.date} · {cur.schedule}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold tabular-nums text-[var(--text)]">{fmtNum(cur.latest.value, cur.decimals)}<span className="text-xs font-normal text-[var(--text-muted)] ml-1">{cur.unit}</span></p>
                <p className={`text-xs font-semibold tabular-nums ${chgClass(cur.changePct)}`}>
                  {cur.periodicity === 'monthly' ? '전월대비' : '전일대비'} {fmtPct(cur.changePct)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
                <p className="text-[10px] text-[var(--text-muted)]">이전</p>
                <p className="text-sm font-bold tabular-nums text-[var(--text)] mt-0.5">{fmtNum(cur.prev?.value, cur.decimals)}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
                <p className="text-[10px] text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '전월대비' : '전일대비'}</p>
                <p className={`text-sm font-bold tabular-nums mt-0.5 ${chgClass(cur.changePct)}`}>{fmtPct(cur.changePct)}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/3 p-2.5">
                <p className="text-[10px] text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '전년동월대비(YoY)' : '추세'}</p>
                <p className={`text-sm font-bold tabular-nums mt-0.5 ${cur.periodicity === 'monthly' ? chgClass(cur.yoyPct) : 'text-[var(--text-muted)]'}`}>
                  {cur.periodicity === 'monthly' ? fmtPct(cur.yoyPct) : '아래 차트'}
                </p>
              </div>
            </div>
          </div>

          {/* 차트 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-3">히스토리 <span className="text-[10px] font-normal text-[var(--text-muted)]">{cur.periodicity === 'monthly' ? '최근 24개월' : '최근 60영업일'}</span></h2>
            <MacroChartLazy data={cur.history} decimals={cur.decimals} monthly={cur.periodicity === 'monthly'} unit={cur.unit} />
          </div>

          {/* 발표 내역 표 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-3">발표 내역</h2>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                    <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">기간</th>
                    <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">실제</th>
                    <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">{cur.periodicity === 'monthly' ? '전월대비' : '전일대비'}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cur.history].reverse().slice(0, 12).map((p, i, arr) => {
                    const next = arr[i + 1];
                    const ch = next && next.value !== 0 ? ((p.value - next.value) / next.value) * 100 : null;
                    return (
                      <tr key={p.date} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{fmtPeriod(p.date, cur.periodicity === 'monthly')}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtNum(p.value, cur.decimals)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${chgClass(ch)}`}>{ch == null ? '-' : fmtPct(ch)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 설명·영향 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">지표 설명</p>
              <p className="text-[13px] text-[var(--text)] leading-relaxed">{cur.desc}</p>
            </div>
            <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--surface-2)] p-3">
              <p className="text-[11px] font-semibold text-[var(--accent-ink)] mb-1">코인·주식에 주는 영향</p>
              <p className="text-[13px] text-[var(--text)] leading-relaxed">{cur.impact}</p>
            </div>
          </div>
        </div>
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
