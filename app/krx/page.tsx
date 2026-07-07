'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';

interface RankItem {
  code: string; name: string; market: string;
  close: number; change: number; changeRate: number;
  volume: number; tradingValue: number; marketCap: number;
}
type RankKey = 'gainers' | 'losers' | 'value' | 'volume' | 'marketcap';
interface RankResp {
  configured: boolean;
  date?: string;
  count?: number;
  rankings?: Record<RankKey, RankItem[]>;
  error?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const fmtPrice = (n: number) => n.toLocaleString('ko-KR');
const fmtWon = (n: number) => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조`;
  if (n >= 1e8)  return `${Math.round(n / 1e8).toLocaleString()}억`;
  if (n >= 1e4)  return `${Math.round(n / 1e4).toLocaleString()}만`;
  return `${n.toLocaleString()}`;
};
const fmtVol = (n: number) => {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return n.toLocaleString();
};

const TABS: { key: RankKey; label: string; metric: (r: RankItem) => string }[] = [
  { key: 'gainers',   label: '상승률',   metric: (r) => `${r.changeRate >= 0 ? '+' : ''}${r.changeRate.toFixed(2)}%` },
  { key: 'losers',    label: '하락률',   metric: (r) => `${r.changeRate.toFixed(2)}%` },
  { key: 'value',     label: '거래대금', metric: (r) => `${fmtWon(r.tradingValue)}원` },
  { key: 'volume',    label: '거래량',   metric: (r) => `${fmtVol(r.volume)}주` },
  { key: 'marketcap', label: '시가총액', metric: (r) => `${fmtWon(r.marketCap)}원` },
];

export default function KrxPage() {
  const { data, isLoading } = useSWR<RankResp>('/api/krx/ranking', fetcher, {
    refreshInterval: 300000, revalidateOnFocus: false,
  });
  const [tab, setTab] = useState<RankKey>('value');

  const rows = data?.rankings?.[tab] ?? [];
  const fmtDate = (d?: string) =>
    d && d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : '';

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">KRX 전종목 랭킹</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        한국거래소 공식 데이터 · KOSPI+KOSDAQ 전종목
        {data?.date && ` · ${fmtDate(data.date)} 기준`}
        {data?.count ? ` · ${data.count.toLocaleString()}종목` : ''}
      </p>

      {/* 키 미설정 안내 */}
      {data && data.configured === false && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-sm font-semibold text-amber-400 mb-2">🔑 KRX API 키가 설정되지 않았습니다</p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
            KRX 전종목 랭킹은 한국거래소 공식 오픈API 키가 필요합니다.
          </p>
          <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
            <li><a href="http://data.krx.co.kr" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">data.krx.co.kr</a> → OpenAPI 신청 → 인증키 발급</li>
            <li>Vercel 환경변수에 <code className="text-sky-400">KRX_API_KEY</code> 추가 후 재배포</li>
          </ol>
        </div>
      )}

      {/* 에러 / 데이터 없음 */}
      {data?.configured && (data.error || data.count === 0) && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-sm font-semibold text-red-400 mb-1">데이터를 불러올 수 없습니다</p>
          <p className="text-xs text-[var(--text-muted)]">
            {data.error ? '조회 실패 — KRX 키가 유효한지 확인하세요.' : '최근 영업일 데이터가 아직 없습니다.'}
          </p>
        </div>
      )}

      {/* 랭킹 */}
      {(isLoading || (data?.configured && !data.error && (data.count ?? 0) > 0)) && (
        <>
          <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${
                  tab === t.key ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-[var(--border)] text-[var(--text-muted)]'
                }`}>{t.label}</button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                    <th className="text-left  px-3 py-2.5 text-[var(--text-muted)] font-medium w-8">#</th>
                    <th className="text-left  px-3 py-2.5 text-[var(--text-muted)] font-medium">종목</th>
                    <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">현재가</th>
                    <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">등락률</th>
                    <th className="text-right px-3 py-2.5 text-[var(--text-muted)] font-medium">{TABS.find((t) => t.key === tab)!.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const up = r.changeRate >= 0;
                    const metric = TABS.find((t) => t.key === tab)!.metric(r);
                    return (
                      <tr key={r.code} className={`border-t border-[var(--border)] hover:bg-white/3 ${i % 2 ? 'bg-[var(--bg)]/20' : ''}`}>
                        <td className="px-3 py-2.5 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <Link href={`/stock/${r.code}`} className="hover:text-sky-400 transition-colors">
                            <span className="font-semibold text-[var(--text)]">{r.name}</span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-1.5 font-mono">{r.code}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text)]">{fmtPrice(r.close)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${up ? 'text-red-400' : 'text-blue-400'}`}>
                          {up ? '+' : ''}{r.changeRate.toFixed(2)}%
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                          tab === 'gainers' ? 'text-red-400' : tab === 'losers' ? 'text-blue-400' : 'text-[var(--text)]'
                        }`}>{metric}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-center text-[11px] text-[var(--text-muted)] mt-4 opacity-60">
            * 한국거래소(KRX) 공식 일별매매정보 · 5분 캐시 · 상승/하락은 거래대금 1억원 이상
          </p>
        </>
      )}
    </div>
  );
}
