'use client';

import { useState } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Disclosure {
  rcpNo: string;
  corpName: string;
  ticker: string;
  type: string;
  date: string;
  url: string;
}

function formatDate(d: string) {
  // YYYYMMDD → YYYY.MM.DD
  return d.length === 8 ? `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}` : d;
}

export default function DartPage() {
  const [ticker, setTicker] = useState('');
  const [days, setDays]     = useState(30);
  const [query, setQuery]   = useState<{ ticker: string; days: number } | null>(null);

  const apiUrl = query
    ? `/api/dart?days=${query.days}${query.ticker ? `&ticker=${query.ticker}` : ''}`
    : null;

  const { data, error, isLoading } = useSWR<Disclosure[] | { error: string }>(
    apiUrl, fetcher, { revalidateOnFocus: false }
  );

  const isApiKeyError = (data as { error?: string })?.error?.includes('DART_API_KEY');

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-[var(--text)]">DART 공시</h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">금융감독원 전자공시시스템 (DART) 공시 조회</p>
      </div>

      {/* 검색 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-6">
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="종목코드 (예: 005930) — 비워두면 전체"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.trim())}
            className="flex-1 min-w-[180px] bg-white/5 border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50"
          />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-white/5 border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-sky-500/50"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
          <button
            onClick={() => setQuery({ ticker, days })}
            className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-medium transition-colors"
          >
            조회
          </button>
        </div>
      </div>

      {/* API 키 안내 */}
      {isApiKeyError && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-6">
          <p className="text-amber-400 font-semibold text-sm mb-2">⚠️ DART API 키가 필요합니다</p>
          <ol className="text-xs text-[var(--text-muted)] space-y-1 list-decimal list-inside">
            <li>DART 홈페이지(<a href="https://dart.fss.or.kr" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">dart.fss.or.kr</a>)에서 무료 API 키 발급</li>
            <li>Vercel 프로젝트 환경변수에 <code className="bg-white/10 px-1 rounded">DART_API_KEY</code> 추가</li>
            <li>재배포 후 사용 가능</li>
          </ol>
        </div>
      )}

      {/* 결과 */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <p className="text-center text-red-400 text-sm py-8">공시 데이터를 불러올 수 없습니다</p>
      )}

      {Array.isArray(data) && (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">{data.length}건 조회됨</p>
          {data.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] text-sm py-12">해당 기간 공시가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {data.map((d) => (
                <a
                  key={d.rcpNo}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-[var(--text)]">{d.corpName}</span>
                      {d.ticker && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{d.ticker}</span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text)] truncate">{d.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-[var(--text-muted)]">{formatDate(d.date)}</p>
                    <p className="text-[10px] text-sky-400 group-hover:text-sky-300 mt-0.5">DART →</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
