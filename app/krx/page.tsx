'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/* ── 타입 ───────────────────────────────────────────────── */
interface RankItem {
  code: string; name: string; market: string;
  close: number; change: number; changeRate: number;
  volume: number; tradingValue: number; marketCap: number;
}
type RankKey = 'gainers' | 'losers' | 'value' | 'volume' | 'marketcap';
interface RankResp { configured: boolean; date?: string; count?: number; rankings?: Record<RankKey, RankItem[]>; error?: string }

interface KrxIndex { name: string; close: number; change: number; changeRate: number; tradingValue: number }
interface Commodity { name: string; price: number; changeRate: number }
interface MarketResp { configured: boolean; indices?: { list: KrxIndex[]; date: string }; commodities?: { gold: Commodity[]; oil: Commodity[]; date: string }; error?: string }

interface EtfItem { code: string; name: string; close: number; changeRate: number; nav: number; tradingValue: number; baseIndex: string }
type EtfKey = 'value' | 'gainers' | 'losers';
interface EtfResp { configured: boolean; count?: number; date?: string; value?: EtfItem[]; gainers?: EtfItem[]; losers?: EtfItem[]; error?: string }

/* ── 포맷 ───────────────────────────────────────────────── */
const fmtPrice = (n: number) => n.toLocaleString('ko-KR');
const fmtWon = (n: number) =>
  n >= 1e12 ? `${(n / 1e12).toFixed(1)}조` :
  n >= 1e8  ? `${Math.round(n / 1e8).toLocaleString()}억` :
  n >= 1e4  ? `${Math.round(n / 1e4).toLocaleString()}만` : `${n.toLocaleString()}`;
const fmtVol = (n: number) =>
  n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : n.toLocaleString();
const fmtDate = (d?: string) => (d && d.length === 8 ? `${d.slice(4, 6)}.${d.slice(6, 8)}` : '');
const upColor = (r: number) => (r >= 0 ? 'text-red-400' : 'text-blue-400');
const sign = (r: number) => `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`;

/* ── 전종목 랭킹 탭 ─────────────────────────────────────── */
const RANK_TABS: { key: RankKey; label: string; metric: (r: RankItem) => string; color?: (r: RankItem) => string }[] = [
  { key: 'value',     label: '거래대금', metric: (r) => `${fmtWon(r.tradingValue)}` },
  { key: 'volume',    label: '거래량',   metric: (r) => `${fmtVol(r.volume)}주` },
  { key: 'gainers',   label: '상승률',   metric: (r) => sign(r.changeRate), color: () => 'text-red-400' },
  { key: 'losers',    label: '하락률',   metric: (r) => sign(r.changeRate), color: () => 'text-blue-400' },
  { key: 'marketcap', label: '시가총액', metric: (r) => `${fmtWon(r.marketCap)}` },
];

