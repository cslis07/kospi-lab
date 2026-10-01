'use client';

/**
 * 가격 알림 관리 — 종목별로 흩어진 알림을 한 화면에서 목록·켜기/끄기·삭제(참고: TradingView 알림 관리·토스증권).
 *  ① 국내 종목 가격 알림(종목 상세 › 보유·가격 알림에서 설정) — 현재가·기준까지 거리·마지막 발동
 *  ② 코인선물 조건 알림(코인선물 분석에서 설정) — 진입 조건·방향 전환
 * 감시는 앱이 열려 있을 때만(components/PriceAlertWatcher, 30초). 서버 푸시가 아니라는 점을 화면에 밝힌다.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAlerts } from '@/hooks/useAlerts';
import { useCoinAlerts } from '@/hooks/useCoinAlerts';
import { alertDistancePct, isAlertOn } from '@/lib/priceAlert';
import { kstDateTime } from '@/lib/csv';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const won = (n?: number) => (n == null ? '—' : `${n.toLocaleString()}원`);

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className="hit hit-icon shrink-0" style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
      <span className={`tgl ${on ? 'on' : ''}`} aria-hidden style={{ display: 'block', marginLeft: 0 }} />
    </button>
  );
}

function DelBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="hit hit-icon shrink-0 text-[12px] font-semibold text-[var(--text-muted)] hover:text-red-400 px-2 py-1 rounded-lg border border-[var(--border)]">
      삭제
    </button>
  );
}

export default function AlertsPage() {
  const { alerts, mounted, toggleAlert, removeAlert } = useAlerts();
  const coin = useCoinAlerts();
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => { setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);
  const askPerm = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  const tickers = useMemo(() => Object.keys(alerts).sort(), [alerts]);
  const { data: px } = useSWR<Record<string, { price?: number; name?: string; changeRate?: number }>>(
    tickers.length ? `/api/stock/batch?tickers=${tickers.slice(0, 20).join(',')}` : null, fetcher, { refreshInterval: 15000 },
  );

  // 켜진 것 먼저, 그다음 기준에 가까운 순
  const rows = useMemo(() => tickers.map((t) => {
    const a = alerts[t];
    const price = px?.[t]?.price;
    return { t, a, name: a.name || px?.[t]?.name || t, price, on: isAlertOn(a), dist: alertDistancePct(a, price) };
  }).sort((x, y) => (Number(y.on) - Number(x.on)) || (Math.abs(x.dist ?? 1e9) - Math.abs(y.dist ?? 1e9))), [tickers, alerts, px]);

  const coinRules = Object.values(coin.rules);
  const onCount = rows.filter((r) => r.on).length + coinRules.filter((r) => r.enabled !== false).length;
  const del = (label: string, fn: () => void) => { if (window.confirm(`${label} 알림을 삭제할까요?`)) fn(); };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      <div className="px-1">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          종목마다 따로 걸어 둔 알림을 여기서 한 번에 켜고 끄고 지웁니다. 지금 켜진 알림 <b className="text-[var(--text)]">{onCount}개</b>.
          가격은 <b className="text-[var(--text)]">앱이 열려 있는 동안 30초마다</b> 확인하며(서버 푸시 아님), 한 번 울린 알림은 자동으로 꺼집니다.
        </p>
        {perm !== 'granted' && (
          <div className="mt-3 flex items-center gap-2 flex-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
            {perm === 'unsupported' ? '이 브라우저는 알림을 지원하지 않습니다 — 앱 화면 위 배너로만 알려 드립니다.'
              : perm === 'denied' ? '브라우저 알림이 차단돼 있습니다 — 사이트 설정에서 허용하면 다른 탭을 보고 있어도 알려 드립니다(앱 안 배너는 계속 표시).'
              : <>브라우저 알림을 허용하면 다른 탭을 보고 있어도 알려 드립니다.
                  <button type="button" onClick={askPerm} className="ml-auto px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold">알림 허용</button></>}
          </div>
        )}
      </div>

      {/* ① 국내 종목 가격 알림 */}
      <section>
        <div className="fin-sec"><h3>국내 종목 가격 알림 <span className="text-[11px] font-semibold text-[var(--faint)] ml-1">{rows.length}개</span></h3></div>
        <div className="fin-card overflow-hidden">
          {!mounted ? <div className="skeleton h-24" /> : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)] leading-relaxed">
              설정한 가격 알림이 없습니다.<br />종목 상세 › <b className="text-[var(--text)]">보유 · 가격 알림</b>에서 목표가·하한가를 넣으면 여기에 모입니다.
            </p>
          ) : rows.map(({ t, a, name, price, on, dist }) => (
            <div key={t} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0" style={{ opacity: on ? 1 : 0.6 }}>
              <div className="min-w-0 flex-1">
                <Link href={`/stock/${t}`} prefetch={false} className="text-[14px] font-bold text-[var(--text)] hover:underline">{name}</Link>
                <span className="ml-1.5 text-[11px] text-[var(--faint)]">{t}</span>
                <div className="text-[12px] text-[var(--text-muted)] tabular-nums mt-0.5 flex flex-wrap gap-x-3">
                  {a.above != null && <span><b style={{ color: 'var(--warn)' }}>↑</b> {won(a.above)} 이상</span>}
                  {a.below != null && <span><b style={{ color: 'var(--accent)' }}>↓</b> {won(a.below)} 이하</span>}
                </div>
                <div className="text-[11.5px] tabular-nums mt-0.5" style={{ color: 'var(--faint)' }}>
                  현재 {won(price)}{dist != null && on ? ` · 기준까지 ${Math.abs(dist).toFixed(1)}%` : ''}
                  {a.firedAt ? ` · ${kstDateTime(a.firedAt).slice(5)} ${a.firedSide === 'above' ? '목표가' : '하한가'} 도달로 울림(${won(a.firedPrice)})` : ''}
                </div>
              </div>
              <Switch on={on} onChange={(v) => toggleAlert(t, v)} label={`${name} 알림 ${on ? '끄기' : '켜기'}`} />
              <DelBtn onClick={() => del(name, () => removeAlert(t))} label={`${name} 알림 삭제`} />
            </div>
          ))}
        </div>
      </section>

      {/* ② 코인선물 조건 알림 */}
      <section>
        <div className="fin-sec"><h3>코인선물 조건 알림 <span className="text-[11px] font-semibold text-[var(--faint)] ml-1">{coinRules.length}개</span></h3></div>
        <div className="fin-card overflow-hidden">
          {coinRules.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)] leading-relaxed">
              설정한 조건 알림이 없습니다.<br /><Link href="/coin-analysis" className="underline">코인선물 분석</Link>에서 진입 조건·방향 전환 알림을 걸 수 있습니다(분석 화면이 열려 있을 때 동작).
            </p>
          ) : coinRules.map((r) => {
            const on = r.enabled !== false && (r.onEntryOk || !!r.onDirection);
            const conds = [r.onEntryOk && '진입 조건 충족', r.onDirection && `${r.onDirection === 'long' ? '롱' : '숏'} 전환`].filter(Boolean).join(' · ') || '조건 없음';
            return (
              <div key={r.symbol} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0" style={{ opacity: on ? 1 : 0.6 }}>
                <div className="min-w-0 flex-1">
                  <Link href={`/coin-analysis?symbol=${encodeURIComponent(r.symbol)}`} prefetch={false} className="text-[14px] font-bold text-[var(--text)] hover:underline">{r.symbol.replace(/USDT$/, '')}</Link>
                  <span className="ml-1.5 text-[11px] text-[var(--faint)]">USDT 무기한</span>
                  <div className="text-[12px] text-[var(--text-muted)] mt-0.5">{conds}</div>
                  {r.lastFiredTs ? <div className="text-[11.5px] text-[var(--faint)] tabular-nums mt-0.5">마지막 알림 {kstDateTime(r.lastFiredTs).slice(5)}</div> : null}
                </div>
                <Switch on={on} onChange={(v) => coin.setRule(r.symbol, { enabled: v })} label={`${r.symbol} 알림 ${on ? '끄기' : '켜기'}`} />
                <DelBtn onClick={() => del(r.symbol, () => coin.removeRule(r.symbol))} label={`${r.symbol} 알림 삭제`} />
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-[var(--faint)] leading-relaxed px-1">
        알림은 이 기기(클라우드 동기화를 켰다면 다른 기기도)에 저장됩니다. 가격 도달 알림은 참고용이며 매수·매도 신호가 아닙니다.
      </p>
    </div>
  );
}
