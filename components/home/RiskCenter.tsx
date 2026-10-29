'use client';

/**
 * 홈 Risk Center(2.0 기획서 §5.1-4) — 내 매매 요약(오늘·이번 달·30일 수수료·1시간 미만 매매) + 오늘/7일 손실 한도 게이지
 * + 리스크 계산·복기로 가는 버튼. 데이터 = 복기 대시보드와 같은 Bitget 청산 이력(게이트 뒤)·lib/reviewDash 계산 그대로.
 * 잠금 안 된 기기(401)·키 없음이면 개인 수치는 숨기고 이동 버튼만. 개인 수치는 외부로 보내지 않는다(화면 렌더만).
 */
import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import { lossGauge, weekRules } from '@/lib/reviewDash';
import { kstDateKey } from '@/lib/journalAnalytics';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const fetcher = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
const tone = (v: number) => (v > 0 ? 'var(--up)' : v < 0 ? 'var(--down)' : 'var(--ink)');

function Gauge({ label, used, limit, assumed }: { label: string; used: number; limit: number | null; assumed?: boolean }) {
  const loss = Math.max(0, -used);
  const pct = limit ? Math.min(100, (loss / limit) * 100) : 0;
  const col = pct >= 100 ? 'var(--warn)' : pct >= 70 ? 'var(--warning)' : 'var(--ok)';
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tabular-nums font-semibold text-[var(--ink)]">{limit ? `${fmt(loss)} / ${fmt(limit)}${assumed ? '(가정)' : ''}` : '한도 미설정'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] mt-1 overflow-hidden" role="meter" aria-label={`${label} 손실 한도 사용률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
      </div>
    </div>
  );
}

export default function RiskCenter() {
  const { data, error } = useSWR<{ positions?: ClosedPosition[]; error?: string; configured?: boolean }>('/api/bitget/history?days=31', fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: pos } = useSWR<{ account?: { equity?: number } | null }>(data?.positions ? '/api/bitget/positions' : null, fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: fx } = useSWR<{ price: number | null }>('/api/crypto/usdt-krw', fetcher, { refreshInterval: 60_000 });
  const { limits } = useRiskLimits();
  const [now] = useState(() => Date.now()); // 렌더 중 Date.now() 금지(react-hooks/purity)
  const ps = data?.positions;
  const ready = !!ps && !data?.error && data?.configured !== false;
  const krw = (u: number) => (fx?.price ? `${u > 0 ? '+' : u < 0 ? '−' : ''}₩${Math.abs(Math.round(u * fx.price)).toLocaleString('ko-KR')}` : '');

  let body: React.ReactNode;
  if (!data && !error) body = <div className="skeleton" style={{ height: 150 }} />;
  else if (!ready) body = <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed">잠금 해제한 기기에서 오늘 손익·손실 한도가 여기 표시됩니다. 진입 전 손절·수량은 리스크 계산에서 확인하세요.</p>;
  else {
    const today = kstDateKey(now), month = today.slice(0, 7);
    const todayNet = ps!.filter((p) => kstDateKey(p.closeTs) === today).reduce((a, p) => a + p.netProfit, 0);
    const monthNet = ps!.filter((p) => kstDateKey(p.closeTs).startsWith(month)).reduce((a, p) => a + p.netProfit, 0);
    const ps30 = ps!.filter((p) => p.closeTs >= now - 30 * 86_400_000);
    const fee = ps30.reduce((a, p) => a + p.fee, 0);
    const wk = weekRules(ps!, now);
    const eq = typeof pos?.account?.equity === 'number' && pos.account.equity > 0 ? pos.account.equity : null;
    const g = lossGauge(ps!, now, limits, eq);
    const row = (k: string, v: number, unit = 'USDT', href = '/review', plain = false) => (
      <Link href={href} className="flex items-baseline justify-between gap-2 py-1.5 border-b border-[var(--line-2)] last:border-0 hover:opacity-80">
        <span className="text-[12.5px] text-[var(--text-muted)]">{k}</span>
        <span className="tabular-nums text-right">
          <b className="text-[15px] font-bold" style={{ color: plain ? 'var(--ink)' : tone(v) }}>{plain ? v : signed(v)}</b>
          <span className="text-[10.5px] text-[var(--text-muted)] ml-1">{unit}</span>
          {!plain && krw(v) && <span className="block text-[10.5px] text-[var(--faint)]">{krw(v)}</span>}
        </span>
      </Link>
    );
    body = (
      <>
        <div>
          {row('오늘 손익', todayNet)}
          {row('이번 달 순손익', monthNet)}
          {row('30일 수수료', fee, 'USDT', '/journal?tab=cost')}
          {row(`이번 주 1시간 미만 매매(지난주 ${wk.prev.scalpN})`, wk.cur.scalpN, '건', '/review', true)}
        </div>
        <div className="space-y-2.5 mt-3">
          <Gauge label="오늘 손실 한도" used={g.today} limit={g.dailyLimit} assumed={g.dailyAssumed} />
          <Gauge label="7일 손실 한도" used={g.week} limit={g.weeklyLimit} />
        </div>
      </>
    );
  }

  return (
    <section className="fin-card p-4 lg:p-5 h-full flex flex-col" aria-label="리스크 센터">
      <div className="dash-h"><h2>리스크 센터</h2><Link href="/coin-analysis" className="dash-more">한도 설정 →</Link></div>
      <div className="flex-1">{body}</div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <Link href="/simulate" className="btn-3d min-h-[42px] text-[13px]">리스크 계산</Link>
        <Link href="/review" className="btn-2nd min-h-[42px] text-[13px]">매매 복기</Link>
      </div>
    </section>
  );
}
