'use client';

/**
 * 자산 — 한 화면 허브. 계좌 잔액(선물/현물)과 최근 7일 성과를 대표로 크게 보여주고,
 * 청산내역·이체내역·매매일지는 작은 박스 버튼 → 팝업(바텀시트)으로 확인한다.
 * 성과 7일은 거래소 실현손익(/api/bitget/history)으로 계산 — 통화 혼합 없이 USDT 실적.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import BottomSheet from '@/components/ui/BottomSheet';
import ClosedTrades from '@/components/ClosedTrades';
import UnlockGate from '@/components/UnlockGate';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { ICON } from '@/lib/menu';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const fmtUsd = (n: number) => {
  if (n <= 0) return '0';
  if (n < 0.01) return '<0.01';
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
// 그래프 라벨용 짧은 표기(부호 포함)
const fmtShort = (n: number) => (Math.abs(n) >= 1 ? `${n >= 0 ? '+' : ''}${Math.round(n)}` : `${n >= 0 ? '+' : ''}${n.toFixed(1)}`);

/* ── 타입(필요 최소) ─────────────────────────────── */
interface AccountResp { configured?: boolean; totalUsdt?: number; assets?: unknown[]; error?: string; locked?: boolean }
interface Position {
  symbol: string; side: 'long' | 'short'; size: number; openAvg: number; markPrice: number;
  leverage: number; marginMode: string | null; marginSize: number; unrealizedPL: number;
  liquidationPrice: number; liqDistPct: number | null;
}
interface PositionsResp { configured?: boolean; account?: { equity: number; available: number; unrealizedPL: number; marginCoin: string } | null; positions?: Position[]; error?: string }
interface Bill { billId: string; ts: number; coin: string; businessType: string; size: number }
interface ActivityResp { configured: boolean; bills?: Bill[]; error?: string }
interface HistResp { configured?: boolean; positions?: { netProfit: number; closeTs: number }[]; error?: string }

const DAY = 86_400_000;

const fmtTs = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtAmount = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toFixed(8).replace(/\.?0+$/, '');
};
const BIZ_LABEL: Record<string, string> = {
  TRANSFER_IN: '내부 입금', TRANSFER_OUT: '내부 출금', DEPOSIT: '입금', WITHDRAW: '출금',
  BUY: '매수', SELL: '매도', TRADE: '거래', CONVERT: '환전', REWARD: '보상',
};
const bizLabel = (b: string) => BIZ_LABEL[b] ?? b.toLowerCase().replace(/_/g, ' ');

