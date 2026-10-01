'use client';

/**
 * 국내 종목 가격 알림 감시(레이아웃 전역, 화면 없음 + 울릴 때 배너).
 *
 * 이전엔 알림을 저장만 하고 아무도 가격을 확인하지 않아 **한 번도 울린 적이 없었다**(10-01 발견).
 * 켜진 알림이 있을 때만 /api/stock/batch 를 30초마다 확인(탭이 숨겨지면 SWR 이 멈춤 — 앱이 열려 있을 때만 동작,
 * 서버 푸시 아님). 기준을 넘으면 브라우저 알림(권한 있으면) + 화면 배너, 그리고 그 알림을 끈다(한 번만).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAlerts } from '@/hooks/useAlerts';
import { checkAlert, isAlertOn } from '@/lib/priceAlert';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
interface Hit { id: string; ticker: string; name: string; side: 'above' | 'below'; price: number; target: number }

export default function PriceAlertWatcher() {
  const { alerts, patchAlert } = useAlerts();
  const [hits, setHits] = useState<Hit[]>([]);

  const tickers = useMemo(() => Object.entries(alerts).filter(([, a]) => isAlertOn(a)).map(([t]) => t).sort().slice(0, 20), [alerts]);
  const { data } = useSWR<Record<string, { price?: number; name?: string }>>(
    tickers.length ? `/api/stock/batch?tickers=${tickers.join(',')}` : null, fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true, dedupingInterval: 10000 },
  );

  useEffect(() => {
    if (!data) return;
    for (const t of tickers) {
      const a = alerts[t];
      const d = data[t];
      if (!a || !d?.price) continue;
      const side = checkAlert(a, d.price);
      if (!side) continue;
      const name = a.name || d.name || t;
      const target = (side === 'above' ? a.above : a.below) as number;
      patchAlert(t, { enabled: false, firedAt: Date.now(), firedSide: side, firedPrice: d.price, name });
      const body = `${d.price.toLocaleString()}원 — ${target.toLocaleString()}원 ${side === 'above' ? '이상' : '이하'} 도달`;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(`${name} 가격 알림`, { body, icon: '/icon-192.png', tag: `kl-alert-${t}` }); } catch { /* 일부 모바일 브라우저는 페이지에서 직접 생성 불가 */ }
      }
      setHits((h) => [...h.slice(-2), { id: `${t}-${Date.now()}`, ticker: t, name, side, price: d.price!, target }]);
    }
  }, [data, tickers, alerts, patchAlert]);

  useEffect(() => {
    if (!hits.length) return;
    const tm = setTimeout(() => setHits((h) => h.slice(1)), 9000);
    return () => clearTimeout(tm);
  }, [hits]);

  if (!hits.length) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', left: 0, right: 0, top: 'calc(env(safe-area-inset-top, 0px) + 64px)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 12px' }}>
      {hits.map((h) => (
        <div key={h.id} className="fin-card" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-card)', borderLeft: `4px solid ${h.side === 'above' ? 'var(--warn)' : 'var(--accent)'}` }}>
          <span aria-hidden style={{ fontSize: 18 }}>🔔</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{h.name} {h.side === 'above' ? '목표가 도달' : '하한가 도달'}</div>
            <div className="tabular-nums" style={{ fontSize: 12, color: 'var(--muted)' }}>{h.price.toLocaleString()}원 · 기준 {h.target.toLocaleString()}원 {h.side === 'above' ? '이상' : '이하'} · 알림은 꺼졌습니다</div>
          </div>
          <Link href={`/stock/${h.ticker}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>보기</Link>
          <button type="button" aria-label="닫기" onClick={() => setHits((x) => x.filter((y) => y.id !== h.id))}
            style={{ border: 'none', background: 'transparent', color: 'var(--faint)', fontSize: 16, cursor: 'pointer', padding: 2 }}>×</button>
        </div>
      ))}
    </div>
  );
}
