'use client';

import useSWR from 'swr';

interface Asset {
  coin: string;
  amount: number;
  available: number;
  frozen: number;
  price: number;
  usdtValue: number;
}
interface AccountResp {
  configured: boolean;
  totalUsdt?: number;
  assets?: Asset[];
  error?: string;
}

interface Bill {
  billId: string;
  ts: number;
  coin: string;
  groupType: string;
  businessType: string;
  size: number;
  fees: number;
}
interface Fill {
  tradeId: string;
  ts: number;
  symbol: string;
  side: string;
  priceAvg: number;
  size: number;
  amount: number | null;
  fee: number;
}
interface ActivityResp {
  configured: boolean;
  bills?: Bill[];
  fills?: Fill[];
  error?: string;
}

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
  TRANSFER_IN:  '내부 입금',
  TRANSFER_OUT: '내부 출금',
  DEPOSIT:      '입금',
  WITHDRAW:     '출금',
  BUY:          '매수',
  SELL:         '매도',
  TRADE:        '거래',
  CONVERT:      '환전',
  REWARD:       '보상',
};
const bizLabel = (b: string) => BIZ_LABEL[b] ?? b.toLowerCase().replace(/_/g, ' ');

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmtUsd = (n: number) => {
  if (n <= 0) return '0';
  if (n < 0.01) return '<0.01';
  if (n < 1) return n.toFixed(4);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export default function BitgetPage() {
  const { data, isLoading } = useSWR<AccountResp>('/api/bitget/account', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });
  const { data: act } = useSWR<ActivityResp>(
    data?.configured ? '/api/bitget/activity' : null,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  return (
    <div className="max-w-lg mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">비트겟 포트폴리오</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">내 Bitget 계좌 잔고를 실시간으로 조회합니다 (읽기 전용)</p>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
          {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />)}
        </div>
      )}

      {/* 키 미설정 → 설정 안내 */}
      {data && data.configured === false && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
            <p className="text-sm font-semibold text-amber-400 mb-2">🔑 API 키가 설정되지 않았습니다</p>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Bitget에서 <strong className="text-[var(--text)]">System-generated (HMAC)</strong> 키를{' '}
              <strong className="text-[var(--text)]">읽기 전용</strong>으로 발급한 뒤 환경변수에 등록하세요.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text)]">설정 방법</h2>
            <ol className="text-xs text-[var(--text-muted)] space-y-2 list-decimal list-inside">
              <li>Bitget → API 관리 → <strong className="text-[var(--text)]">System-generated</strong> 선택</li>
              <li>권한: <strong className="text-emerald-400">읽기 전용(Read-only)만</strong> · 거래·출금 ❌</li>
              <li>Passphrase 설정 (직접 입력, 기록 필수)</li>
              <li>발급된 3종 키를 <code className="text-sky-400">.env.local</code> / Vercel env에 추가:</li>
            </ol>
            <pre className="text-[11px] bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3 overflow-x-auto text-[var(--text-muted)]">
{`BITGET_API_KEY=발급된_API_Key
BITGET_API_SECRET=발급된_Secret_Key
BITGET_API_PASSPHRASE=직접_정한_Passphrase`}
            </pre>
            <p className="text-[11px] text-amber-400/80">⚠️ 출금 권한 절대 금지 · 키는 git 커밋 금지 (.env.local은 gitignore)</p>
          </div>
        </div>
      )}

      {/* 키 설정됨 + 에러 */}
      {data?.configured && data.error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm font-semibold text-red-400 mb-1">조회 실패</p>
          <p className="text-xs text-[var(--text-muted)] break-all">{data.error}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">키 권한·Passphrase·IP 화이트리스트를 확인하세요.</p>
        </div>
      )}

      {/* 잔고 표시 */}
      {data?.configured && !data.error && data.assets && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-sky-500/40 bg-sky-500/5 p-5">
            <p className="text-xs text-[var(--text-muted)] mb-1">총 평가금액 (USDT 환산)</p>
            <p className="text-3xl font-bold text-sky-400 tabular-nums">
              ${fmtUsd(data.totalUsdt ?? 0)}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{data.assets.length}개 자산 보유</p>
          </div>

          {data.assets.length === 0 ? (
            <p className="text-center text-sm text-[var(--text-muted)] py-8">보유 자산이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {data.assets.map((a) => {
                const pct = data.totalUsdt ? (a.usdtValue / data.totalUsdt) * 100 : 0;
                return (
                  <div key={a.coin} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text)]">{a.coin}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-[var(--text-muted)]">{pct.toFixed(1)}%</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-[var(--text)]">${fmtUsd(a.usdtValue)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span className="tabular-nums">{a.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} {a.coin}</span>
                      {a.price > 0 && <span className="tabular-nums">@ ${fmtUsd(a.price)}</span>}
                    </div>
                    {a.frozen > 0 && (
                      <p className="text-[10px] text-amber-400/70 mt-1">잠금 {a.frozen.toLocaleString('en-US', { maximumFractionDigits: 8 })}</p>
                    )}
                    <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-sky-500/60 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 최근 체결 (Fills) ── */}
          {act?.fills && act.fills.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-3">최근 체결 내역</h2>
              <div className="space-y-1.5">
                {act.fills.slice(0, 8).map((f) => {
                  const buy = f.side.toLowerCase() === 'buy';
                  return (
                    <div key={f.tradeId} className="flex items-center justify-between text-xs rounded-lg bg-white/3 px-3 py-2">
                      <div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1.5 ${buy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                          {buy ? '매수' : '매도'}
                        </span>
                        <span className="font-mono text-[var(--text)]">{f.symbol}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1.5">{fmtTs(f.ts)}</span>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="text-[var(--text)]">{fmtAmount(f.size)} @ ${fmtUsd(f.priceAvg)}</p>
                        {f.amount != null && <p className="text-[10px] text-[var(--text-muted)]">≈ ${fmtUsd(f.amount)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 입출금·이체 (Bills) ── */}
          {act?.bills && act.bills.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-3">입출금·이체 내역</h2>
              <div className="space-y-1.5">
                {act.bills.slice(0, 10).map((b) => {
                  const inflow = b.size > 0;
                  return (
                    <div key={b.billId} className="flex items-center justify-between text-xs rounded-lg bg-white/3 px-3 py-2">
                      <div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${inflow ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {bizLabel(b.businessType)}
                        </span>
                        <span className="font-mono text-[var(--text)]">{b.coin}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1.5">{fmtTs(b.ts)}</span>
                      </div>
                      <span className={`tabular-nums font-semibold ${inflow ? 'text-emerald-400' : 'text-red-400'}`}>
                        {inflow ? '+' : ''}{fmtAmount(b.size)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-center text-[11px] text-[var(--text-muted)] opacity-60">
            * Bitget 읽기 전용 API · 30초마다 갱신 · 시세는 Bitget 현물 기준
          </p>
        </div>
      )}
    </div>
  );
}
