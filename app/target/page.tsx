'use client';

/**
 * 목표 수익률 시스템 — 예측 없이 산수로 "월 X%"에 접근한다.
 * ① 역산: 목표 → 필요한 회당 기대값(R)   ② 실측 대조: 내 저널의 진짜 기대값과 비교
 * ③ 레버: 무엇을 얼마나 바꿔야 하는지     ④ 누수: 수익을 갉아먹는 5가지 계량
 * ⑤ 진행률: 이달 실현손익(정직하게)       ⑥ 신호 실측 엣지: 크론이 추적한 승률·R이 있는 신호만 채택
 * "무조건 수익" 버튼은 없다 — 이 앱의 실측에서 방향 예측 우위가 확인되지 않았다.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { useTargetPlan } from '@/hooks/useTargetPlan';
import { measureEdge, assessTarget, monthToDate, neededTrades, HARD_MAX_RISK_PCT, type EdgeRow } from '@/lib/targetPlan';
import { computeLeakage, type LeakRow } from '@/lib/leakage';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const SIGNALS_URL = 'https://raw.githubusercontent.com/cslis07/kospi-lab/data/data/coin-signals.json';
const num = (v: string) => { const x = Number(String(v).replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const fR = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);
const fPct = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const fUsd = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

interface ActivityResp { configured?: boolean; bills?: { ts: number; businessType: string; size: number; fees: number }[]; fills?: { ts: number; fee: number }[] }
interface SignalsResp { updated?: string; open?: unknown[]; closed?: { mode: string; closeTs: number }[]; stats?: Record<string, { n: number; winRate: number | null; avgR: number | null }> }

/* 숫자 입력 — 반드시 모듈 레벨(렌더 안에 두면 매 입력마다 리마운트→포커스 유실) */
function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
      <div className="mt-1 flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] focus-within:border-[var(--accent)]">
        <input inputMode="decimal" defaultValue={value} key={value}
          onBlur={(e) => onChange(num(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-[var(--text)] outline-none tabular-nums" />
        {suffix && <span className="pr-3 text-xs text-[var(--text-muted)]">{suffix}</span>}
      </div>
    </label>
  );
}
function Card({ title, sub, children, tone }: { title: string; sub?: string; children: React.ReactNode; tone?: 'accent' | 'warn' | 'ok' }) {
  const border = tone === 'accent' ? 'border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]'
    : tone === 'warn' ? 'border border-red-500/40 bg-red-500/[0.06]'
    : tone === 'ok' ? 'border border-emerald-500/40 bg-emerald-500/[0.06]'
    : 'border border-[var(--border)] bg-[var(--bg-card)]';
  return (
    <section className={`rounded-2xl p-4 ${border}`}>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        {sub && <span className="text-[11px] text-[var(--text-muted)]">{sub}</span>}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' | 'accent' }) {
  const c = tone === 'ok' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : tone === 'accent' ? 'text-[var(--accent)]' : 'text-[var(--text)]';
  return (
    <div className="rounded-xl bg-[var(--surface-2)] p-2.5 text-center">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className={`text-base font-bold tabular-nums leading-tight ${c}`}>{value}</p>
    </div>
  );
}

const STATUS_UI = {
  unknown:   { tone: undefined,        label: '표본 부족',                       text: '계획(손절·사이징)을 적고 결과를 채운 매매가 10건 넘어야 판정합니다. 플래너로 기록하세요.' },
  negative:  { tone: 'warn' as const,  label: '도달 불가 — 기대값이 음수',        text: '지금 방식으로는 매매를 늘릴수록 더 잃습니다. 목표 이전에 손절 규율과 누수부터 잡아야 합니다.' },
  gap:       { tone: 'warn' as const,  label: '부족 — 아래 레버 중 하나를 움직여야 함', text: '기대값이 플러스지만 목표엔 못 미칩니다. 실현 가능한 레버(✓)를 고르세요.' },
  'on-track':{ tone: 'ok' as const,    label: '충족 — 현재 조건 유지 시 도달 가능', text: '기대값이 필요치를 넘습니다. 남은 건 규칙을 어기지 않는 것(누수 0)입니다.' },
};

export default function TargetPage() {
  const coin = useCoinJournal();
  const stock = useStockJournal();
  const { settings: s, update, mounted } = useTargetPlan();
  const { data: act } = useSWR<ActivityResp>('/api/bitget/activity', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const { data: sig } = useSWR<SignalsResp>(SIGNALS_URL, fetcher, { refreshInterval: 600000, revalidateOnFocus: false });

  const rows = useMemo<EdgeRow[]>(() => [...coin.entries, ...stock.entries] as unknown as EdgeRow[], [coin.entries, stock.entries]);
  const edge = useMemo(() => measureEdge(rows), [rows]);
  const a = useMemo(() => assessTarget(s, edge), [s, edge]);
  const mtd = useMemo(() => monthToDate(coin.entries as unknown as EdgeRow[], s.seedUsdt), [coin.entries, s.seedUsdt]);

  // 누수 — 이달 기준. 수수료·펀딩은 비트겟 활동에서(설정돼 있을 때만)
  const leak = useMemo(() => {
    const d = new Date(); const since = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const fees = (act?.fills ?? []).filter((f) => f.ts >= since).reduce((x, f) => x + Math.abs(f.fee || 0), 0)
      + (act?.bills ?? []).filter((b) => b.ts >= since).reduce((x, b) => x + Math.abs(b.fees || 0), 0);
    const funding = (act?.bills ?? []).filter((b) => b.ts >= since && /fund/i.test(b.businessType) && b.size < 0).reduce((x, b) => x + Math.abs(b.size), 0);
    return computeLeakage(coin.entries as unknown as LeakRow[], { seed: s.seedUsdt, defaultRiskPct: s.riskPct, sinceTs: since, fees, funding });
  }, [coin.entries, act, s.seedUsdt, s.riskPct]);

  const targetUsdt = (s.seedUsdt * s.monthlyTargetPct) / 100;
  const progress = targetUsdt > 0 ? Math.max(0, Math.min(100, (mtd.realizedUsdt / targetUsdt) * 100)) : 0;
  const ui = STATUS_UI[a.status];

  // 신호 실측 엣지 — 크론이 TP/SL로 판정한 실측 통계만 사용. 채택 기준: n≥30 & avgR>0
  const modes = (['scalp', 'swing'] as const).map((m) => {
    const st = sig?.stats?.[m];
    const closed30 = (sig?.closed ?? []).filter((c) => c.mode === m && Date.now() - c.closeTs <= 30 * 86_400_000).length;
    const adopt = !!st && st.n >= 30 && (st.avgR ?? 0) > 0;
    const need = adopt && st?.avgR ? neededTrades(s.monthlyTargetPct, s.riskPct, st.avgR) : null;
    return { m, st, closed30, adopt, need };
  });

  if (!mounted) return null;
  return (
    <div className="max-w-2xl mx-auto pb-16 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[var(--text)] mb-1">목표 수익률 시스템</h1>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          월 목표를 <strong className="text-[var(--text)]">기대값 × 빈도 × 리스크</strong>로 역산하고 내 실측과 대조합니다.
          방향을 맞히는 기능이 아닙니다 — 이 앱의 실측에서 예측 우위는 확인되지 않았습니다.
        </p>
      </div>

      <Card title="목표 설정" sub="입력 후 Enter 또는 포커스 아웃">
        <div className="grid grid-cols-2 gap-3">
          <Field label="시드 (USDT)" value={s.seedUsdt} onChange={(v) => update({ seedUsdt: Math.max(0, v) })} suffix="USDT" />
          <Field label="월 목표 수익률" value={s.monthlyTargetPct} onChange={(v) => update({ monthlyTargetPct: Math.max(0, v) })} suffix="%" />
          <Field label="회당 리스크" value={s.riskPct} onChange={(v) => update({ riskPct: Math.min(HARD_MAX_RISK_PCT, Math.max(0.1, v)) })} suffix="%" />
          <Field label="월 예상 매매 수" value={s.tradesPerMonth} onChange={(v) => update({ tradesPerMonth: Math.max(1, Math.round(v)) })} suffix="회" />
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-2">회당 리스크는 {HARD_MAX_RISK_PCT}%가 상한입니다(플래너에서도 강제). 그 위는 목표가 아니라 드로다운을 키웁니다.</p>
      </Card>

      <Card title="역산 결과" sub="목표 달성에 필요한 회당 기대값" tone="accent">
        <p className="text-3xl font-bold text-[var(--accent)] tabular-nums">{fR(a.requiredR)}</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          월 {s.monthlyTargetPct}% = 회당 {s.riskPct}% 리스크 × <strong className="text-[var(--text)]">{fR(a.requiredR)}</strong> × {s.tradesPerMonth}회
          → 목표 금액 <strong className="text-[var(--text)]">${fUsd(targetUsdt)}</strong>
        </p>
      </Card>

      <Card title="내 실측과 대조" sub="계획(R) 기록 매매만 — 모르는 건 0으로 세지 않음" tone={ui.tone}>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <Stat label="실측 기대값" value={fR(a.actualR)} tone={a.actualR == null ? undefined : a.actualR >= a.requiredR ? 'ok' : 'bad'} />
          <Stat label="승률" value={edge.winRate == null ? '—' : `${edge.winRate.toFixed(0)}%`} />
          <Stat label="익절/손절 R" value={edge.avgWinR == null || edge.avgLossR == null ? '—' : `${edge.avgWinR.toFixed(1)}/${edge.avgLossR.toFixed(1)}`} />
          <Stat label="예상 월수익" value={fPct(a.projectedPct)} tone={a.projectedPct == null ? undefined : a.projectedPct >= s.monthlyTargetPct ? 'ok' : 'bad'} />
        </div>
        <p className="text-sm font-semibold text-[var(--text)]">{ui.label}{a.status === 'unknown' && ` (R 기록 ${edge.rCount}건 / 10건 필요)`}</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">{ui.text}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1">R 표본 {edge.rCount}건 · 최근 30일 청산 {edge.tradesLast30d}건(빈도 실측)</p>
      </Card>

      {a.levers.length > 0 && a.status !== 'on-track' && (
        <Card title="무엇을 바꿔야 하나" sub="하나만 움직여도 목표에 닿는 값 · ✓ = 현실적">
          <ul className="space-y-2">
            {a.levers.map((l) => (
              <li key={l.key} className="flex items-center justify-between text-sm rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <span className="text-[var(--text)]"><span className={l.feasible ? 'text-emerald-500' : 'text-red-500'}>{l.feasible ? '✓' : '✗'}</span> {l.label}</span>
                <span className="tabular-nums text-[var(--text-muted)]">{l.from} → <strong className="text-[var(--text)]">{l.to}</strong>{l.note && <span className="text-[10px] ml-1.5">({l.note})</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="이달 수익 누수" sub={`총 -$${fUsd(leak.totalUsdt)} = 시드의 ${leak.pctOfSeed.toFixed(2)}%`} tone={leak.pctOfSeed >= 2 ? 'warn' : undefined}>
        <ul className="space-y-1.5">
          {leak.items.map((i) => (
            <li key={i.key} className="flex items-center justify-between text-xs">
              <span className="text-[var(--text)]">{i.label}{i.count ? <span className="text-[var(--text-muted)]"> · {i.count}건</span> : ''}<span className="block text-[10px] text-[var(--text-muted)]">{i.note}</span></span>
              <span className={`tabular-nums font-semibold ${i.usdt > 0 ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>-${fUsd(i.usdt)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--text)] mt-3">
          누수를 0으로 만들면 이달 수익률 <strong className="text-[var(--accent)]">{fPct(mtd.pct + leak.pctOfSeed, 2)}</strong> — 누수 제거는 예측 없이 확보하는 수익입니다.
          {act && act.configured === false && <span className="block text-[10px] text-[var(--text-muted)] mt-1">수수료·펀딩은 비트겟 API 키가 있어야 계량됩니다.</span>}
        </p>
      </Card>

      <Card title="이달 진행률" sub="실현손익 입력 건 기준 · 정직하게">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className={`text-2xl font-bold tabular-nums ${mtd.realizedUsdt >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fPct(mtd.pct, 2)}</span>
          <span className="text-xs text-[var(--text-muted)] tabular-nums">${fUsd(mtd.realizedUsdt)} / ${fUsd(targetUsdt)} · {mtd.trades}건 (손익 입력 {mtd.realizedCount})</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div className={`h-full rounded-full ${mtd.realizedUsdt >= 0 ? 'bg-[var(--accent)]' : 'bg-red-500'}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-1.5">R 합 {fR(mtd.rSum)} · 거래소 대조로 손익을 채우면 정확해집니다 (<Link href="/journal" className="text-[var(--accent)] hover:underline">매매일지</Link>)</p>
      </Card>

      <Card title="신호 실측 엣지" sub="크론이 TP/SL로 자동 판정한 통계 — 채택 기준 n≥30 & 기대값>0">
        {!sig ? <p className="text-xs text-[var(--text-muted)]">실측 데이터 불러오는 중…</p> : (
          <div className="space-y-2">
            {modes.map(({ m, st, closed30, adopt, need }) => (
              <div key={m} className={`rounded-xl px-3 py-2.5 ${adopt ? 'bg-emerald-500/[0.08] border border-emerald-500/30' : 'bg-[var(--surface-2)]'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[var(--text)]">{m.toUpperCase()} <span className="text-[10px] font-normal text-[var(--text-muted)]">최근30일 {closed30}회 · 누적 {st?.n ?? 0}건</span></span>
                  <span className={`text-[11px] font-semibold ${adopt ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>{adopt ? '채택 가능' : (st?.n ?? 0) < 30 ? '표본 부족' : '실측 엣지 없음'}</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                  승률 {st?.winRate ?? '—'}% · 기대값 {fR(st?.avgR ?? null)}
                  {adopt && need != null && <> · 이 신호만으로 목표 달성엔 월 <strong className="text-[var(--text)]">{need}회</strong> 필요(실측 빈도 {closed30}회)</>}
                </p>
              </div>
            ))}
            <p className="text-[10px] text-[var(--text-muted)]">
              채택 가능이어도 <strong>신호는 진입 후보일 뿐</strong>입니다. 플래너로 손절·사이징을 정하고 저널에 남긴 매매만 목표 계산에 들어갑니다.
              {sig.updated && <> · 갱신 {new Date(sig.updated).toLocaleString('ko-KR')}</>}
            </p>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
        규칙 강제: <Link href="/planner" className="text-[var(--accent)] hover:underline">플래너</Link>는 서킷브레이커 작동·회당 리스크 {HARD_MAX_RISK_PCT}% 초과 시 저장을 잠급니다.
        수익률은 보장되지 않으며 투자 손실의 책임은 본인에게 있습니다.
      </p>
    </div>
  );
}
