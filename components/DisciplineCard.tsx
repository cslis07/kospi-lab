'use client';

/**
 * 규율 점수 — 손익이 아니라 '규칙을 지킨 정도'(KST 하루 0~100). 계산·가중치는 lib/discipline(헤더 주석·테스트 고정).
 * 1H 추세는 /api/bitget/candles1h(심볼당 1H 1,000봉 1회 ≈ 최근 41일)로 판정 — 그보다 오래된 진입은 추세 항목 제외.
 * '지정가 진입'(진입 체결 중 메이커 비율)은 체결 내역(/api/bitget/fills?byDay=1, lib/fillsFetch 공유)으로 따로 보여주는
 * 참고 줄이며 점수에는 넣지 않는다 — 이유는 lib/discipline 헤더 주석(다른 화면 점수와 입력이 달라지고 지난 추이가 끊김).
 */
import { useEffect, useMemo, useState } from 'react';
import DisciplineTrendLazy from '@/components/DisciplineTrendLazy';
import {
  buildTrendIndex, tradeFlags, disciplineByDay, disciplineSummary,
  DISCIPLINE_WEIGHTS, DISCIPLINE_LABELS, MAX_TRADES_PER_DAY,
  makerEntryShare,
  type DTrade, type TrendIndex, type DisciplineDay, type DisciplineKey, type Closes1h, type MakerEntryDay,
} from '@/lib/discipline';
import { fetchFillsResp } from '@/lib/fillsFetch';

interface PosLike { positionId: string; symbol: string; side: 'long' | 'short'; openTs: number; closeTs: number; netProfit: number; stop?: number }

const color = (s: number) => (s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--amber)' : 'var(--warn)');
const kstDay = (ts: number) => new Date(ts + 9 * 3_600_000).toISOString().slice(0, 10);

function detail(k: DisciplineKey, d: DisciplineDay): string {
  switch (k) {
    case 'stop': return `${d.stops}/${d.n}건 손절 주문`;
    case 'trend': return d.trendKnown ? `${d.aligned}/${d.trendKnown}건 순응` : '1H 데이터 없음';
    case 'revenge': return `손실 후 30분 내 재진입 ${d.revenge}건`;
    case 'overtrade': return `하루 ${MAX_TRADES_PER_DAY}건 초과부터 감점`;
    case 'scalp': return `3분 미만 손실 ${d.lossScalps}건`;
  }
}

type MakerLine = { share: number | null; maker: number; total: number } | null;

function Breakdown({ title, d, sub, maker }: { title: string; d: DisciplineDay | null; sub?: string; maker?: MakerLine }) {
  if (!d) {
    return (
      <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">{title}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1">진입한 매매가 없습니다.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">{title}</p>
        <p className="tabular-nums"><b className="text-[20px] font-extrabold" style={{ color: color(d.score) }}>{d.score}</b><span className="text-[10px] text-[var(--text-muted)]">점 · {d.n}건{sub ? ` · ${sub}` : ''}</span></p>
      </div>
      <ul className="mt-1 space-y-0.5">
        {(Object.keys(DISCIPLINE_WEIGHTS) as DisciplineKey[]).map((k) => {
          const v = d.parts[k];
          return (
            <li key={k} className="flex items-center gap-2 text-[11px] tabular-nums">
              <span className="w-[92px] shrink-0 text-[var(--text)]">{DISCIPLINE_LABELS[k]}</span>
              <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line-2)' }} aria-hidden>
                {v != null && <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: color(v * 100) }} />}
              </span>
              <span className="w-[34px] text-right font-bold" style={{ color: v == null ? 'var(--faint)' : color(v * 100) }}>{v == null ? '—' : `${Math.round(v * 100)}%`}</span>
              <span className="hidden sm:inline w-[150px] text-[10px] text-[var(--faint)] truncate">{detail(k, d)}</span>
            </li>
          );
        })}
      </ul>
      {maker !== undefined && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-[var(--line-2)] flex items-center gap-2 text-[11px] tabular-nums">
          <span className="w-[92px] shrink-0 text-[var(--text-muted)]">지정가 진입 <span className="text-[9px] text-[var(--faint)]">참고</span></span>
          <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line-2)' }} aria-hidden>
            {maker?.share != null && <span className="block h-full rounded-full" style={{ width: `${maker.share * 100}%`, background: 'var(--amber)' }} />}
          </span>
          <span className="w-[34px] text-right font-bold" style={{ color: maker?.share == null ? 'var(--faint)' : 'var(--text)' }}>{maker?.share == null ? '—' : `${Math.round(maker.share * 100)}%`}</span>
          <span className="hidden sm:inline w-[150px] text-[10px] text-[var(--faint)] truncate">{maker == null ? '체결 불러오는 중' : maker.total ? `진입 체결 ${maker.maker}/${maker.total}건 메이커 · 점수 밖` : '진입 체결 없음'}</span>
        </div>
      )}
    </div>
  );
}

