'use client';

/**
 * 가격 알림 관리 — 종목별로 흩어진 알림을 한 화면에서 목록·켜기/끄기·삭제(참고: TradingView 알림 관리·토스증권).
 *  ① 국내 종목 가격 알림(종목 상세 › 보유·가격 알림에서 설정) — 현재가·기준까지 거리·마지막 발동
 *  ② 코인 가격 알림(코인선물 분석 › 🔔 가격 알림 등록) — 심볼별 익절·손절·추적선, 개별 켜기/끄기·삭제·모두 지우기
 *  ③ 코인선물 조건 알림(코인선물 분석에서 설정) — 진입 조건·방향 전환
 * 감시는 앱이 열려 있을 때만(components/PriceAlertWatcher, 30초). 서버 푸시가 아니라는 점을 화면에 밝힌다.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAlerts } from '@/hooks/useAlerts';
import { useCoinAlerts } from '@/hooks/useCoinAlerts';
import { useCoinPriceAlerts } from '@/hooks/useCoinPriceAlerts';
import type { CoinPriceAlert } from '@/lib/coinPriceAlert';
import { alertDistancePct, isAlertOn } from '@/lib/priceAlert';
import { kstDateTime } from '@/lib/csv';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const won = (n?: number) => (n == null ? '—' : `${n.toLocaleString()}원`);
/** USDT 가격 표기(PriceAlertWatcher 와 같은 자릿수 규칙) */
const usd = (n?: number) => (n == null || !(n > 0) ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 1 : n >= 1 ? 3 : 5 })}`);

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

  // 코인 가격 알림(익절·손절·추적선) — 심볼별로 묶고, 켜진 것 먼저·가격 높은 순
  const cpa = useCoinPriceAlerts();
  const coinGroups = useMemo(() => {
    const by = new Map<string, CoinPriceAlert[]>();
    for (const a of cpa.alerts) by.set(a.symbol, [...(by.get(a.symbol) ?? []), a]);
    return [...by.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([symbol, list]) => ({
      symbol, list: [...list].sort((a, b) => (Number(b.enabled) - Number(a.enabled)) || (b.price - a.price)),
    }));
  }, [cpa.alerts]);
  const coinSyms = useMemo(() => coinGroups.map((g) => g.symbol).slice(0, 8), [coinGroups]);
  const { data: cpx } = useSWR<Record<string, { price?: number }>>(
    coinSyms.length ? `/api/crypto/batch?symbols=${coinSyms.join(',')}` : null, fetcher, { refreshInterval: 20000 },
  );

  const onCount = rows.filter((r) => r.on).length + coinRules.filter((r) => r.enabled !== false).length
    + cpa.alerts.filter((a) => a.enabled).length;
  const del = (label: string, fn: () => void) => { if (window.confirm(`${label} 알림을 삭제할까요?`)) fn(); };

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto space-y-5 pb-8">
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

      {/* ② 코인 가격 알림(익절·손절선) */}
      <section>
        <div className="fin-sec"><h3>코인 가격 알림 <span className="text-[11px] font-semibold text-[var(--faint)] ml-1">{cpa.alerts.length}개</span></h3></div>
        <p className="px-1 -mt-1 mb-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          코인선물 분석에서 등록한 익절·손절·추적 가격선입니다. <b className="text-[var(--text)]">앱이 열려 있을 때만 확인</b>하며(서버 푸시 아님), 울린 알림은 자동으로 꺼집니다.
        </p>
        <div className="fin-card overflow-hidden">
          {!cpa.mounted ? <div className="skeleton h-24" /> : coinGroups.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)] leading-relaxed">
              등록한 코인 가격 알림이 없습니다.<br /><Link href="/coin-analysis" className="underline">코인선물 분석</Link>의 <b className="text-[var(--text)]">🔔 가격 알림 등록</b>으로 익절·손절선을 걸면 여기에 모입니다.
            </p>
          ) : coinGroups.map(({ symbol, list }) => {
            const base = symbol.replace(/USDT$/, '');
            const cur = cpx?.[symbol]?.price;
            return (
              <div key={symbol} className="border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <Link href={`/coin-analysis?symbol=${encodeURIComponent(symbol)}&run=1`} prefetch={false} className="text-[14px] font-bold text-[var(--text)] hover:underline">{base}</Link>
                  <span className="text-[11px] text-[var(--faint)] tabular-nums">현재 {usd(cur)} · {list.length}개</span>
                  <Link href={`/coin-analysis?symbol=${encodeURIComponent(symbol)}&run=1`} prefetch={false} className="ml-auto text-[11.5px] font-semibold text-[var(--accent)] whitespace-nowrap">분석 열기</Link>
                  <button type="button" onClick={() => del(`${base} 코인 가격`, () => cpa.removeBySymbol(symbol))}
                    className="text-[11.5px] text-[var(--text-muted)] underline hover:text-red-400 whitespace-nowrap" aria-label={`${base} 가격 알림 모두 지우기`}>모두 지우기</button>
                </div>
                {list.map((a) => {
                  const dist = cur && cur > 0 ? ((a.price - cur) / cur) * 100 : null;
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2 pl-6" style={{ opacity: a.enabled ? 1 : 0.6 }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-[var(--text)] tabular-nums">
                          <b style={{ color: a.side === 'above' ? 'var(--warn)' : 'var(--accent)' }}>{a.side === 'above' ? '↑' : '↓'}</b>{' '}
                          <span className="font-semibold">{a.label}</span> {usd(a.price)} {a.side === 'above' ? '이상' : '이하'}
                        </div>
                        <div className="text-[11px] tabular-nums mt-0.5" style={{ color: 'var(--faint)' }}>
                          {dist != null && a.enabled ? `기준까지 ${Math.abs(dist).toFixed(1)}%` : a.enabled ? '확인 대기' : '꺼짐'}
                          {a.firedAt ? ` · ${kstDateTime(a.firedAt).slice(5)} 도달로 울림(${usd(a.firedPrice)})` : ''}
                        </div>
                      </div>
                      <Switch on={a.enabled} onChange={(v) => cpa.patch(a.id, { enabled: v })} label={`${base} ${a.label} 알림 ${a.enabled ? '끄기' : '켜기'}`} />
                      <DelBtn onClick={() => del(`${base} ${a.label}`, () => cpa.remove(a.id))} label={`${base} ${a.label} 알림 삭제`} />
                    </div>
                  );
                })}
                <div className="h-1.5" />
              </div>
            );
          })}
        </div>
      </section>

      {/* ③ 코인선물 조건 알림 */}
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
