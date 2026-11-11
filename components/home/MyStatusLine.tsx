'use client';

/**
 * 홈 맨 위 '지금 내 상태' 한 줄 — 앱을 열자마자 위험한 상태인지 보이게(2026-10-26 메뉴 단순화).
 * 가드 마지막 확인(5분 크론) · 열린 포지션과 손절 주문 여부 · 냉각 타이머. 잠금 해제 안 된 기기는 401 → 아무것도 안 보임.
 */
import Link from 'next/link';
import { useEffect } from 'react';
import useSWR from 'swr';
import type { MyStatus } from '@/lib/guard';

const fetcher = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const STALE = 15 * 60_000;
const ago = (ms: number) => (ms < 60_000 ? '방금' : ms < 3_600_000 ? `${Math.round(ms / 60_000)}분 전` : `${Math.round(ms / 3_600_000)}시간 전`);
const base = (s: string) => s.replace('USDT', '');
/** USDT 가격 — 큰 값은 소수 2자리, 1 미만 코인은 4~6자리 */
const px = (n: number) => (n > 0 ? n.toLocaleString('en-US', n >= 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: n >= 1 ? 4 : 6 }) : '-');
const usdt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LIQ_NEAR = 15;   // 청산까지 15% 미만이면 경고색(자산 화면과 같은 기준)
type Pos = MyStatus['positions'][number];

/** 지난번에 이 줄이 보였던 기기면 html.kl-st(layout 의 첫 페인트 스크립트) — .status-slot 이 그 높이만큼 자리를 미리 잡는다(늦게 끼어들며 홈을 밀어내던 화면 밀림 방지).
 *  값 '1' = 포지션 없음(짧은 카드), 'p' = 포지션 상세 줄이 있는 카드(html.kl-stp 로 더 높게) */
const SLOT_KEY = 'kl-st';
function rememberSlot(v: '1' | 'p' | null) {
  try { if (v) localStorage.setItem(SLOT_KEY, v); else localStorage.removeItem(SLOT_KEY); } catch { /* 저장 불가 무시 */ }
}

export default function MyStatusLine() {
  const { data, error } = useSWR<MyStatus & { configured?: boolean; asOf?: number }>('/api/bitget/status', fetcher, { refreshInterval: 60_000, shouldRetryOnError: false });
  const shown = !!(data?.configured && data.positions);
  const slot = shown ? (data?.positions?.length ? 'p' : '1') : null;
  useEffect(() => { if (data || error) rememberSlot(slot); }, [data, error, slot]);
  return <div className="status-slot mb-3">{shown && data ? <StatusLink data={data} /> : null}</div>;
}

function StatusLink({ data }: { data: MyStatus & { configured?: boolean; asOf?: number } }) {
  if (!data.positions) return null;
  // 렌더 중 Date.now() 대신 응답 수신 시점 기준(SWR 갱신마다 다시 계산)
  const now = data.asOf ?? data.heartbeatAt ?? 0;
  const hbAge = data.heartbeatAt != null ? Math.max(0, now - data.heartbeatAt) : null;
  const stale = hbAge == null || hbAge > STALE;
  const noSl = data.positions.filter((p) => p.slSet === false);
  // 냉각(서킷브레이커·손실 직후)은 상단 전역 배너(CooldownBanner)가 이미 크게 보여 줘서 여기선 중복 표시하지 않는다
  const bad = stale || noSl.length > 0;
  return (
    <Link href={data.positions.length ? '/coin-analysis' : '/review'}
      className={`block rounded-2xl border px-3.5 py-2.5 text-[12.5px] leading-snug ${bad ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
      <span className="text-[var(--text)] font-semibold">{bad ? '⚠️ ' : '🛡 '}지금 내 상태</span>
      <span className="text-[var(--text-muted)]"> · 가드 {hbAge == null ? '기록 없음' : `${ago(hbAge)} 확인`}{stale ? '(멈춤?)' : ''}</span>
      {data.positions.length
        ? data.positions.map((p) => <PosRow key={p.symbol + p.side} p={p} />)
        : <span className="block mt-0.5 text-[var(--text)]">열린 포지션 없음</span>}
    </Link>
  );
}

/** 포지션 1개 = 요약 줄(코인·방향·레버리지·손익·손절) + 상세 줄(진입·현재·청산·마진, 전부 USDT) */
function PosRow({ p }: { p: Pos }) {
  const sign = (n: number) => (n >= 0 ? '+' : '');
  const near = p.liqDistPct != null && p.liqDistPct < LIQ_NEAR;
  const pnlColor = p.pnlUsdt > 0 ? 'text-emerald-500' : p.pnlUsdt < 0 ? 'text-red-500' : '';
  return (
    <span className="block mt-1">
      <span className="block text-[var(--text)]">
        <b className="font-semibold">{base(p.symbol)} {p.side === 'long' ? '롱' : '숏'}{p.leverage > 0 ? ` ${p.leverage}x` : ''}</b>
        {p.marginMode && <span className="text-[var(--text-muted)]"> {p.marginMode === 'isolated' ? '격리' : '교차'}</span>}
        {' '}<span className={`tabular-nums ${pnlColor}`}>
          {p.pnlPct == null ? '' : `${sign(p.pnlPct)}${p.pnlPct.toFixed(2)}% `}({sign(p.pnlUsdt)}{usdt(p.pnlUsdt)} USDT)
        </span>
        {' '}{p.slSet === false ? '손절 ✗' : p.slSet ? `손절 ✓${p.slStop ? ` ${px(p.slStop)}` : ''}` : ''}
      </span>
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text-muted)] tabular-nums">
        <span>진입 {px(p.entry)}</span>
        <span>현재 {px(p.mark)}</span>
        <span className={near ? 'text-red-500 font-semibold' : ''}>
          청산 {px(p.liq)}{p.liqDistPct != null ? ` (${p.liqDistPct.toFixed(1)}%)` : ''}{near ? ' ⚠' : ''}
        </span>
        <span>마진 {usdt(p.margin)}</span>
        <span>(USDT)</span>
      </span>
    </span>
  );
}
