'use client';

/**
 * 진입·매매 횟수 달력 — 복기 대시보드(/review). 칸마다 그날(KST, 진입 시각 기준) 진입 횟수 + 순손익,
 * 배경색 = 순손익(이익 빨강 · 손실 파랑, 짙기는 그 달 최대 대비), 1시간 미만 매매가 섞인 날은 주황 점,
 * 가드 경보(🛑 서킷브레이커 · 🔁 복구 매매)가 울린 날은 아이콘. 칸을 누르면 그날 수수료·순손익(원화)·매매 목록.
 * 계산은 lib/journalAnalytics(aggregateDaily·monthDays)·lib/reviewDash(dayCost) — 테스트 고정.
 */
import { useMemo, useState } from 'react';
import { aggregateDaily, monthDays, monthList, kstDateKey } from '@/lib/journalAnalytics';
import { dayCost } from '@/lib/reviewDash';
import type { GuardMark } from '@/lib/guard';

export interface CalTrade { symbol: string; side: 'long' | 'short'; openTs: number; closeTs: number; netProfit: number; grossPnl: number; fee: number; funding: number }

const UP = '255,68,51', DOWN = '28,108,255';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const SCALP_MS = 3_600_000;
const MARK_ICON: Record<GuardMark['kind'], string> = { cb: '🛑', revenge: '🔁', scalp: '⏱' };
const MARK_LABEL: Record<GuardMark['kind'], string> = { cb: '서킷브레이커', revenge: '복구 매매 경고', scalp: '단타 횟수 경고' };
const bg = (pnl: number | null, maxAbs: number) => {
  if (pnl == null || pnl === 0) return 'var(--surface-2)';
  const t = maxAbs > 0 ? Math.min(1, Math.abs(pnl) / maxAbs) : 0.5;
  return `rgba(${pnl > 0 ? UP : DOWN},${(0.12 + t * 0.55).toFixed(2)})`;
};
const kstTime = (ts: number) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
const hold = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`; };

export default function TradeCalendar({ trades, fmt, krw, marks = [] }: { trades: CalTrade[]; fmt: (n: number) => string; krw: (usdt: number) => string | null; marks?: GuardMark[] }) {
  const vals = useMemo(() => trades.map((t) => ({ ts: t.openTs || t.closeTs, value: t.netProfit })), [trades]);
  const byDate = useMemo(() => aggregateDaily(vals), [vals]);
  const costs = useMemo(() => dayCost(trades), [trades]);
  const scalpDays = useMemo(() => new Set(trades.filter((t) => t.openTs > 0 && t.closeTs >= t.openTs && t.closeTs - t.openTs < SCALP_MS).map((t) => kstDateKey(t.openTs))), [trades]);
  const markDays = useMemo(() => {
    const m = new Map<string, GuardMark[]>();
    for (const g of marks) { const k = kstDateKey(g.ts); m.set(k, [...(m.get(k) ?? []), g]); }
    return m;
  }, [marks]);
  const months = useMemo(() => monthList(vals), [vals]);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const ym = months[Math.min(idx, months.length - 1)];
  if (!ym) return null;

  const cells = monthDays(ym, byDate);
  const maxAbs = Math.max(0, ...cells.map((c) => Math.abs(c.pnl ?? 0)));
  const count = cells.reduce((a, c) => a + c.count, 0);
  const net = cells.reduce((a, c) => a + (c.pnl ?? 0), 0);
  const traded = cells.filter((c) => c.count > 0).length;
  const lead = cells[0]?.dow ?? 0;
  const dayTrades = sel ? trades.filter((t) => kstDateKey(t.openTs || t.closeTs) === sel).sort((a, b) => a.openTs - b.openTs) : [];
  const selCost = sel ? costs.get(sel) : undefined;
  const selMarks = sel ? markDays.get(sel) ?? [] : [];
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
  const tone = (v: number) => (v > 0 ? 'var(--warn)' : v < 0 ? 'var(--accent-ink)' : undefined);
  const [y, m] = ym.split('-');

  return (
    <section className="fin-card p-4 h-full">
      <div className="dash-h !mb-1">
        <h2>진입 · 매매 횟수</h2>
        <span className="ml-auto flex items-center">
          <button type="button" aria-label="이전 달" disabled={idx >= months.length - 1} onClick={() => { setIdx(idx + 1); setSel(null); }}
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] disabled:opacity-30">‹</button>
          <span className="text-[13px] font-bold tabular-nums text-[var(--text)]">{y}.{m}</span>
          <button type="button" aria-label="다음 달" disabled={idx === 0} onClick={() => { setIdx(idx - 1); setSel(null); }}
            className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] disabled:opacity-30">›</button>
        </span>
      </div>
      <p className="text-[11.5px] text-[var(--text-muted)] tabular-nums mb-2">
        진입 <b className="text-[var(--text)]">{count}건</b> · 매매한 날 {traded}일 · 순손익 <b style={{ color: tone(net) }}>{signed(net)}</b>
        {krw(net) && <span className="text-[var(--faint)]"> ({krw(net)})</span>}
      </p>
      <div className="grid grid-cols-7 gap-[3px] text-center">
        {WD.map((w, i) => <div key={w} className="text-[10px] font-semibold" style={{ color: i === 0 ? 'var(--warn)' : i === 6 ? 'var(--accent-ink)' : 'var(--text-muted)' }}>{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {cells.map((c) => {
          const on = sel === c.date;
          const mk = [...new Set((markDays.get(c.date) ?? []).filter((g) => g.kind !== 'scalp').map((g) => g.kind))];
          return (
            <button key={c.date} type="button" disabled={!c.count && !mk.length} onClick={() => setSel(on ? null : c.date)}
              aria-label={`${Number(m)}월 ${c.day}일${c.count ? ` 진입 ${c.count}건 순손익 ${signed(c.pnl ?? 0)}` : ' 매매 없음'}${mk.length ? ` 가드 경보 ${mk.map((k) => MARK_LABEL[k]).join('·')}` : ''}`}
              className="relative rounded-md min-h-[46px] px-0.5 py-1 flex flex-col items-center justify-start tabular-nums"
              style={{ background: bg(c.pnl, maxAbs), outline: on ? '2px solid var(--accent)' : undefined }}>
              <span className="text-[9.5px] leading-none text-[var(--text-muted)]">{c.day}</span>
              {c.count > 0 && <span className="text-[11px] font-bold leading-tight text-[var(--text)] mt-0.5">{c.count}건</span>}
              {c.count > 0 && <span className="text-[9px] leading-none text-[var(--text)] opacity-80">{c.pnl != null ? `${c.pnl > 0 ? '+' : c.pnl < 0 ? '−' : ''}${Math.round(Math.abs(c.pnl))}` : ''}</span>}
              {scalpDays.has(c.date) && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: '#ff8833' }} aria-hidden />}
              {mk.length > 0 && <span className="absolute top-0.5 left-0.5 text-[8.5px] leading-none" aria-hidden>{mk.map((k) => MARK_ICON[k]).join('')}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--faint)] mt-1.5 leading-relaxed">
        칸 = 진입 횟수 · 순손익(USDT, 정수) · <span style={{ color: '#ff8833' }}>●</span> 1시간 미만 매매 · 🛑 서킷브레이커 · 🔁 복구 매매 경고(가드 기록은 최근 약 8일)
      </p>

      {sel && (
        <div className="mt-2 rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--surface-2)] text-[11.5px] tabular-nums">
            <p className="font-bold text-[var(--text)]">{Number(sel.slice(5, 7))}월 {Number(sel.slice(8))}일 · {dayTrades.length}건</p>
            {selCost && (
              <p className="text-[var(--text-muted)] mt-0.5">
                수수료 <b style={{ color: tone(selCost.fee) }}>{signed(selCost.fee)}</b>{krw(selCost.fee) && ` (${krw(selCost.fee)})`}
                {' · '}순손익 <b style={{ color: tone(selCost.net) }}>{signed(selCost.net)}</b>{krw(selCost.net) && ` (${krw(selCost.net)})`}
              </p>
            )}
            {selMarks.length > 0 && <p className="text-[var(--text-muted)] mt-0.5">가드: {selMarks.map((g) => `${MARK_ICON[g.kind]} ${MARK_LABEL[g.kind]} ${kstTime(g.ts)}`).join(' · ')}</p>}
          </div>
          <ul>
            {dayTrades.map((t, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] tabular-nums border-t border-[var(--line-2)]">
                <span className="text-[var(--text-muted)] w-10">{t.openTs ? kstTime(t.openTs) : '—'}</span>
                <span className="font-semibold text-[var(--text)] w-10">{t.symbol.replace(/USDT$/, '')}</span>
                <span style={{ color: t.side === 'long' ? 'var(--warn)' : 'var(--accent-ink)' }}>{t.side === 'long' ? '롱' : '숏'}</span>
                <span className="text-[var(--text-muted)]">{t.openTs && t.closeTs > t.openTs ? hold(t.closeTs - t.openTs) : ''}</span>
                <span className="ml-auto text-[var(--faint)]">수수료 {fmt(Math.abs(t.fee))}</span>
                <span className="w-14 text-right font-semibold" style={{ color: tone(t.netProfit) }}>{signed(t.netProfit)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
