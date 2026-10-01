'use client';

/**
 * 자산 — 한 화면 허브.
 * 계좌(선물 잔액 + 현물 평가금액 합침 + 포지션) · 실적(거래소 청산 요약, 7/30/90 토글) · 전체보기(3개 상세 링크).
 * 실적/요약은 거래소 실현손익(/api/bitget/history)으로 계산 — 통화 혼합 없이 USDT 기준.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import BottomSheet from '@/components/ui/BottomSheet';
import UnlockGate from '@/components/UnlockGate';
import { ICON } from '@/lib/menu';
import HoldingsConcentration from '@/components/HoldingsConcentration';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const fmtUsd = (n: number) => {
  if (n <= 0) return '0';
  if (n < 0.01) return '<0.01';
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
// 부호 있는 손익(음수도 정상 표시)
const fmtPnl = (n: number) => `${n >= 0 ? '+' : '-'}${fmtUsd(Math.abs(n))}`;
const fmtDate = (ts: number) => { const d = new Date(ts); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

const DAY = 86_400_000;

/* ── 타입(필요 최소) ─────────────────────────────── */
interface AccountResp { configured?: boolean; totalUsdt?: number; assets?: unknown[]; error?: string; locked?: boolean }
interface Position {
  symbol: string; side: 'long' | 'short'; size: number; openAvg: number; markPrice: number;
  leverage: number; marginMode: string | null; marginSize: number; unrealizedPL: number;
  liquidationPrice: number; liqDistPct: number | null;
}
interface PositionsResp { configured?: boolean; account?: { equity: number; available: number; unrealizedPL: number; marginCoin: string } | null; positions?: Position[]; error?: string }
interface HistResp { configured?: boolean; positions?: { netProfit: number; closeTs: number }[]; slRecovered?: number; error?: string }

type Period = 7 | 30 | 90;

