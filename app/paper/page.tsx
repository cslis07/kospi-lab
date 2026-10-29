'use client';

/**
 * 모의 선행테스트 결과 — 읽기 전용·공개. 출처 = data/paper-trades.json(사전 기록, 배포마다 최신 커밋 반영).
 * 판정은 브라우저에서 lib/paperJudge 순수 함수로(스크립트와 같은 규칙). 캔들은 /api/candles(1H, 200봉씩 endTime 페이징).
 * 실제 주문 아님. 결과를 보고 기록을 고치지 않는다(문서 규칙 1).
 */
import Link from 'next/link';
import { useMemo } from 'react';
import useSWR from 'swr';
import rawLog from '@/data/paper-trades.json';
import {
  judgeTrade, checkSkip, summarize, byCondition, meanRTest, meanRText, binomTailP, verdictText, roundStatus,
  MIN_N, ROUND_GAP_MS, type Candle, type Judged, type PaperLog, type SkipCheck, type Status,
} from '@/lib/paperJudge';

const LOG = rawLog as unknown as PaperLog;
const DOC_URL = 'https://github.com/cslis07/kospi-lab/blob/main/모의매매테스트.md';
const H = 3_600_000;

const kst = (ts?: number) => {
  if (ts == null || !Number.isFinite(ts)) return '–';
  const d = new Date(ts + 9 * H);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const fmtR = (r: number | null | undefined) => (r == null ? '–' : `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`);
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
const px = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });
const sideKo = (s: string) => (s === 'long' ? '롱' : s === 'short' ? '숏' : '관망');

const STATUS: Record<Status, { label: string; chip: string }> = {
  win: { label: '승', chip: 'good' },
  loss: { label: '패', chip: 'bad' },
  open: { label: '미결', chip: 'warn' },
  pending: { label: '체결 대기', chip: 'flat' },
  void: { label: '무효(미체결)', chip: 'flat' },
};