export default function KrxPage() {
  const { data: rank, isLoading: rankLoading } = useSWR<RankResp>('/api/krx/ranking', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const { data: market } = useSWR<MarketResp>('/api/krx/market', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const { data: etf } = useSWR<EtfResp>('/api/krx/etf', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });

  const [rankTab, setRankTab] = useState<RankKey>('value');
  const [etfTab, setEtfTab] = useState<EtfKey>('value');

  const notConfigured = rank?.configured === false;
  const rankRows = rank?.rankings?.[rankTab] ?? [];
  const etfRows: EtfItem[] = etf?.[etfTab] ?? [];

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">KRX 시장 데이터</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        한국거래소(KRX) 공식 데이터 · 지수 · 전종목 랭킹 · ETF · 상품
        {rank?.date && ` · ${fmtDate(rank.date)} 기준`}
      </p>

      {/* 키 미설정 안내 */}
      {notConfigured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-sm font-semibold text-amber-400 mb-2">🔑 KRX API 키가 설정되지 않았습니다</p>
          <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
            <li><a href="http://data.krx.co.kr" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">data.krx.co.kr</a> → OpenAPI 인증키 발급 + API별 활용신청 승인</li>
            <li>Vercel 환경변수 <code className="text-sky-400">KRX_API_KEY</code> 등록 후 재배포</li>
          </ol>
        </div>
      )}

      {!notConfigured && (
        <div className="space-y-6">
          {/* ── 주요 지수 ── */}
          {market?.indices?.list && market.indices.list.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">주요 지수</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {market.indices.list.map((idx) => (
                  <div key={idx.name} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                    <p className="text-[11px] text-[var(--text-muted)] mb-0.5">{idx.name}</p>
                    <p className="text-base font-bold tabular-nums text-[var(--text)]">{idx.close.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className={`text-xs font-semibold tabular-nums ${upColor(idx.changeRate)}`}>
                      {idx.changeRate >= 0 ? '▲' : '▼'} {Math.abs(idx.change).toFixed(2)} ({sign(idx.changeRate)})
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 상품 (금·유가) ── */}
          {market?.commodities && (market.commodities.gold.length > 0 || market.commodities.oil.length > 0) && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">상품 시세 <span className="text-[var(--text-muted)] font-normal text-xs">(KRX 금·석유시장)</span></h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {market.commodities.gold.map((g) => (
                  <div key={g.name} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-[10px] text-[var(--text-muted)] truncate">🥇 {g.name}</p>
                    <p className="text-sm font-bold tabular-nums text-[var(--text)]">{fmtPrice(g.price)}원/g</p>
                    <p className={`text-[11px] font-semibold ${upColor(g.changeRate)}`}>{sign(g.changeRate)}</p>
                  </div>
                ))}
                {market.commodities.oil.map((o) => (
                  <div key={o.name} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                    <p className="text-[10px] text-[var(--text-muted)] truncate">🛢️ {o.name}</p>
                    <p className="text-sm font-bold tabular-nums text-[var(--text)]">{fmtPrice(o.price)}원/L</p>
                    <p className="text-[10px] text-[var(--text-muted)]">가중평균</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 전종목 랭킹 ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">전종목 랭킹</h2>
              {rank?.count ? <span className="text-[11px] text-[var(--text-muted)]">{rank.count.toLocaleString()}종목</span> : null}
            </div>
            <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
              {RANK_TABS.map((t) => (
                <button key={t.key} onClick={() => setRankTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${
                    rankTab === t.key ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}>{t.label}</button>
              ))}
            </div>
            {rankLoading ? (
              <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}</div>
            ) : rank?.error || (rank?.count ?? 0) === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">데이터를 불러올 수 없습니다 (KRX 키 확인)</p>
            ) : (
              <RankTable rows={rankRows} tab={rankTab} />
            )}
          </section>

          {/* ── ETF 랭킹 ── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">ETF 랭킹</h2>
              {etf?.count ? <span className="text-[11px] text-[var(--text-muted)]">{etf.count.toLocaleString()}종목</span> : null}
            </div>
            <div className="flex gap-1 mb-3">
              {([['value', '거래대금'], ['gainers', '상승률'], ['losers', '하락률']] as [EtfKey, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setEtfTab(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    etfTab === k ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}>{l}</button>
              ))}
            </div>
            {!etf ? (
              <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />)}</div>
            ) : (etf.count ?? 0) === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-6">ETF 데이터를 불러올 수 없습니다</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
                <table className="w-full text-xs">
                  <tbody>
                    {etfRows.map((r, i) => (
                      <tr key={r.code} className={`border-t border-[var(--border)] first:border-0 ${i % 2 ? 'bg-[var(--bg)]/20' : ''}`}>
                        <td className="px-3 py-2.5 text-[var(--text-muted)] w-6 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/stock/${r.code}`} className="hover:text-sky-400">
                            <span className="font-semibold text-[var(--text)]">{r.name}</span>
                          </Link>
                          {r.baseIndex && <span className="text-[10px] text-[var(--text-muted)] ml-1.5">{r.baseIndex}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">{fmtPrice(r.close)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${upColor(r.changeRate)}`}>{sign(r.changeRate)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{fmtWon(r.tradingValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-[var(--text-muted)] opacity-60">
            * 한국거래소(KRX) 공식 오픈API · 5분 캐시 · 상승/하락은 거래대금 1억원 이상 · 투자 참고용
          </p>
        </div>
      )}
    </div>
  );
}

/* ── 전종목 랭킹 테이블 ─────────────────────────────────── */
function RankTable({ rows, tab }: { rows: RankItem[]; tab: RankKey }) {
  const t = RANK_TABS.find((x) => x.key === tab)!;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
            <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium w-6">#</th>
            <th className="text-left px-3 py-2.5 text-[var(--text-muted)] font-medium">종목</th>
            <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">현재가</th>
            <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">등락률</th>
            <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">{t.label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code} className={`border-t border-[var(--border)] hover:bg-white/3 ${i % 2 ? 'bg-[var(--bg)]/20' : ''}`}>
              <td className="px-3 py-2.5 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
              <td className="px-3 py-2.5">
                <Link href={`/stock/${r.code}`} className="hover:text-sky-400 transition-colors">
                  <span className="font-semibold text-[var(--text)]">{r.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-1.5 font-mono">{r.code}</span>
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">{fmtPrice(r.close)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${upColor(r.changeRate)}`}>{sign(r.changeRate)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${t.color ? t.color(r) : 'text-[var(--text)]'}`}>{t.metric(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