/* ── 최근 7일 일별 이익/손실 분리 막대 그래프 ──────── */
interface Bar { label: string; plus: number; minus: number; has: boolean }
function PerfGraph({ bars }: { bars: Bar[] }) {
  const maxAbs = Math.max(1, ...bars.flatMap((b) => [b.plus, Math.abs(b.minus)]));
  return (
    <div className="flex items-stretch justify-between gap-1.5 h-32 px-1">
      {bars.map((b, i) => {
        const hp = Math.round((b.plus / maxAbs) * 40);
        const hm = Math.round((Math.abs(b.minus) / maxAbs) * 40);
        return (
          <div key={i} className="flex-1 flex flex-col items-center h-full">
            <div className="flex-1 w-full flex flex-col justify-end items-center">
              {b.plus > 0 && <span className="text-[8.5px] font-bold text-emerald-500 tabular-nums mb-0.5">+{Math.round(b.plus)}</span>}
              {b.plus > 0 && <div className="w-full max-w-[26px] rounded-t bg-emerald-400/85" style={{ height: `${Math.max(3, hp)}px` }} />}
            </div>
            <div className="w-full h-px bg-[var(--border)]" />
            <div className="flex-1 w-full flex flex-col justify-start items-center">
              {b.minus < 0 && <div className="w-full max-w-[26px] rounded-b bg-red-400/85" style={{ height: `${Math.max(3, hm)}px` }} />}
              {b.minus < 0 && <span className="text-[8.5px] font-bold text-red-500 tabular-nums mt-0.5">{Math.round(b.minus)}</span>}
            </div>
            <span className="text-[9px] text-[var(--text-muted)] mt-0.5">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 전체보기 시트의 상세 링크 카드 ──────────────── */
function NavCard({ href, icon, title, sub, onNavigate }: { href: string; icon: string; title: string; sub: string; onNavigate: () => void }) {
  return (
    <Link href={href} onClick={onNavigate} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover-lift">
      <span className="w-10 h-10 rounded-xl grid place-items-center bg-[var(--surface-2)] text-[var(--accent)] shrink-0">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[icon]} /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-[var(--text)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{sub}</p>
      </div>
      <svg className="w-4 h-4 shrink-0 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
    </Link>
  );
}

export default function AssetsPage() {
  const [period, setPeriod] = useState<Period>(7);
  const { data: acc, isLoading } = useSWR<AccountResp>('/api/bitget/account', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const configured = !!acc?.configured;
  const { data: pos } = useSWR<PositionsResp>(configured ? '/api/bitget/positions' : null, fetcher, { refreshInterval: 15000, revalidateOnFocus: false });
  const { data: hist } = useSWR<HistResp>(configured ? `/api/bitget/history?days=${period}` : null, fetcher, { revalidateOnFocus: false });
  // 원화 환산 — USDT/KRW(업비트) 우선, 없으면 USD/KRW
  const { data: market } = useSWR<{ usdkrw?: { value: number }; usdtkrw?: { value: number } }>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const krwRate = market?.usdtkrw?.value ?? market?.usdkrw?.value ?? null;
  const toKrw = (usd: number) => (krwRate == null ? null : Math.round(usd * krwRate));

  const [sheet, setSheet] = useState(false);

  // 선택 기간 거래소 청산 요약 + 최근 7일 일별 막대
  const perf = useMemo(() => {
    const ps = hist?.positions ?? [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const bars: Bar[] = Array.from({ length: 7 }, (_, i) => {
      const dayStart = t0 - (6 - i) * DAY;
      return { label: new Date(dayStart).toLocaleDateString('ko-KR', { weekday: 'short' }), plus: 0, minus: 0, has: false };
    });
    let net = 0, plus = 0, minus = 0, winN = 0, lossN = 0, minTs = Infinity, maxTs = 0;
    for (const p of ps) {
      net += p.netProfit;
      if (p.netProfit > 0) { plus += p.netProfit; winN++; } else if (p.netProfit < 0) { minus += p.netProfit; lossN++; }
      if (p.closeTs) { if (p.closeTs < minTs) minTs = p.closeTs; if (p.closeTs > maxTs) maxTs = p.closeTs; }
      if (p.closeTs >= t0 - 6 * DAY && p.closeTs < t0 + DAY) {
        const idx = Math.floor((p.closeTs - (t0 - 6 * DAY)) / DAY);
        if (idx >= 0 && idx < 7) {
          if (p.netProfit >= 0) bars[idx].plus += p.netProfit; else bars[idx].minus += p.netProfit;
          bars[idx].has = true;
        }
      }
    }
    const decided = winN + lossN;
    return {
      closed: ps.length, net, plus, minus, winN, lossN,
      winRate: decided ? Math.round((winN / decided) * 100) : null,
      slRecovered: hist?.slRecovered ?? 0,
      range: ps.length ? `${fmtDate(minTs)} ~ ${fmtDate(maxTs)}` : '',
      bars,
    };
  }, [hist]);

  return (
    <div className="max-w-lg mx-auto pb-12 space-y-4">
      {/* ── 계좌 ── */}
      <section>
        <div className="fin-sec"><h3>계좌</h3></div>

        {isLoading && <div className="h-32 rounded-2xl bg-[var(--surface-2)] animate-pulse" />}
        {acc?.locked && <UnlockGate />}
        {acc && !acc.locked && acc.configured === false && (
          <Link href="/bitget" className="block rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-600">
            🔑 API 키가 연결되지 않았습니다 — <span className="underline">계좌 상세에서 설정하기</span>
          </Link>
        )}
        {configured && (
          <div className="space-y-3">
            {/* USDT-M 선물 잔액 + 현물(spot) 합침 */}
            <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-muted)]">USDT-M 선물 잔액 <span className="text-[10px]">(계좌 순자산)</span></p>
                  {pos?.account && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                        사용가능 <b className="text-[var(--text)] tabular-nums">${fmtUsd(pos.account.available)}</b>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                        미실현 <b className={`tabular-nums ${pos.account.unrealizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{pos.account.unrealizedPL >= 0 ? '+' : ''}{pos.account.unrealizedPL.toFixed(2)}</b>
                      </span>
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-bold">선물</span>
              </div>

              {pos?.account ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-3xl font-extrabold text-[var(--accent)] tabular-nums leading-none">${fmtUsd(pos.account.equity)}</span>
                  <span className="text-xs font-bold text-[var(--accent)]/70">USDT</span>
                  {toKrw(pos.account.equity) != null && (
                    <span className="text-lg font-bold text-[var(--text)] tabular-nums">≈ ₩{toKrw(pos.account.equity)!.toLocaleString('ko-KR')}</span>
                  )}
                  {krwRate != null && <span className="w-full text-[10px] text-[var(--text-muted)]">1 USDT ≈ ₩{Math.round(krwRate).toLocaleString('ko-KR')}</span>}
                </div>
              ) : pos?.error ? (
                <p className="text-sm text-amber-600 mt-1">선물 잔액 조회 실패 — API 키에 선물 읽기 권한이 필요합니다.</p>
              ) : (
                <p className="text-2xl font-bold text-[var(--text-muted)] tabular-nums animate-pulse">불러오는 중…</p>
              )}

              {/* 현물(spot) 평가금액 — 잔액 박스 안으로 합침 */}
              <div className="mt-3 pt-3 border-t border-[var(--border)]/60 flex items-center justify-between">
                <p className="text-xs text-[var(--text-muted)]">현물(spot) 평가금액 <span className="text-[10px]">· {(acc?.assets?.length ?? 0)}개 자산</span></p>
                <p className="text-sm font-bold text-[var(--text)] tabular-nums">
                  ${fmtUsd(acc?.totalUsdt ?? 0)}
                  {toKrw(acc?.totalUsdt ?? 0) != null && <span className="text-[11px] font-semibold text-[var(--text-muted)] ml-1.5">≈ ₩{toKrw(acc?.totalUsdt ?? 0)!.toLocaleString('ko-KR')}</span>}
                </p>
              </div>
            </div>

            {/* USDT 선물 포지션 */}
            {pos?.positions && pos.positions.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-[var(--text)]">USDT 선물 포지션 <span className="text-[10px] font-normal text-[var(--text-muted)]">{pos.positions.length}건</span></h4>
                  {pos.account && (
                    <span className="text-[11px] tabular-nums"><span className="text-[var(--text-muted)]">미실현 </span>
                      <strong className={pos.account.unrealizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}>{pos.account.unrealizedPL >= 0 ? '+' : ''}{pos.account.unrealizedPL.toFixed(2)}</strong>
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {pos.positions.map((p) => {
                    const near = p.liqDistPct != null && p.liqDistPct < 15;
                    return (
                      <div key={p.symbol + p.side} className={`rounded-xl border p-3 ${near ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-[var(--text)]">{p.symbol.replace('USDT', '')}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${p.side === 'long' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{p.side === 'long' ? '롱' : '숏'} {p.leverage}x</span>
                            {p.marginMode && <span className="text-[9px] text-[var(--text-muted)]">{p.marginMode === 'isolated' ? '격리' : '교차'}</span>}
                          </div>
                          <span className={`text-sm font-bold tabular-nums ${p.unrealizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{p.unrealizedPL >= 0 ? '+' : ''}{p.unrealizedPL.toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-muted)] tabular-nums">
                          <span>평단 {fmtUsd(p.openAvg)}</span>
                          <span>마크 {fmtUsd(p.markPrice)}</span>
                          <span>증거금 {p.marginSize.toFixed(2)}</span>
                          <span className={near ? 'text-red-500 font-semibold' : ''}>청산 {p.liquidationPrice > 0 ? fmtUsd(p.liquidationPrice) : '-'}</span>
                          <span className={near ? 'text-red-500 font-semibold col-span-2' : 'col-span-2'}>
                            {p.liqDistPct != null ? `청산까지 ${p.liqDistPct.toFixed(1)}%` : ''}{near ? ' ⚠ 청산 근접' : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-[var(--text-muted)] mt-2 opacity-70">읽기 전용 · 15초 갱신 · 청산가는 거래소 계산값</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── 보유 주식 비중 — 도넛 + 한 종목·업종 쏠림 경고선(거래소 연결과 무관, 이 기기 보유 기록) ── */}
      <section>
        <div className="fin-sec"><h3>보유 주식 비중</h3></div>
        <HoldingsConcentration />
      </section>

      {/* ── 실적 (거래소 청산 요약) ── */}
      <section>
        <div className="fin-sec">
          <h3>실적</h3>
          <div className="flex gap-1">
            {([7, 30, 90] as Period[]).map((d) => (
              <button key={d} type="button" onClick={() => setPeriod(d)}
                className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${period === d ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>{d}일</button>
            ))}
          </div>
        </div>
        <div className="fin-card p-4">
          {!configured ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">거래소(API 키) 연결 후 표시됩니다.</p>
          ) : !hist ? (
            <div className="skeleton h-28" />
          ) : hist.error ? (
            <p className="text-xs text-amber-600 py-6 text-center">청산 이력 조회 실패 — API 키에 선물 읽기 권한이 필요합니다.</p>
          ) : perf.closed === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">최근 {period}일 청산된 선물 포지션이 없습니다.</p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--text-muted)] mb-2">{perf.range} <span className="opacity-60">· 거래소 자동 집계(USDT)</span></p>
              <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">순손익 합계</p>
                  <p className={`text-base font-bold tabular-nums ${perf.net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{fmtPnl(perf.net)}</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">건수 · 승률</p>
                  <p className="text-base font-bold tabular-nums text-[var(--text)]">{perf.closed}건 · {perf.winRate ?? 0}%</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">손절가 복구</p>
                  <p className="text-base font-bold tabular-nums text-[var(--text)]">{perf.slRecovered}건</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-2.5 text-center">
                  <p className="text-[10px] text-[var(--text-muted)]">플러스 합계 <span className="text-emerald-600">{perf.winN}건</span></p>
                  <p className="text-base font-bold tabular-nums text-emerald-500">{fmtPnl(perf.plus)}</p>
                </div>
                <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-2.5 text-center">
                  <p className="text-[10px] text-[var(--text-muted)]">마이너스 합계 <span className="text-red-600">{perf.lossN}건</span></p>
                  <p className="text-base font-bold tabular-nums text-red-500">{fmtPnl(perf.minus)}</p>
                </div>
              </div>
              {period === 7 ? (
                <>
                  <PerfGraph bars={perf.bars} />
                  <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-70">막대 = 하루의 이익(초록·위)·손실(빨강·아래) · 거래소 자동 집계</p>
                </>
              ) : (
                <p className="text-[10px] text-[var(--text-muted)] opacity-70">일별 막대는 7일에서만 표시됩니다. 상세 내역은 전체보기 → 계좌 상세.</p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── 전체보기 ── */}
      <button type="button" onClick={() => setSheet(true)}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-center gap-2 font-bold text-[var(--text)] hover-lift">
        <svg className="w-5 h-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        전체보기
      </button>

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="전체보기">
        <div className="space-y-2">
          <NavCard href="/bitget" icon="bitget" title="계좌 상세" sub="잔고·포지션·청산 내역·입출금" onNavigate={() => setSheet(false)} />
          <NavCard href="/performance" icon="growth" title="전체 성과" sub="승률·기대값·주간 리뷰" onNavigate={() => setSheet(false)} />
          <NavCard href="/journal" icon="journal" title="매매일지" sub="거래소 대조·기분·월별" onNavigate={() => setSheet(false)} />
        </div>
      </BottomSheet>
    </div>
  );
}