/* ── 최근 7일 일별 실현손익(USDT) 막대 그래프 (값 라벨 표시) ─── */
interface Bar { label: string; v: number; has: boolean }
function PerfGraph({ bars }: { bars: Bar[] }) {
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.v)));
  return (
    <div className="flex items-end justify-between gap-1.5 h-32 px-1">
      {bars.map((b, i) => {
        const h = Math.round((Math.abs(b.v) / maxAbs) * 40);
        const up = b.v >= 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center h-full">
            <div className="flex-1 w-full flex flex-col justify-end items-center">
              {b.has && up && <span className="text-[8.5px] font-bold text-emerald-500 tabular-nums mb-0.5">{fmtShort(b.v)}</span>}
              {b.has && up && <div className="w-full max-w-[26px] rounded-t bg-emerald-400/80" style={{ height: `${Math.max(3, h)}px` }} />}
            </div>
            <div className="w-full h-px bg-[var(--border)]" />
            <div className="flex-1 w-full flex flex-col justify-start items-center">
              {b.has && !up && <div className="w-full max-w-[26px] rounded-b bg-red-400/80" style={{ height: `${Math.max(3, h)}px` }} />}
              {b.has && !up && <span className="text-[8.5px] font-bold text-red-500 tabular-nums mt-0.5">{fmtShort(b.v)}</span>}
            </div>
            <span className="text-[9px] text-[var(--text-muted)] mt-0.5">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 이체내역(입출금·Bills) 팝업 내용 ───────────── */
function TransfersBody({ configured }: { configured: boolean }) {
  const { data } = useSWR<ActivityResp>(configured ? '/api/bitget/activity' : null, fetcher, { revalidateOnFocus: false });
  if (!configured) return <p className="text-xs text-[var(--text-muted)] py-6 text-center">계좌(API 키)가 연결되지 않았습니다.</p>;
  if (!data) return <p className="text-xs text-[var(--text-muted)] py-6 text-center animate-pulse">불러오는 중…</p>;
  const bills = data.bills ?? [];
  if (!bills.length) return <p className="text-xs text-[var(--text-muted)] py-6 text-center">최근 입출금·이체 내역이 없습니다.</p>;
  return (
    <div className="space-y-1.5">
      {bills.slice(0, 30).map((b) => {
        const inflow = b.size > 0;
        return (
          <div key={b.billId} className="flex items-center justify-between text-xs rounded-lg bg-[var(--surface-2)] px-3 py-2">
            <div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${inflow ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-600'}`}>{bizLabel(b.businessType)}</span>
              <span className="font-mono text-[var(--text)]">{b.coin}</span>
              <span className="text-[10px] text-[var(--text-muted)] ml-1.5">{fmtTs(b.ts)}</span>
            </div>
            <span className={`tabular-nums font-semibold ${inflow ? 'text-emerald-500' : 'text-red-500'}`}>{inflow ? '+' : ''}{fmtAmount(b.size)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 매매일지 팝업 내용(최근 기록 확인 + 전체 열기) ─ */
function JournalBody({ rows }: { rows: { key: string; name: string; tag: string; result: string; resultR: number | null; ts: number }[] }) {
  if (!rows.length) return (
    <div className="py-8 text-center">
      <p className="text-sm text-[var(--text)] font-semibold">아직 매매일지 기록이 없습니다</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">종목·코인 분석에서 판정을 기록하면 여기 모입니다.</p>
    </div>
  );
  const R = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);
  const RES: Record<string, { l: string; c: string }> = {
    win: { l: '승', c: 'text-emerald-500' }, loss: { l: '패', c: 'text-red-500' },
    even: { l: '본전', c: 'text-[var(--text-muted)]' }, open: { l: '미청산', c: 'text-amber-600' },
  };
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 30).map((r) => {
        const res = RES[r.result] ?? RES.open;
        return (
          <div key={r.key} className="flex items-center gap-2 text-xs rounded-lg bg-[var(--surface-2)] px-3 py-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] shrink-0">{r.tag}</span>
            <span className="font-semibold text-[var(--text)] truncate flex-1">{r.name}</span>
            <span className={`font-bold tabular-nums ${r.resultR != null && r.resultR >= 0 ? 'text-emerald-500' : r.resultR != null ? 'text-red-500' : 'text-[var(--text-muted)]'}`}>{R(r.resultR)}</span>
            <span className={`font-bold shrink-0 ${res.c}`}>{res.l}</span>
            <span className="text-[10px] text-[var(--text-muted)] shrink-0">{new Date(r.ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── 작은 박스 모달 버튼 ─────────────────────────── */
function BoxButton({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center hover-lift flex flex-col items-center gap-1.5">
      <span className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--surface-2)] text-[var(--accent)]">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={ICON[icon]} /></svg>
      </span>
      <span className="text-[13px] font-bold text-[var(--text)] leading-tight">{label}</span>
      <span className="text-[10px] text-[var(--text-muted)] leading-tight">{sub}</span>
    </button>
  );
}

type Modal = 'closed' | 'transfers' | 'journal' | null;

export default function AssetsPage() {
  const { data: acc, isLoading } = useSWR<AccountResp>('/api/bitget/account', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const configured = !!acc?.configured;
  const { data: pos } = useSWR<PositionsResp>(configured ? '/api/bitget/positions' : null, fetcher, { refreshInterval: 15000, revalidateOnFocus: false });
  const { data: hist } = useSWR<HistResp>(configured ? '/api/bitget/history?days=7' : null, fetcher, { revalidateOnFocus: false });
  // 원화 환산 — USDT/KRW(업비트) 우선, 없으면 USD/KRW
  const { data: market } = useSWR<{ usdkrw?: { value: number }; usdtkrw?: { value: number } }>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const krwRate = market?.usdtkrw?.value ?? market?.usdkrw?.value ?? null;
  const toKrw = (usd: number) => (krwRate == null ? null : Math.round(usd * krwRate));

  const coin = useCoinJournal();
  const stock = useStockJournal();
  const ready = coin.mounted || stock.mounted;

  const journalRows = useMemo(() => {
    const c = coin.entries.map((e) => ({ key: `c${e.id}`, name: e.name, tag: '코인', result: e.result, resultR: e.resultR, ts: e.ts }));
    const s = stock.entries.map((e) => ({ key: `s${e.id}`, name: e.name, tag: '주식', result: e.result, resultR: e.resultR, ts: e.ts }));
    return [...c, ...s].sort((a, b) => b.ts - a.ts);
  }, [coin.entries, stock.entries]);

  // 최근 7일 거래소 실현손익
  const perf = useMemo(() => {
    const ps = hist?.positions ?? [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const bars: Bar[] = Array.from({ length: 7 }, (_, i) => {
      const dayStart = t0 - (6 - i) * DAY;
      return { label: new Date(dayStart).toLocaleDateString('ko-KR', { weekday: 'short' }), v: 0, has: false };
    });
    let net = 0, win = 0, loss = 0;
    for (const p of ps) {
      net += p.netProfit;
      if (p.netProfit > 0) win++; else if (p.netProfit < 0) loss++;
      if (p.closeTs >= t0 - 6 * DAY && p.closeTs < t0 + DAY) {
        const idx = Math.floor((p.closeTs - (t0 - 6 * DAY)) / DAY);
        if (idx >= 0 && idx < 7) { bars[idx].v += p.netProfit; bars[idx].has = true; }
      }
    }
    return { bars, net, closed: ps.length, win, loss };
  }, [hist]);

  const [modal, setModal] = useState<Modal>(null);

  return (
    <div className="max-w-lg mx-auto pb-12 space-y-4">
      {/* ── 계좌 ── */}
      <section>
        <div className="fin-sec"><h3>계좌</h3><Link href="/bitget" className="fin-more">계좌 상세</Link></div>

        {isLoading && <div className="h-28 rounded-2xl bg-[var(--surface-2)] animate-pulse" />}
        {acc?.locked && <UnlockGate />}
        {acc && !acc.locked && acc.configured === false && (
          <Link href="/bitget" className="block rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-600">
            🔑 API 키가 연결되지 않았습니다 — <span className="underline">계좌 상세에서 설정하기</span>
          </Link>
        )}
        {configured && (
          <div className="space-y-3">
            {/* USDT-M 선물 잔액(큰 박스) */}
            <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] p-5">
              {/* 제목 + 사용가능·미실현 포인트 + 선물 배지 */}
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
                  {/* USDT — 크고 파랑 */}
                  <span className="text-3xl font-extrabold text-[var(--accent)] tabular-nums leading-none">${fmtUsd(pos.account.equity)}</span>
                  <span className="text-xs font-bold text-[var(--accent)]/70">USDT</span>
                  {/* KRW — 색·크기 다르게(검정·중간) */}
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
            </div>

            {/* USDT 선물 포지션 — 현물보다 먼저 */}
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

            {/* 현물(spot) 평가금액 박스 — 포지션 아래로 */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-[var(--text-muted)]">현물(spot) 평가금액</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{(acc?.assets?.length ?? 0)}개 자산 · USDT 환산</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[var(--text)] tabular-nums">${fmtUsd(acc?.totalUsdt ?? 0)}</p>
                {toKrw(acc?.totalUsdt ?? 0) != null && <p className="text-[11px] font-semibold text-[var(--text-muted)] tabular-nums">≈ ₩{toKrw(acc?.totalUsdt ?? 0)!.toLocaleString('ko-KR')}</p>}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 성과(최근 7일) — 거래소 실현손익 ── */}
      <section>
        <div className="fin-sec"><h3>성과 <span className="text-[11px] font-semibold text-[var(--faint)] align-middle">최근 7일</span></h3><Link href="/performance" className="fin-more">전체 성과</Link></div>
        <div className="fin-card p-4">
          {!configured ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">거래소(API 키) 연결 후 표시됩니다.</p>
          ) : !hist ? (
            <div className="skeleton h-28" />
          ) : hist.error ? (
            <p className="text-xs text-amber-600 py-6 text-center">청산 이력 조회 실패 — API 키에 선물 읽기 권한이 필요합니다.</p>
          ) : perf.closed === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">최근 7일 청산된 선물 포지션이 없습니다.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">순손익</p>
                  <p className={`text-base font-bold tabular-nums ${perf.net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{perf.net >= 0 ? '+' : ''}{fmtUsd(perf.net)}</p>
                  <p className="text-[9px] text-[var(--text-muted)]">USDT</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">청산</p>
                  <p className="text-base font-bold tabular-nums text-[var(--text)]">{perf.closed}건</p>
                </div>
                <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                  <p className="text-[10px] text-[var(--text-muted)]">이익·손실</p>
                  <p className="text-base font-bold tabular-nums"><span className="text-emerald-500">{perf.win}</span><span className="text-[var(--text-muted)]"> · </span><span className="text-red-500">{perf.loss}</span></p>
                </div>
              </div>
              <PerfGraph bars={perf.bars} />
              <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-70">막대 = 일별 실현손익(USDT, 초록 이익·빨강 손실) · 거래소 자동 집계</p>
            </>
          )}
        </div>
      </section>

      {/* ── 작은 박스 버튼 → 팝업 ── */}
      <div className="grid grid-cols-3 gap-2.5">
        <BoxButton icon="signal"    label="청산내역"  sub="USDT 선물" onClick={() => setModal('closed')} />
        <BoxButton icon="portfolio" label="이체내역"  sub="입출금"     onClick={() => setModal('transfers')} />
        <BoxButton icon="journal"   label="매매일지"  sub="기록·복기"  onClick={() => setModal('journal')} />
      </div>

      {/* ── 팝업들 ── */}
      <BottomSheet open={modal === 'closed'} onClose={() => setModal(null)} title="선물 청산 내역" full>
        {configured ? <ClosedTrades /> : <p className="text-xs text-[var(--text-muted)] py-6 text-center">계좌(API 키)가 연결되지 않았습니다.</p>}
      </BottomSheet>

      <BottomSheet open={modal === 'transfers'} onClose={() => setModal(null)} title="입출금·이체 내역">
        <TransfersBody configured={configured} />
      </BottomSheet>

      <BottomSheet open={modal === 'journal'} onClose={() => setModal(null)} title="매매일지"
        full
        footer={<Link href="/journal" className="kl-cta block text-center py-2.5 text-sm" onClick={() => setModal(null)}>전체 매매일지 열기 (결과 입력·복기)</Link>}>
        {ready ? <JournalBody rows={journalRows} /> : <div className="skeleton h-40" />}
      </BottomSheet>
    </div>
  );
}
