'use client';

/**
 * 홈 › 시장 요약의 주요 지표 가로 스트립 — 환율·코인·금리·유가·심리를 한 줄로 훑는다(정보 밀도).
 * 가격 타일은 한국 관행 색(상승=빨강·하락=파랑). 거시 타일의 보조 문구 색은 '위험자산 우호/불리' 의미(시장환경 카드와 같음).
 */
import Link from 'next/link';
import useSWR from 'swr';
import type { EnvCard, Tone } from '@/lib/coinDashboard';
import type { FxRate, CryptoData } from '@/lib/types';
import { fmtCoinPrice } from '@/lib/coins';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const TONE_COLOR: Record<Tone, string> = { up: 'var(--ok)', down: 'var(--warn)', warn: 'var(--amber)', neutral: 'var(--faint)' };

interface Tile { key: string; label: string; value: string; href: string; chg?: number | null; note?: string | null; tone?: Tone; skeleton?: boolean }

function chgText(v: number) { return `${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${Math.abs(v).toFixed(2)}%`; }
function chgColor(v: number) { return v > 0 ? 'var(--warn)' : v < 0 ? 'var(--accent)' : 'var(--faint)'; }

export default function MarketStrip() {
  const { data: m, error: mErr } = useSWR<{ usdkrw?: FxRate | null; usdtkrw?: FxRate | null }>('/api/market', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const { data: c, error: cErr } = useSWR<Record<string, CryptoData>>('/api/crypto/batch?symbols=BTCUSDT,ETHUSDT', fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const { data: env } = useSWR<{ env: { cards: EnvCard[] } | null }>('/api/coin-env', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const card = (k: string) => env?.env?.cards?.find((x) => x.key === k);

  const tiles: Tile[] = [];
  // 늦게 오는 소스는 자리표시를 먼저 깔아 타일이 나중에 끼어들며 밀리지 않게 한다
  const pending = (n: number, k: string) => Array.from({ length: n }, (_, i) => ({ key: `${k}${i}`, label: '', value: '', href: '#', skeleton: true }) as Tile);
  if (!m && !mErr) tiles.push(...pending(1, 'm'));
  if (m?.usdkrw) tiles.push({ key: 'usd', label: '원/달러', value: `${m.usdkrw.value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}원`, chg: m.usdkrw.changeRate, href: '/overseas' });
  const btc = c?.BTCUSDT, eth = c?.ETHUSDT;
  if (!c && !cErr) tiles.push(...pending(2, 'c'));
  if (btc) tiles.push({ key: 'btc', label: '비트코인', value: fmtCoinPrice(btc.price), chg: btc.changeRate, href: '/crypto/BTCUSDT' });
  if (eth) tiles.push({ key: 'eth', label: '이더리움', value: fmtCoinPrice(eth.price), chg: eth.changeRate, href: '/crypto/ETHUSDT' });
  if (m?.usdtkrw) tiles.push({ key: 'usdt', label: 'USDT', value: `${m.usdtkrw.value.toLocaleString('ko-KR')}원`, chg: m.usdtkrw.changeRate, href: '/coins' });
  for (const k of ['d10', 'brent', 'fng', 'kimchi']) {
    const x = card(k);
    if (x) tiles.push({ key: k, label: x.label, value: x.value, note: x.sub?.replace('전일 대비 ', '') ?? null, tone: x.subTone, href: '/coins' });
  }

  return (
    <section>
      <div className="fin-sec">
        <h3>주요 지표</h3>
        <Link href="/coins" className="fin-more">거시 환경</Link>
      </div>
      <div className="strip" role="list">
        {tiles.length === 0
          ? [0, 1, 2, 3].map((i) => (
            <div key={i} className="strip-t" aria-hidden>
              <span className="skeleton h-3 w-12" /><span className="skeleton h-4 w-20 mt-2" /><span className="skeleton h-3 w-10 mt-2" />
            </div>
          ))
          : tiles.map((t) => t.skeleton ? (
            <div key={t.key} className="strip-t" aria-hidden>
              <span className="skeleton h-3 w-12" /><span className="skeleton h-4 w-20 mt-2" /><span className="skeleton h-3 w-10 mt-2" />
            </div>
          ) : (
            <Link key={t.key} href={t.href} className="strip-t" role="listitem">
              <div className="k">{t.label}</div>
              <div className="v tabular-nums">{t.value}</div>
              {t.chg != null ? (
                <div className="c tabular-nums" style={{ color: chgColor(t.chg) }}>{chgText(t.chg)}</div>
              ) : (
                <div className="c tabular-nums" style={{ color: t.tone ? TONE_COLOR[t.tone] : 'var(--faint)' }}>{t.note ?? ' '}</div>
              )}
            </Link>
          ))}
      </div>
    </section>
  );
}
