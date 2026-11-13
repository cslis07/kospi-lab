'use client';

/**
 * 추천 진입가 카드 — "지금 들어가면?"이 아니라 "얼마에 들어가면 좋은가"(지정가 대기 자리).
 * 계산은 lib/entryRec(가격대 근거 겹침 + 상황 점수). 매수·매도 신호 아님 — 자리에 닿아도 캔들 반응 확인 후.
 */
import { useState } from 'react';
import type { EntryRec, SideRec } from '@/lib/entryRec';
import { useCoinPriceAlerts } from '@/hooks/useCoinPriceAlerts';
import { levelsToAlerts } from '@/lib/coinPriceAlert';

const FILL_CLS: Record<SideRec['fill'], string> = {
  '높음': 'text-emerald-400', '보통': 'text-sky-400', '낮음': 'text-amber-400', '매우 낮음': 'text-red-400',
};

export type NetRR = Partial<Record<'long' | 'short', { rr1: number | null; rr2: number | null }>>;

function SideBox({ s, primary, fmt, symbol, net }: { s: SideRec; primary: boolean; fmt: (n: number) => string; symbol: string; net?: NetRR[keyof NetRR] }) {
  const long = s.side === 'long';
  const { addMany } = useCoinPriceAlerts();
  const [added, setAdded] = useState(false);
  const register = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* 무시 */ } }
    addMany(levelsToAlerts(symbol, s.side, [{ label: `추천 ${long ? '롱' : '숏'} 진입 자리`, price: long ? s.zoneHigh : s.zoneLow, kind: 'entry' }], Date.now()));
    setAdded(true);
  };
  return (
    <div className={`rounded-xl border p-3 ${long ? 'border-emerald-500/35 bg-emerald-500/[0.05]' : 'border-red-500/35 bg-red-500/[0.05]'} ${primary ? 'ring-1 ring-sky-500/60' : ''} ${s.ok ? '' : 'opacity-75'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[13px] font-extrabold ${long ? 'text-emerald-400' : 'text-red-400'}`}>{long ? '▲ 롱 대기' : '▼ 숏 대기'}</span>
        {primary && <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 font-bold">상황상 우선</span>}
        {s.deep && <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">깊은 자리만</span>}
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">도달 가능성 <b className={FILL_CLS[s.fill]}>{s.fill}</b></span>
      </div>
      <p className="mt-1.5 text-[18px] font-extrabold tabular-nums text-[var(--text)] leading-tight">
        ${fmt(s.zoneLow)} <span className="text-[var(--text-muted)] font-bold">~</span> ${fmt(s.zoneHigh)}
      </p>
      <p className="text-[10.5px] text-[var(--text-muted)] tabular-nums">
        지정가 기준 <b className="text-[var(--text)]">${fmt(s.entry)}</b> · 현재가에서 {long ? '−' : '+'}{s.distPct.toFixed(2)}%
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11.5px] tabular-nums">
        <span className="text-[var(--text-muted)]">손절 <b className="text-red-400">${fmt(s.stop)}</b> <span className="text-[10px]">({s.stopPct.toFixed(2)}%)</span></span>
        <span className="text-[var(--text-muted)]">손익비 <b className={s.rr2 >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}>{s.rr1.toFixed(1)} / {s.rr2.toFixed(1)}</b></span>
        <span className="text-[var(--text-muted)]">목표1 <b className="text-emerald-400">${fmt(s.target1)}</b></span>
        <span className="text-[var(--text-muted)]">목표2 <b className="text-emerald-400">${fmt(s.target2)}</b></span>
      </div>
      {net && net.rr1 != null && (
        <p className="text-[10.5px] text-[var(--text-muted)] tabular-nums mt-0.5">
          비용 반영 손익비 <b className={(net.rr1 ?? 0) >= 1.6 ? 'text-emerald-400' : 'text-amber-400'}>{net.rr1.toFixed(2)} / {net.rr2 == null ? '—' : net.rr2.toFixed(2)}</b>
          <span> (수수료·슬리피지·펀딩 차감 — 위 손익비는 비용 전)</span>
        </p>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {s.basis.map((b) => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] border border-[var(--border)] text-[var(--text)]">{b}</span>)}
      </div>
      <ul className="mt-2 space-y-1">
        {s.scenarios.map((c) => (
          <li key={c.kind} className="text-[10.5px] leading-snug text-[var(--text-muted)] flex gap-1.5">
            <span className={`shrink-0 font-bold ${c.kind === 'base' ? 'text-sky-400' : c.kind === 'fail' ? 'text-red-400' : 'text-amber-400'}`}>
              {c.kind === 'base' ? '닿으면' : c.kind === 'fail' ? '깨지면' : '안 오면'}
            </span>
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`text-[10px] ${s.ok ? 'text-[var(--text-muted)]' : 'text-amber-400 font-semibold'}`}>{s.note}</span>
        {s.ok && (
          <button type="button" onClick={register} disabled={added}
            className="ml-auto px-2 py-1 rounded-lg border border-sky-500/40 bg-sky-500/10 text-[11px] font-semibold text-sky-400 hover:bg-sky-500/15 disabled:opacity-60">
            {added ? '알림 등록됨' : '🔔 자리 도달 알림'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function EntryRecCard({ rec, fmt, symbol, net }: { rec: EntryRec; fmt: (n: number) => string; symbol: string; net?: NetRR }) {
  const [why, setWhy] = useState(false);
  const order: SideRec[] = [rec.long, rec.short].filter((x): x is SideRec => !!x)
    .sort((a, b) => (a.side === rec.primary ? -1 : b.side === rec.primary ? 1 : 0));
  const tilt = rec.ctxScore >= 1.5 ? { t: `롱 유리 +${rec.ctxScore}`, c: 'text-emerald-400' }
    : rec.ctxScore <= -1.5 ? { t: `숏 유리 ${rec.ctxScore}`, c: 'text-red-400' }
    : { t: `한쪽으로 기울지 않음 ${rec.ctxScore > 0 ? '+' : ''}${rec.ctxScore}`, c: 'text-amber-400' };
  return (
    <div className="rounded-xl border border-sky-500/40 bg-sky-500/[0.04] p-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-extrabold text-[var(--text)]">📍 추천 진입가</span>
        <span className="text-[10.5px] text-[var(--text-muted)]">기다릴 자리(지정가)</span>
        <button type="button" onClick={() => setWhy((w) => !w)} className="ml-auto text-[10.5px] font-semibold">
          <span className="text-[var(--text-muted)]">상황 </span><span className={tilt.c}>{tilt.t}</span>
          <span className="text-[var(--text-muted)]"> {why ? '▴' : '▾'}</span>
        </button>
      </div>
      {why && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-2">
          {rec.factors.length ? rec.factors.map((f) => (
            <p key={f.text} className="text-[10.5px] flex justify-between gap-2 tabular-nums">
              <span className="text-[var(--text)]">{f.text}</span>
              <span className={f.v > 0 ? 'text-emerald-400' : 'text-red-400'}>{f.v > 0 ? `롱 +${f.v}` : `숏 ${f.v}`}</span>
            </p>
          )) : <p className="text-[10.5px] text-[var(--text-muted)]">한쪽으로 기울게 하는 근거가 없습니다.</p>}
          <p className="text-[9.5px] text-[var(--text-muted)] mt-1">엔진 방향·4H/1D 추세·뉴스 제목 호재/악재·펀딩비·롱숏비·공포탐욕·거시·체결 강도를 합산. 불리한 쪽은 더 깊은 자리(1H ATR 1배 이상)만 고릅니다.</p>
        </div>
      )}
      {rec.eventWait && <p className="mt-2 text-[10.5px] font-semibold text-amber-400">⚠ {rec.eventWait}</p>}
      {rec.primary == null && <p className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">방향이 뚜렷하지 않아 양쪽 자리를 모두 보여줍니다 — 먼저 닿고 반응이 나오는 쪽만.</p>}
      <div className="grid gap-2 mt-2 md:grid-cols-2">
        {order.map((s) => <SideBox key={s.side} s={s} primary={rec.primary === s.side} fmt={fmt} symbol={symbol} net={net?.[s.side]} />)}
      </div>
      {!order.length && <p className="mt-2 text-[11px] text-[var(--text-muted)]">근거가 겹친 가격대가 가까이에 없습니다 — 다음 분석 때 다시 계산합니다.</p>}
      <p className="text-[9.5px] text-[var(--text-muted)] mt-2 leading-snug">
        지지·저항·24h 고저·피보·SMC·EMA(15m·1H·4H)·VWAP·볼린저·호가벽·라운드 넘버가 겹친 가격대를 고르고, 반대편 가격대로 목표를 잡았습니다. 자리에 닿아도 캔들 반응 확인 후 진입 — 매수·매도 신호가 아닙니다(엔진 방향 적중 49.7%).
      </p>
    </div>
  );
}
