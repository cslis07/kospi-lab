'use client';

/**
 * 진입·매매 횟수 달력 — 복기 대시보드(/review) 가운데 줄 왼쪽. 칸마다 그날(KST, 진입 시각 기준) 진입 횟수 + 순손익,
 * 배경색 = 순손익(이익 빨강 · 손실 파랑, 짙기는 그 달 최대 대비), 1시간 미만 매매가 섞인 날은 주황 점.
 * 칸을 누르면 그날 매매 목록이 달력 아래 펼쳐진다. 계산은 lib/journalAnalytics(aggregateDaily·monthDays — 테스트 고정).
 */
import { useMemo, useState } from 'react';
import { aggregateDaily, monthDays, monthList, kstDateKey } from '@/lib/journalAnalytics';

export interface CalTrade { symbol: string; side: 'long' | 'short'; openTs: number; closeTs: number; netProfit: number }

const UP = '255,68,51', DOWN = '28,108,255';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const SCALP_MS = 3_600_000;
const bg = (pnl: number | null, maxAbs: number) => {
  if (pnl == null || pnl === 0) return 'var(--surface-2)';
  const t = maxAbs > 0 ? Math.min(1, Math.abs(pnl) / maxAbs) : 0.5;
  return `rgba(${pnl > 0 ? UP : DOWN},${(0.14 + t * 0.6).toFixed(2)})`;
};
const kstTime = (ts: number) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
const hold = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}`; };

export default function TradeCalendar({ trades, fmt, krw }: { trades: CalTrade[]; fmt: (n: number) => string; krw: (usdt: number) => string | null }) {
  const vals = useMemo(() => trades.map((t) => ({ ts: t.openTs || t.closeTs, value: t.netProfit })), [trades]);
  const byDate = useMemo(() => aggregateDaily(vals), [vals]);
  const scalpDays = useMemo(() => new Set(trades.filter((t) => t.openTs > 0 && t.closeTs - t.openTs < SCALP_MS).map((t) => kstDateKey(t.openTs))), [trades]);
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
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
  const [y, m] = ym.split('-');

  return (
    <section className="fin-card p-3.5 h-full">
      <div className="flex items-center gap-1">
        <h2 className="text-sm font-bold text-[var(--text)] mr-auto">진입 · 매매 횟수</h2>
        <button type="button" aria-label="이전 달" disabled={idx >= months.length - 1} onClick={() => { setIdx(idx + 1); setSel(null); }}
          className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] disabled:opacity-30">‹</button>
        <span className="text-[13px] font-semibold tabular-nums text-[var(--text)]">{y}.{m}</span>
        <button type="button" aria-label="다음 달" disabled={idx === 0} onClick={() => { setIdx(idx - 1); setSel(null); }}
          className="w-8 h-8 grid place-items-center rounded-lg text-[var(--text-muted)] disabled:opacity-30">›</button>
      </div>
      <p className="text-[11.5px] text-[var(--text-muted)] tabular-nums mb-2">
        진입 <b className="text-[var(--text)]">{count}건</b> · 매매한 날 {traded}일 · 순손익 <b style={{ color: net > 0 ? 'var(--warn)' : net < 0 ? 'var(--accent-ink)' : undefined }}>{signed(net)}</b>
        {krw(net) && <span className="text-[var(--faint)]"> ({krw(net)})</span>}
      </p>
      <div className="grid grid-cols-7 gap-[3px] text-center">
        {WD.map((w, i) => <div key={w} className="text-[10px] font-semibold" style={{ color: i === 0 ? 'var(--warn)' : i === 6 ? 'var(--accent-ink)' : 'var(--text-muted)' }}>{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} />)}
        {cells.map((c) => {
          const on = sel === c.date;
          return (
            <button key={c.date} type="button" disabled={!c.count} onClick={() => setSel(on ? null : c.date)}
              aria-label={`${Number(m)}월 ${c.day}일${c.count ? ` 진입 ${c.count}건 순손익 ${signed(c.pnl ?? 0)}` : ' 매매 없음'}`}
              className="relative rounded-md min-h-[44px] px-0.5 py-1 flex flex-col items-center justify-start tabular-nums"
              style={{ background: bg(c.pnl, maxAbs), outline: on ? '2px solid var(--accent)' : undefined }}>
              <span className="text-[9.5px] leading-none text-[var(--text-muted)]">{c.day}</span>
              {c.count > 0 && <span className="text-[11px] font-bold leading-tight text-[var(--text)] mt-0.5">{c.count}건</span>}
              {c.count > 0 && <span className="text-[9px] leading-none text-[var(--text)] opacity-80">{c.pnl != null ? `${c.pnl > 0 ? '+' : c.pnl < 0 ? '−' : ''}${Math.round(Math.abs(c.pnl))}` : ''}</span>}
              {scalpDays.has(c.date) && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warn)' }} aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--faint)] mt-1.5">칸 = 진입 횟수 · 순손익(USDT, 정수) · <span style={{ color: 'var(--warn)' }}>●</span> 1시간 미만 매매가 있던 날 · 진입 시각(KST) 기준</p>

      {sel && dayTrades.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--border)] overflow-hidden">
          <p className="px-3 py-1.5 text-[11.5px] font-semibold text-[var(--text)] bg-[var(--surface-2)]">{Number(sel.slice(5, 7))}월 {Number(sel.slice(8))}일 · {dayTrades.length}건</p>
          <ul>
            {dayTrades.map((t, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px] tabular-nums border-t border-[var(--line-2)]">
                <span className="text-[var(--text-muted)] w-10">{t.openTs ? kstTime(t.openTs) : '—'}</span>
                <span className="font-semibold text-[var(--text)] w-10">{t.symbol.replace(/USDT$/, '')}</span>
                <span style={{ color: t.side === 'long' ? 'var(--warn)' : 'var(--accent-ink)' }}>{t.side === 'long' ? '롱' : '숏'}</span>
                <span className="text-[var(--text-muted)]">{t.openTs && t.closeTs > t.openTs ? hold(t.closeTs - t.openTs) : ''}</span>
                <span className="ml-auto font-semibold" style={{ color: t.netProfit > 0 ? 'var(--warn)' : t.netProfit < 0 ? 'var(--accent-ink)' : undefined }}>{signed(t.netProfit)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
