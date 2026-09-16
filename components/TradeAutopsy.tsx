'use client';

/**
 * 매매 심화 복기 — 진입/손절이 그 순간의 차트·이벤트에 비춰 잘 실행됐는가를 매매별로 해부하고,
 * 무엇을 어떻게 고칠지(응대방법)까지 준다.
 * ⚠ 예측이 아니다. 이벤트는 방향이 아니라 "고변동 구간이었나"라는 리스크로만 대조한다.
 * 코인 저널의 청산 매매(롱/숏, USDT 심볼)만 대상 — Bitget 히스토리 캔들로 계산.
 */
import { useMemo, useState } from 'react';
import { useCoinJournal, type JournalEntry } from '@/hooks/useCoinJournal';
import { useCustomEvents } from '@/hooks/useCustomEvents';
import { SEED_EVENTS, eventsNear, humanDelta, type MarketEvent, type NearEvent } from '@/lib/marketEvents';
import { analyzeTrade, type Autopsy, type Finding } from '@/lib/tradeAutopsy';

const DAY = 86_400_000;
const EVENT_WINDOW = 3 * DAY;   // 진입 ±3일 이벤트 대조
const FORWARD = 5 * DAY;        // 진입 후 관찰 구간(보유시각 미기록 → 근사)

const fdate = (ts: number) => new Date(ts).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const sevCls = (s: Finding['severity']) => s === 'bad' ? 'text-red-500' : s === 'warn' ? 'text-amber-600' : 'text-emerald-500';
const sevIcon = (s: Finding['severity']) => s === 'bad' ? '✗' : s === 'warn' ? '△' : '✓';

/** 이벤트 근접 → 리스크 관점 응대(방향 아님) */
function eventFindings(near: NearEvent[], entryTs: number): Finding[] {
  const out: Finding[] = [];
  const high = near.filter((e) => e.impact === 'high');
  const beforeSoon = high.find((e) => e.side === 'before' && Math.abs(e.deltaMs) <= 6 * 3_600_000);
  const afterSoon = high.find((e) => e.side === 'after' && Math.abs(e.deltaMs) <= 6 * 3_600_000);
  const during = high.find((e) => e.side === 'before' && e.ts <= entryTs + FORWARD && Math.abs(e.deltaMs) > 6 * 3_600_000);
  if (beforeSoon)
    out.push({ key: 'ev-before', severity: 'bad', title: `${beforeSoon.title} ${humanDelta(beforeSoon.deltaMs)} 전 진입 — 고영향 이벤트 직전`, fix: '이벤트 매매를 의도한 게 아니라면 신규 진입을 피하거나 수량을 절반으로. 의도했다면 손절을 넓히고(1R 유지 위해 수량↓) 스탑헌팅에 대비하세요.' });
  if (afterSoon)
    out.push({ key: 'ev-after', severity: 'warn', title: `${afterSoon.title} ${humanDelta(afterSoon.deltaMs)} 후 진입 — 이벤트 직후 급변동 구간`, fix: '이벤트 첫 반응(스파이크)에 휩쓸리지 말고, 되돌림/재확인 후 진입하면 스탑헌팅에 덜 털립니다.' });
  if (during && !beforeSoon)
    out.push({ key: 'ev-during', severity: 'warn', title: `보유 중 ${during.title} 통과 예정 — 이벤트를 포지션으로 관통`, fix: '고영향 이벤트는 갭·급변동 위험. 다음엔 이벤트 전 포지션 축소/청산 또는 손절 여유 확보를 규칙화하세요.' });
  return out;
}

