'use client';

/**
 * 프리트레이드 플래너 — 진입 전에 손절·사이징·청산가·1R을 먼저 정하고,
 * 그대로 "계획 매매"로 저널에 저장한다. 이 앱의 본질(방향이 아니라 규율)에 맞춘 도구.
 * 저장은 useCoinJournal(계획 기록만 R 환산)로 흘려보낸다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import { useTargetPlan } from '@/hooks/useTargetPlan';
import { evaluateBreaker, type BreakerEntry } from '@/lib/circuitBreaker';
import { HARD_MAX_RISK_PCT } from '@/lib/targetPlan';

const n = (v: string) => { const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const fmt = (x: number, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d });

/* 숫자 입력 필드 — 반드시 모듈 레벨에 둔다(렌더 함수 안에 두면 매 입력마다 리마운트→포커스 유실) */
function Field({ label, value, onChange, suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
      <div className="mt-1 flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] focus-within:border-[var(--accent)] transition-colors">
        <input inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-[var(--text)] outline-none tabular-nums" />
        {suffix && <span className="pr-3 text-xs text-[var(--text-muted)]">{suffix}</span>}
      </div>
    </label>
  );
}

export default function PlannerPage() {
  const journal = useCoinJournal();
  const { add } = journal;
  const { limits } = useRiskLimits();
  const { settings: target } = useTargetPlan();

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [dir, setDir] = useState<'long' | 'short'>('long');
  const [seed, setSeed] = useState('1000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [lev, setLev] = useState('5');
  const [saved, setSaved] = useState(false);

  const c = useMemo(() => {
    const seedV = n(seed), riskV = n(riskPct), entryV = n(entry), stopV = n(stop), levV = Math.max(1, n(lev));
    const riskAmt = seedV * riskV / 100;               // 1R (USDT)
    const stopFrac = entryV > 0 ? Math.abs(entryV - stopV) / entryV : 0;
    const notion = stopFrac > 0 ? riskAmt / stopFrac : 0; // 손절 시 정확히 1R 잃도록
    const qty = entryV > 0 ? notion / entryV : 0;
    const margin = notion / levV;
    // 청산가 근사(격리, 수수료·유지증거금 무시) — 실제는 이보다 조금 앞
    const liq = dir === 'long' ? entryV * (1 - 1 / levV) : entryV * (1 + 1 / levV);
    const rr = (tp: number) => (stopFrac > 0 && entryV > 0)
      ? Math.abs(tp - entryV) / Math.abs(entryV - stopV) : 0;
    // 유효성/경고
    const dirOk = entryV > 0 && stopV > 0 && (dir === 'long' ? stopV < entryV : stopV > entryV);
    const liqBeforeStop = dir === 'long' ? liq >= stopV : liq <= stopV; // 손절 전에 청산되면 위험
    const cantAfford = margin > seedV && seedV > 0;
    return { seedV, riskAmt, stopFrac, notion, qty, margin, liq, rr, dirOk, liqBeforeStop, cantAfford, levV };
  }, [seed, riskPct, entry, stop, lev, dir]);

  const ready = c.dirOk && c.notion > 0;

  // 규칙 강제 — 목표 수익률 시스템: 서킷브레이커 작동·회당 리스크 상한 초과면 저장 잠금
  const lock = useMemo(() => {
    const reasons: string[] = [];
    const br = evaluateBreaker(journal.entries as unknown as BreakerEntry[], limits);
    if (br.status === 'blocked') reasons.push(...br.reasons.map((r) => `서킷브레이커: ${r}`));
    const rp = n(riskPct);
    if (rp > HARD_MAX_RISK_PCT) reasons.push(`회당 리스크 ${rp}%는 상한 ${HARD_MAX_RISK_PCT}% 초과 — 목표가 아니라 드로다운을 키웁니다.`);
    else if (rp > target.riskPct) reasons.push(`목표 계획(회당 ${target.riskPct}%)보다 큰 리스크입니다. 계획을 지키세요.`);
    const hard = br.status === 'blocked' || rp > HARD_MAX_RISK_PCT;
    return { blocked: hard, reasons };
  }, [journal.entries, limits, riskPct, target.riskPct]);

  function savePlan() {
    if (!ready || lock.blocked) return;
    add({
      ts: Date.now(),
      symbol: symbol.trim().toUpperCase() || 'BTCUSDT',
      name: symbol.trim().toUpperCase() || 'BTCUSDT',
      direction: dir,
      state: 'PLAN',
      score: 0,
      price: n(entry),
      entry: n(entry),
      stop: n(stop),
      target1: n(t1),
      target2: n(t2),
      leverage: c.levV,
      reasonsTop: ['프리트레이드 플래너 계획'],
      seedUsdt: c.seedV,
      riskPct: n(riskPct),
      notionUsdt: c.notion,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  }

  return (
    <div className="max-w-lg mx-auto pb-16">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">프리트레이드 플래너</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        진입 전에 <strong className="text-[var(--text)]">손절·사이징·청산가·1R</strong>을 먼저 정합니다.
        방향 판단은 사용자 몫 — 이 도구는 <strong className="text-[var(--text)]">얼마를, 어디서 자를지</strong>만 계산합니다.
      </p>

      {/* 입력 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
        <div className="flex gap-2">
          <label className="flex-1 block">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">종목</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
          </label>
          <div className="shrink-0">
            <span className="text-[11px] font-semibold text-[var(--text-muted)]">방향</span>
            <div className="mt-1 flex rounded-xl border border-[var(--border)] overflow-hidden">
              {(['long', 'short'] as const).map((d) => (
                <button key={d} type="button" onClick={() => setDir(d)}
                  className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                    dir === d
                      ? (d === 'long' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white')
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                  }`}>
                  {d === 'long' ? '롱' : '숏'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="시드 (USDT)" value={seed} onChange={setSeed} suffix="USDT" />
          <Field label="1회 허용손실" value={riskPct} onChange={setRiskPct} suffix="%" />
          <Field label="진입가" value={entry} onChange={setEntry} placeholder="0" />
          <Field label="손절가" value={stop} onChange={setStop} placeholder="0" />
          <Field label="목표가 1 (선택)" value={t1} onChange={setT1} placeholder="0" />
          <Field label="목표가 2 (선택)" value={t2} onChange={setT2} placeholder="0" />
          <Field label="레버리지" value={lev} onChange={setLev} suffix="x" />
        </div>
      </div>

      {/* 결과 */}
      {ready ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4">
            <p className="text-[11px] text-[var(--text-muted)] mb-1">권장 진입 규모 (손절 시 정확히 1R 손실)</p>
            <p className="text-2xl font-bold text-[var(--accent)] tabular-nums">{fmt(c.qty, 6)} <span className="text-sm">계약</span></p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums">
              <span className="text-[var(--text-muted)]">계획 노션 <strong className="text-[var(--text)]">${fmt(c.notion)}</strong></span>
              <span className="text-[var(--text-muted)]">필요 증거금 <strong className="text-[var(--text)]">${fmt(c.margin)}</strong></span>
              <span className="text-[var(--text-muted)]">1R (허용손실) <strong className="text-[var(--text)]">${fmt(c.riskAmt)}</strong></span>
              <span className="text-[var(--text-muted)]">손절 거리 <strong className="text-[var(--text)]">{fmt(c.stopFrac * 100)}%</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">청산가 (근사)</p>
              <p className="text-lg font-bold text-[var(--text)] tabular-nums">${fmt(c.liq)}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{c.levV}x · 격리 기준</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">손익비 (R:R)</p>
              <p className="text-sm font-bold text-[var(--text)] tabular-nums">
                {n(t1) > 0 ? `T1 ${fmt(c.rr(n(t1)), 1)}R` : '—'}
                {n(t2) > 0 ? ` · T2 ${fmt(c.rr(n(t2)), 1)}R` : ''}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">목표까지 몇 배 R</p>
            </div>
          </div>

          {/* 경고 */}
          {(c.liqBeforeStop || c.cantAfford) && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 space-y-1">
              {c.liqBeforeStop && (
                <p className="text-xs text-red-500 font-semibold">⚠ 청산가가 손절가보다 가깝습니다 — 손절 전에 청산될 수 있어요. 레버리지를 낮추세요.</p>
              )}
              {c.cantAfford && (
                <p className="text-xs text-red-500 font-semibold">⚠ 필요 증거금(${fmt(c.margin)})이 시드(${fmt(c.seedV)})를 초과합니다.</p>
              )}
            </div>
          )}

          {lock.reasons.length > 0 && (
            <div className={`rounded-xl p-3 space-y-1 ${lock.blocked ? 'border border-red-500/40 bg-red-500/10' : 'border border-amber-500/40 bg-amber-500/10'}`}>
              {lock.reasons.map((r, i) => <p key={i} className={`text-xs font-semibold ${lock.blocked ? 'text-red-500' : 'text-amber-600'}`}>{lock.blocked ? '🛑' : '⚠'} {r}</p>)}
              <p className="text-[10px] text-[var(--text-muted)]">규칙은 <Link href="/target" className="underline">목표 수익률 시스템</Link>·매매일지 서킷브레이커에서 정합니다.</p>
            </div>
          )}
          <button type="button" onClick={savePlan} disabled={lock.blocked}
            className="w-full rounded-2xl bg-[var(--accent)] text-white font-semibold py-3.5 text-sm active:scale-[.99] transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
            {lock.blocked ? '규칙 위반 — 저장 잠김' : '이 계획을 저널에 저장'}
          </button>
          {saved && (
            <p className="text-center text-xs text-emerald-500 font-semibold">
              저장됐습니다 · <Link href="/journal" className="underline">매매일지에서 보기 →</Link>
            </p>
          )}
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            저장한 계획은 <Link href="/journal" className="text-[var(--accent)] hover:underline">매매일지</Link>에서 실제 결과와 대조돼 승률·기대값(R)으로 환산됩니다.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-[var(--text-muted)] py-6">
          진입가·손절가를 입력하면 사이징·청산가·손익비가 계산됩니다.
          {entry && stop && !c.dirOk && <><br /><span className="text-red-500">{dir === 'long' ? '롱은 손절가가 진입가보다 낮아야 합니다.' : '숏은 손절가가 진입가보다 높아야 합니다.'}</span></>}
        </p>
      )}

      <p className="mt-6 text-[11px] text-[var(--text-muted)] leading-relaxed opacity-70">
        * 청산가는 격리·수수료 제외 근사값이며 거래소 실제값과 다를 수 있습니다. 참고용이며 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