export default function DisciplineCard({ positions, days: periodDays = 30 }: { positions: PosLike[]; days?: number }) {
  const symbols = useMemo(() => [...new Set(positions.map((p) => p.symbol))].sort().slice(0, 20), [positions]);
  const symKey = symbols.join(',');
  const [candles, setCandles] = useState<Record<string, Closes1h> | null>(null);

  useEffect(() => {
    if (!symKey) return;
    let alive = true;
    fetch(`/api/bitget/candles1h?symbols=${encodeURIComponent(symKey)}`)
      .then((r) => (r.ok ? r.json() : { candles: {} }))
      .then((j: { candles?: Record<string, Closes1h> }) => { if (alive) setCandles(j.candles ?? {}); })
      .catch(() => { if (alive) setCandles({}); });
    return () => { alive = false; };
  }, [symKey]);

  // 지정가 진입(점수 밖 참고 줄) — 체결 내역 KST 하루별 진입 메이커/테이커 건수. 실패·잠금이면 줄을 숨긴다(undefined)
  const [entryByDay, setEntryByDay] = useState<MakerEntryDay[] | null | undefined>(null);
  useEffect(() => {
    let alive = true;
    // 최근 7일 줄이 늘 채워지도록 최소 7일
    fetchFillsResp(Math.max(7, periodDays)).then((r) => { if (alive) setEntryByDay(r.entryByDay ?? undefined); });
    return () => { alive = false; };
  }, [periodDays]);

  const idx = useMemo(() => {
    const out: Record<string, TrendIndex | undefined> = {};
    for (const [s, rows] of Object.entries(candles ?? {})) if (rows.length) out[s] = buildTrendIndex(rows);
    return out;
  }, [candles]);

  const flags = useMemo(() => {
    const trades: DTrade[] = positions.filter((p) => p.openTs > 0).map((p) => ({
      id: p.positionId, symbol: p.symbol, side: p.side, openTs: p.openTs, closeTs: p.closeTs, netProfit: p.netProfit, hasStop: p.stop != null,
    }));
    return tradeFlags(trades, idx);
  }, [positions, idx]);

  const days = useMemo(() => disciplineByDay(flags), [flags]);
  const [now] = useState(() => Date.now()); // 렌더 순수성 — 마운트 시각 기준 '오늘'·'최근 7일'
  const today = kstDay(now);
  const todayDay = days.find((d) => d.day === today) ?? null;
  const weekStart = kstDay(now - 6 * 86_400_000);
  const week = useMemo(() => disciplineSummary(flags.filter((f) => f.day >= weekStart), '7d'), [flags, weekStart]);
  const weekDays = new Set(flags.filter((f) => f.day >= weekStart).map((f) => f.day)).size;

  const makerToday: MakerLine | undefined = entryByDay === undefined ? undefined : entryByDay === null ? null : makerEntryShare(entryByDay, today, today);
  const makerWeek: MakerLine | undefined = entryByDay === undefined ? undefined : entryByDay === null ? null : makerEntryShare(entryByDay, weekStart);

  if (!flags.length) return null;

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-bold text-[var(--text)]">규율 점수 <span className="text-[10px] font-normal text-[var(--text-muted)]">손익이 아니라 규칙을 지킨 정도</span></h2>
        <span className="text-[10px] text-[var(--text-muted)]">진입 시각(KST) 기준 하루 0~100{candles == null ? ' · 1H 추세 불러오는 중…' : ''}</span>
      </div>

      {days.length >= 2
        ? <DisciplineTrendLazy days={days} />
        : <p className="text-[11.5px] text-[var(--text-muted)] py-2">매매한 날이 2일 이상이면 추이 차트가 그려집니다.</p>}

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        <Breakdown title="오늘" d={todayDay} maker={makerToday} />
        <Breakdown title="최근 7일" d={week} sub={`${weekDays}일`} maker={makerWeek} />
      </div>

      <details className="mt-2.5">
        <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--text-muted)]">점수 계산 방식</summary>
        <ul className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-relaxed list-disc pl-4 space-y-0.5">
          <li>손절 주문 {DISCIPLINE_WEIGHTS.stop} — 거래소에 손절(SL) 주문 기록이 있는 매매 비율.</li>
          <li>1H 추세 순응 {DISCIPLINE_WEIGHTS.trend} — 진입 직전 마감된 1H 봉의 EMA20/60 정배열+종가≥EMA20이면 상승(역배열+종가&lt;EMA20 하락, 그 외 횡보). 롱·상승/숏·하락만 순응. 1H 데이터는 최근 약 41일 — 그 전 진입은 이 항목 제외.</li>
          <li>복수 매매 없음 {DISCIPLINE_WEIGHTS.revenge} — 손실 청산 후 30분 안에 다시 들어간 매매(종목 무관)를 뺀 비율.</li>
          <li>과매매 없음 {DISCIPLINE_WEIGHTS.overtrade} — 하루 {MAX_TRADES_PER_DAY}건까지 만점, 초과 1건마다 1/{MAX_TRADES_PER_DAY} 감점(7일 요약은 매매한 날 평균 건수).</li>
          <li>초단타 손실 없음 {DISCIPLINE_WEIGHTS.scalp} — 3분 미만 보유 후 손실 청산을 뺀 비율.</li>
          <li>지정가 진입(참고, 점수 밖) — 진입 체결 중 메이커(지정가로 호가에 걸려 체결) 비율, 체결 건수 기준. 체결 내역은 매매일지에서만 따로 불러오므로 텔레그램 복기 등 다른 곳의 점수와 입력을 맞추고 지난 점수 추이를 끊지 않으려고 점수에는 넣지 않았습니다. 진입 수수료(메이커 0.02% vs 테이커)를 줄이는 습관 지표로만 보세요.</li>
          <li>판정 못 한 항목은 빼고 나머지 가중치로 100점 환산. 가중치는 이 앱의 기본값(임의)이며, 점수가 높다고 수익이 나는 것은 아닙니다 — 방향 예측이 아닌 기록 복기입니다.</li>
        </ul>
      </details>
    </section>
  );
}