function EventChips({ near }: { near: NearEvent[] }) {
  if (!near.length) return <p className="text-[11px] text-[var(--text-muted)]">진입 ±3일 내 주요 이벤트 없음</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {near.map((e, i) => {
        const after = e.side === 'after';
        const cls = e.impact === 'high' ? 'bg-amber-500/12 text-amber-600 border-amber-500/30' : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent';
        return (
          <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${cls}`} title={e.note ?? ''}>
            {e.title}
            <span className="opacity-70">· 진입 {humanDelta(e.deltaMs)} {after ? '후' : '전'}</span>
            {e.approx && <span className="opacity-60">(근사)</span>}
          </span>
        );
      })}
    </div>
  );
}

function MaeMfeBar({ mae, mfe }: { mae: number; mfe: number }) {
  const span = Math.max(1, mae + mfe);
  return (
    <div className="mt-2">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-[var(--surface-2)]">
        <div className="bg-red-500/70" style={{ width: `${(mae / span) * 100}%` }} />
        <div className="bg-emerald-500/70" style={{ width: `${(mfe / span) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums mt-0.5">
        <span className="text-red-500">역행 −{mae}R</span>
        <span className="text-emerald-500">순행 +{mfe}R</span>
      </div>
    </div>
  );
}

interface RunState { loading: boolean; autopsy?: Autopsy; error?: string }

function TradeRow({ e, near }: { e: JournalEntry; near: NearEvent[] }) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const evFindings = useMemo(() => eventFindings(near, e.ts), [near, e.ts]);

  async function analyze() {
    setRun({ loading: true });
    try {
      const end = Math.min(Date.now(), e.ts + FORWARD);
      const r = await fetch(`/api/candles?symbol=${encodeURIComponent(e.symbol)}&endTime=${end}&granularity=1H&limit=220`);
      const j = await r.json();
      if (!j.candles?.length) { setRun({ loading: false, error: j.error || '캔들 데이터 없음(심볼/기간 확인)' }); return; }
      const a = analyzeTrade(
        { entry: e.entry, stop: e.stop, target1: e.target1, direction: e.direction === 'short' ? 'short' : 'long', entryTs: e.ts, result: e.result },
        j.candles, { forwardMs: FORWARD },
      );
      setRun({ loading: false, autopsy: a });
    } catch (err) { setRun({ loading: false, error: String(err) }); }
  }

  const dirLong = e.direction !== 'short';
  const resultCls = e.result === 'win' ? 'text-emerald-500' : e.result === 'loss' ? 'text-red-500' : 'text-[var(--text-muted)]';
  const allFindings = [...(run?.autopsy?.findings ?? []), ...evFindings];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <button onClick={() => { setOpen((v) => !v); if (!open && !run) analyze(); }} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-[var(--text)]">{e.symbol.replace('USDT', '')}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${dirLong ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{dirLong ? '롱' : '숏'}</span>
          <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{fdate(e.ts)}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold tabular-nums ${resultCls}`}>{e.result === 'win' ? '익절' : e.result === 'loss' ? '손절' : e.result === 'even' ? '본전' : '진행'}{e.resultR != null ? ` ${e.resultR >= 0 ? '+' : ''}${e.resultR}R` : ''}</span>
          <svg className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeWidth={2} d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>

      {/* 이벤트 칩 — 항상 노출(캔들 없이도) */}
      <div className="mt-2"><EventChips near={near} /></div>

      {open && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-3">
          {run?.loading && <p className="text-xs text-[var(--text-muted)] animate-pulse">캔들 불러와 타이밍 분석 중…</p>}
          {run?.error && <p className="text-xs text-amber-600">타이밍 분석 실패: {run.error}</p>}
          {run?.autopsy && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[var(--surface-2)] p-2"><p className="text-[10px] text-[var(--text-muted)]">손절 폭</p><p className="text-sm font-bold text-[var(--text)] tabular-nums">{run.autopsy.stopInAtr ?? '—'} ATR</p></div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2"><p className="text-[10px] text-[var(--text-muted)]">진입 위치</p><p className="text-sm font-bold text-[var(--text)] tabular-nums">{run.autopsy.entryLocationPct == null ? '—' : `${Math.round(run.autopsy.entryLocationPct * 100)}%`}</p></div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2"><p className="text-[10px] text-[var(--text-muted)]">진입 후 최대</p><p className="text-sm font-bold text-[var(--text)] tabular-nums">{run.autopsy.maeR == null ? '—' : `−${run.autopsy.maeR}/+${run.autopsy.mfeR}R`}</p></div>
            </div>
          )}
          {run?.autopsy?.maeR != null && <MaeMfeBar mae={run.autopsy.maeR} mfe={run.autopsy.mfeR ?? 0} />}

          {/* 진단 + 응대방법 */}
          {allFindings.length > 0 ? (
            <ul className="space-y-2">
              {allFindings.map((f, i) => (
                <li key={i} className="text-xs">
                  <p className={`font-semibold ${sevCls(f.severity)}`}>{sevIcon(f.severity)} {f.title}</p>
                  {f.fix && <p className="text-[var(--text-muted)] mt-0.5 pl-4">↳ 응대: {f.fix}</p>}
                </li>
              ))}
            </ul>
          ) : run?.autopsy && <p className="text-xs text-emerald-500">이 매매는 실행 품질·이벤트 리스크에서 뚜렷한 문제가 없습니다.</p>}
          <p className="text-[10px] text-[var(--text-muted)]">진입 후 최대치는 5일 관찰창 근사값(보유 시각 미기록). 이벤트는 방향이 아니라 변동성 관점입니다.</p>
        </div>
      )}
    </div>
  );
}

function CustomEventManager() {
  const { events, add, remove, mounted } = useCustomEvents();
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState<MarketEvent['scope']>('crypto');
  if (!mounted) return null;
  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <summary className="cursor-pointer text-xs font-semibold text-[var(--text)] select-none">내 이벤트 추가 <span className="font-normal text-[var(--text-muted)]">(CLARITY 통과일 등 정확한 날짜 직접 등록 · {events.length}건)</span></summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[var(--text-muted)]">날짜/시각
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="text-[11px] text-[var(--text-muted)] flex-1 min-w-[140px]">이벤트명
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: CLARITY 상원 통과" className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="text-[11px] text-[var(--text-muted)]">범위
          <select value={scope} onChange={(e) => setScope(e.target.value as MarketEvent['scope'])} className="mt-1 block px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--text)] outline-none">
            <option value="crypto">코인</option><option value="stocks">주식</option><option value="all">전체</option>
          </select>
        </label>
        <button onClick={() => { add(date, title, scope); setTitle(''); setDate(''); }} disabled={!date || !title.trim()}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-40">추가</button>
      </div>
      {events.length > 0 && (
        <ul className="mt-2 space-y-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>{new Date(e.ts).toLocaleString('ko-KR')} · {e.title} <span className="opacity-60">({e.scope})</span></span>
              <button onClick={() => remove(e.id)} className="text-red-500 hover:underline">삭제</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function TradeAutopsy() {
  const { entries, mounted } = useCoinJournal();
  const { events: custom } = useCustomEvents();
  const allEvents = useMemo<MarketEvent[]>(() => [...SEED_EVENTS, ...custom], [custom]);

  // 대상: 청산된 롱/숏 코인 매매(USDT 심볼, 손절 있음) 최근 12건
  const trades = useMemo(() => entries
    .filter((e) => e.result !== 'open' && e.direction !== 'wait' && /USDT$/.test(e.symbol) && e.entry > 0 && e.stop > 0)
    .slice(0, 12), [entries]);

  if (!mounted) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-sm font-bold text-[var(--text)]">매매 심화 복기</h2>
        <span className="text-[11px] text-[var(--text-muted)]">진입·손절 타이밍 + 이벤트 대조 + 응대</span>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
        각 매매를 <strong className="text-[var(--text)]">손절 폭(ATR)·진입 위치·진입 후 역행/순행(MAE/MFE)</strong>으로 해부하고,
        진입 시각 주변의 <strong className="text-[var(--text)]">FOMC·CPI·법안 등 고변동 이벤트</strong>와 대조합니다.
        방향을 맞히려는 게 아니라 <strong className="text-[var(--text)]">실행이 그 순간에 적절했나</strong>를 봅니다.
      </p>

      <div className="mb-3"><CustomEventManager /></div>

      {trades.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-6 text-center">
          분석할 코인 매매가 없습니다. <strong>플래너로 손절·진입을 계획해 저장</strong>하고 결과를 채우면(코인선물 분석·거래소 대조) 여기서 매매별로 해부합니다.
        </p>
      ) : (
        <div className="space-y-2">
          {trades.map((e) => (
            <TradeRow key={e.id} e={e} near={eventsNear(e.ts, allEvents, EVENT_WINDOW, 'crypto')} />
          ))}
        </div>
      )}
    </div>
  );
}