/** 한 코인 1시간봉 — from(ms)부터 지금까지, /api/candles 200봉 상한이라 endTime을 과거로 옮기며 모은다 */
async function loadHourly(coin: string, from: number): Promise<Candle[]> {
  const byTs = new Map<number, Candle>();
  let end = Date.now();
  for (let page = 0; page < 20; page++) {
    const r = await fetch(`/api/candles?symbol=${coin}USDT&granularity=1H&endTime=${end}&limit=200`);
    const j = (await r.json()) as { candles?: Candle[]; error?: string };
    const cs = j.candles ?? [];
    if (!cs.length) { if (page === 0) throw new Error(j.error || `${coin} 캔들 없음`); break; }
    for (const c of cs) byTs.set(c.ts, c);
    const oldest = Math.min(...cs.map((c) => c.ts));
    if (oldest <= from - H || oldest >= end) break;
    end = oldest - 1;
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

function Chip({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`fin-chip ${kind}`}>{children}</span>;
}

/** 기록에 나온 코인별 1시간봉 + 판정 기준 시각 — 화면 열 때 1번(포커스 재요청 없음) */
async function loadAll(): Promise<{ candles: Map<string, Candle[]>; now: number }> {
  const first = new Map<string, number>();
  for (const t of LOG.trades) first.set(t.coin, Math.min(first.get(t.coin) ?? Infinity, Date.parse(t.openedAt)));
  for (const s of LOG.skips) first.set(s.coin, Math.min(first.get(s.coin) ?? Infinity, Date.parse(s.at)));
  const entries = await Promise.all([...first].map(async ([c, from]) => [c, await loadHourly(c, from)] as const));
  return { candles: new Map(entries), now: Date.now() };
}

export default function PaperPage() {
  const { data, error, mutate, isValidating } = useSWR('paper-candles', loadAll, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const candles = data?.candles ?? null;
  const now = data?.now ?? null;
  const err = error ? (error instanceof Error ? error.message : String(error)) : null;

  const judged = useMemo<Judged[] | null>(
    () => (candles && now ? LOG.trades.map((t) => judgeTrade(t, candles.get(t.coin) ?? [], now)) : null),
    [candles, now],
  );
  const skipChecks = useMemo(
    () => (candles && now ? LOG.skips.map((s) => ({ s, c: checkSkip(s, candles.get(s.coin) ?? [], now) })) : null),
    [candles, now],
  );

  const rs = roundStatus(LOG);
  const nextAt = rs.lastAt + ROUND_GAP_MS;
  const due = now != null && now >= nextAt;

  const s = judged ? summarize(judged) : null;
  const decidedR = judged ? judged.filter((j) => j.status === 'win' || j.status === 'loss').map((j) => j.r ?? 0) : [];
  const decided = decidedR.length;
  const decidedSum = decidedR.reduce((a, b) => a + b, 0);
  const openSum = judged ? judged.filter((j) => j.status === 'open').reduce((a, j) => a + (j.r ?? 0), 0) : 0;
  const live = judged ? judged.filter((j) => j.status === 'open' || j.status === 'pending') : [];
  const conds = judged ? byCondition(judged) : [];

  const rounds = useMemo(() => {
    const ids = [...new Set([...LOG.trades.map((t) => t.round), ...LOG.skips.map((x) => x.round)])].sort((a, b) => b - a);
    return ids.map((r) => ({
      round: r,
      at: Math.min(...[...LOG.trades.filter((t) => t.round === r).map((t) => Date.parse(t.openedAt)), ...LOG.skips.filter((x) => x.round === r).map((x) => Date.parse(x.at))]),
      trades: LOG.trades.filter((t) => t.round === r),
      skips: LOG.skips.filter((x) => x.round === r),
    }));
  }, []);
  const judgedById = new Map((judged ?? []).map((j) => [j.trade.id, j]));

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      {/* 제목·안내 */}
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-[var(--text)]">모의 선행테스트</h2>
        <p className="text-[13px] text-[var(--text-muted)] mt-1 leading-relaxed">
          12시간마다 BTC·ETH·SOL·XRP 중 조건이 맞는 매매를 <b className="text-[var(--text)]">결과 보기 전에</b> 진입·손절·목표까지 기록하고,
          이후 1시간봉으로 자동 채점합니다. 목표는 확정 {MIN_N}건 — 그 전엔 어떤 결론도 내리지 않습니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip kind="flat">실제 주문 아님</Chip>
          <Chip kind="flat">결과 보기 전 사전 기록</Chip>
          <Chip kind="flat">자동 판정</Chip>
        </div>
      </div>

      {/* 요약 */}
      <section className="fin-card p-4 mb-4" aria-label="누적 요약">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-[var(--text)]">확정 {decided}/{MIN_N}건</span>
          <span className="text-[11px] text-[var(--text-muted)]">{judged ? `미결 ${s!.open} · 대기 ${s!.pending} · 무효 ${s!.voided}` : '판정 중…'}</span>
        </div>
        <div className="h-2 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--surface-2)' }}
          role="progressbar" aria-valuemin={0} aria-valuemax={MIN_N} aria-valuenow={decided} aria-label="확정 건수">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (decided / MIN_N) * 100)}%`, background: 'var(--accent)' }} />
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold text-[var(--faint)]">승 · 패</div>
            <div className="text-[16px] font-extrabold text-[var(--text)] mt-0.5 tabular-nums">{judged ? `${s!.wins} · ${s!.losses}` : '–'}</div>
          </div>
          <div className="min-w-0 border-l border-[var(--line)]">
            <div className="text-[10.5px] font-bold text-[var(--faint)]">누적 R(확정)</div>
            <div className="text-[16px] font-extrabold mt-0.5 tabular-nums" style={{ color: !judged ? 'var(--text)' : decidedSum >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{judged ? fmtR(decidedSum) : '–'}</div>
          </div>
          <div className="min-w-0 border-l border-[var(--line)]">
            <div className="text-[10.5px] font-bold text-[var(--faint)]">미결 평가</div>
            <div className="text-[16px] font-extrabold text-[var(--text)] mt-0.5 tabular-nums">{judged ? (s!.open ? fmtR(openSum) : '없음') : '–'}</div>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-[12.5px] leading-snug">
          <li className="flex gap-2"><b className="shrink-0 text-[var(--text)] w-14">승률</b>
            <span className="text-[var(--text-muted)] min-w-0">{judged ? <>{s!.winRate != null ? `${Math.round(s!.winRate * 100)}% · ` : ''}{verdictText(decided, s!.winRate, binomTailP(s!.wins, decided))}</> : '판정 중…'}</span></li>
          <li className="flex gap-2"><b className="shrink-0 text-[var(--text)] w-14">평균 R</b>
            <span className="text-[var(--text-muted)] min-w-0">{judged ? meanRText(meanRTest(decidedR)) : '판정 중…'}</span></li>
        </ul>
        <p className="text-[11px] text-[var(--faint)] mt-2 leading-relaxed">두 기준은 따로 봅니다. 하나만 유의해도 &lsquo;우위 확인&rsquo;이라 부르지 않습니다. 수수료·슬리피지 미반영.</p>

        <div className="mt-3 pt-3 border-t border-[var(--line)] text-[12px] text-[var(--text-muted)]">
          다음 라운드 <b className="text-[var(--text)]">R{rs.last + 1}</b> · {due ? <>기록 대기 중(예정 {kst(nextAt)} KST 지남)</> : <><b className="text-[var(--text)]">{kst(nextAt)} KST</b> 이후</>}
          <span className="block text-[11px] text-[var(--faint)] mt-0.5">마지막 R{rs.last} 기록 {kst(rs.lastAt)} KST · 새 라운드는 커밋·배포 후 이 화면에 반영</span>
        </div>
      </section>

      {err && (
        <div className="fin-card p-4 mb-4 text-[12.5px]">
          <p className="text-[var(--text)] font-semibold">캔들을 불러오지 못해 판정하지 못했습니다.</p>
          <p className="text-[var(--text-muted)] mt-1 break-all">{err}</p>
          <button type="button" onClick={() => void mutate()} disabled={isValidating} className="fin-more mt-2">{isValidating ? '불러오는 중…' : '다시 시도'}</button>
        </div>
      )}

      {/* 진행 중 */}
      <h3 className="text-[15px] font-bold text-[var(--text)] mb-2 px-0.5">지금 진행 중</h3>
      {!judged ? (
        <div className="fin-card p-4 mb-5 text-[12.5px] text-[var(--text-muted)]">{err ? '판정 불가' : '1시간봉으로 판정 중…'}</div>
      ) : live.length === 0 ? (
        <div className="fin-card p-4 mb-5 text-[12.5px] text-[var(--text-muted)]">열린 매매 없음 — 다음 라운드를 기다리는 중입니다.</div>
      ) : (
        <div className="space-y-2 mb-5">
          {live.map((j) => {
            const t = j.trade;
            const dir = t.side === 'long' ? 1 : -1;
            return (
              <div key={t.id} className="fin-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[14px] text-[var(--text)] min-w-0 truncate">R{t.round} {t.coin} {sideKo(t.side)} <span className="font-normal text-[var(--text-muted)] text-[12px]">{t.type === 'limit' ? '지정가' : '시장가'}</span></b>
                  <Chip kind={STATUS[j.status].chip}>{STATUS[j.status].label}{j.status === 'open' ? ` ${fmtR(j.r)}` : ''}</Chip>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-3 text-center text-[12px]">
                  <div><div className="text-[10.5px] text-[var(--faint)]">진입</div><div className="font-bold text-[var(--text)] tabular-nums">{px(t.entry)}</div></div>
                  <div><div className="text-[10.5px] text-[var(--faint)]">손절</div><div className="font-bold tabular-nums" style={{ color: 'var(--warn)' }}>{px(t.stop)}</div></div>
                  <div><div className="text-[10.5px] text-[var(--faint)]">목표</div><div className="font-bold tabular-nums" style={{ color: 'var(--ok)' }}>{px(t.target)}</div></div>
                </div>
                <p className="text-[11.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
                  {j.status === 'pending'
                    ? <>지정가 미체결 · {t.voidAt ? `${kst(Date.parse(t.voidAt))} KST까지 안 닿으면 무효` : '다음 라운드까지 안 닿으면 무효'}</>
                    : <>현재가 {j.exitPrice != null ? px(j.exitPrice) : '–'}{j.filledAt != null ? ` · 체결 ${kst(j.filledAt)}` : ''}{j.best != null && j.worst != null ? ` · 최대 유리 ${pct(((j.best - t.entry) / t.entry) * 100 * dir)} / 불리 ${pct(((j.worst - t.entry) / t.entry) * 100 * dir)}` : ''}</>}
                  <span className="block text-[var(--faint)]">기록 {kst(Date.parse(t.openedAt))} KST{t.conviction ? ` · 확신 ${t.conviction}` : ''}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 라운드 목록 */}
      <h3 className="text-[15px] font-bold text-[var(--text)] mb-2 px-0.5">라운드 기록 <span className="text-[12px] font-normal text-[var(--text-muted)]">최신순</span></h3>
      <div className="fin-card mb-5 overflow-hidden">
        {rounds.map((rd, i) => (
          <div key={rd.round} className={`px-4 py-3 ${i ? 'border-t border-[var(--line)]' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <b className="text-[13px] text-[var(--text)]">R{rd.round}</b>
              <span className="text-[11px] text-[var(--faint)]">{kst(rd.at)} KST</span>
            </div>
            {rd.trades.map((t) => {
              const j = judgedById.get(t.id);
              return (
                <div key={t.id} className="mt-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-[var(--text)] min-w-0 truncate">
                      <b>{t.coin}</b> {sideKo(t.side)} · {t.type === 'limit' ? '지정가' : '시장가'}
                    </span>
                    {j ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Chip kind={STATUS[j.status].chip}>{STATUS[j.status].label}</Chip>
                        <b className="text-[12.5px] tabular-nums w-14 text-right" style={{ color: j.r == null ? 'var(--text-muted)' : j.r >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmtR(j.r)}</b>
                      </span>
                    ) : <span className="text-[11px] text-[var(--faint)] shrink-0">판정 중</span>}
                  </div>
                  <div className="text-[11.5px] text-[var(--text-muted)] tabular-nums mt-0.5">진입 {px(t.entry)} · 손절 {px(t.stop)} · 목표 {px(t.target)}</div>
                </div>
              );
            })}
            {rd.skips.length > 0 && (
              <div className="text-[11.5px] text-[var(--faint)] mt-1.5">관망 {rd.skips.map((x) => x.coin).join('·')}</div>
            )}
          </div>
        ))}
      </div>

      {/* 관망 사후 점검 */}
      <details className="fin-card mb-3 group">
        <summary className="px-4 py-3 cursor-pointer select-none text-[13.5px] font-bold text-[var(--text)] flex items-center justify-between gap-2">
          <span>관망 사후 점검 <span className="font-normal text-[12px] text-[var(--text-muted)]">{LOG.skips.length}건</span></span>
          <span aria-hidden className="text-[var(--faint)] group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4">
          <p className="text-[11.5px] text-[var(--text-muted)] mb-2 leading-relaxed">들어가지 않은 코인이 다음 라운드까지 어떻게 움직였나. &lsquo;엔진 방향&rsquo;은 그때 엔진이 낸 쪽이고, 종가 기준 맞았는지만 봅니다(손익 아님).</p>
          <ul className="space-y-2">
            {[...LOG.skips].reverse().map((x, i) => {
              const c: SkipCheck | null | undefined = skipChecks?.find((k) => k.s === x)?.c;
              return (
                <li key={`${x.round}-${x.coin}-${i}`} className="text-[12px] border-t border-[var(--line)] pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text)] min-w-0 truncate"><b>R{x.round} {x.coin}</b> · 엔진 {sideKo(x.engine ?? 'wait')}</span>
                    {c?.engineWouldWin != null && <Chip kind={c.engineWouldWin ? 'good' : 'bad'}>엔진 {c.engineWouldWin ? '맞음' : '틀림'}</Chip>}
                  </div>
                  <div className="text-[var(--text-muted)] mt-0.5">{x.reason}</div>
                  <div className="text-[11.5px] text-[var(--faint)] tabular-nums mt-0.5">
                    {px(x.price)} 기준 · {c ? <>최고 {pct(c.highPct)} · 최저 {pct(c.lowPct)} · 마지막 {pct(c.lastPct)}</> : skipChecks ? '아직 봉 없음' : '판정 중…'}
                    {!x.until && ' · 진행 중'}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      {/* 조건별 성적 */}
      <details className="fin-card mb-5 group">
        <summary className="px-4 py-3 cursor-pointer select-none text-[13.5px] font-bold text-[var(--text)] flex items-center justify-between gap-2">
          <span>조건별 성적</span>
          <span aria-hidden className="text-[var(--faint)] group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4">
          <p className="text-[11.5px] text-[var(--text-muted)] mb-2 leading-relaxed">기록할 때 적은 조건별로 묶은 성적. 건수가 적어 참고만 — 여기서 규칙을 고르면 사후 끼워 맞추기가 됩니다.</p>
          {!judged ? <p className="text-[12px] text-[var(--text-muted)]">판정 중…</p> : conds.length === 0 ? <p className="text-[12px] text-[var(--text-muted)]">체결된 매매 없음</p> : (
            <table className="w-full text-[12px] tabular-nums">
              <thead><tr className="text-left text-[var(--faint)]">
                <th className="font-semibold py-1 pr-1">조건</th><th className="font-semibold py-1 pr-1 text-right">건</th>
                <th className="font-semibold py-1 pr-1 text-right">승·패</th><th className="font-semibold py-1 text-right">R 합</th>
              </tr></thead>
              <tbody>
                {conds.map((r) => (
                  <tr key={`${r.key}-${r.value}`} className="border-t border-[var(--line)]">
                    <td className="py-1.5 pr-1 text-[var(--text)]"><span className="text-[var(--text-muted)]">{r.key}</span> {r.value}</td>
                    <td className="py-1.5 pr-1 text-right text-[var(--text-muted)]">{r.n}</td>
                    <td className="py-1.5 pr-1 text-right text-[var(--text-muted)] whitespace-nowrap">{r.wins}·{r.losses}</td>
                    <td className="py-1.5 text-right font-semibold whitespace-nowrap" style={{ color: r.sumR >= 0 ? 'var(--ok)' : 'var(--warn)' }}>{fmtR(r.sumR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      {/* 규칙·출처 */}
      <div className="text-[11.5px] text-[var(--text-muted)] leading-relaxed space-y-1.5 border-t border-[var(--border)] pt-4">
        <p>판정 규칙: 같은 봉에서 손절·목표가 둘 다 닿으면 손절 먼저 · 지정가는 다음 라운드까지 안 닿으면 무효 · R = 손익 ÷ (진입−손절 거리). Bitget USDT 선물 1시간봉 기준.</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <a href={DOC_URL} target="_blank" rel="noopener noreferrer" className="fin-more">테스트 규칙 문서(GitHub) ↗</a>
          <Link href="/study/crash" className="fin-more">폭락 대응 교본 →</Link>
        </div>
        <p className="opacity-70 pt-1">모의 기록이며 실제 주문이 아닙니다. 과거 성적은 앞으로를 보장하지 않으며 투자 권유가 아닙니다.</p>
      </div>
    </div>
  );
}
