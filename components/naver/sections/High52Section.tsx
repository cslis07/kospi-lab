'use client';

/**
 * 52주 신고가 · 신저가 — 코스피/코스닥에서 오늘 52주 최고(최저)가를 새로 쓴 일반 주식(최대 30개 표시, 개수는 전체).
 * 참고: 알파스퀘어 특징종목 · 증권플러스 신고가 알림. 신고가 종목 수가 많을수록 시장이 강하다는 시장 폭 지표로도 쓴다.
 * 데이터 /api/naver/high52. 매수·매도 신호 아님.
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, Seg, SectionTitle, SourceNote, Empty } from '@/components/naver/ui';

interface Row { code: string; name: string; price: number; changeRate: number; tradingValueEok: number; marketCapEok: number }
interface Resp { total: number; stocks: Row[]; asOf: string }
type Kind = 'high' | 'low';
type Mkt = 'KOSPI' | 'KOSDAQ';
const eok = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}조` : `${n.toLocaleString('ko-KR')}억`);

export default function High52Section() {
  const [kind, setKind] = useState<Kind>('high');
  const [mkt, setMkt] = useState<Mkt>('KOSPI');
  const { data, error } = useSWR<Resp>(`/api/naver/high52?kind=${kind}&market=${mkt}`, fetcher, { refreshInterval: 60000, keepPreviousData: true });
  // 시장 폭: 같은 시장 신고가 vs 신저가 개수(다른 쪽 목록 수를 가볍게 같이 받는다)
  const { data: other } = useSWR<Resp>(`/api/naver/high52?kind=${kind === 'high' ? 'low' : 'high'}&market=${mkt}`, fetcher, { refreshInterval: 60000 });
  const hi = kind === 'high' ? data?.total : other?.total;
  const lo = kind === 'low' ? data?.total : other?.total;
  return (
    <div style={{ marginTop: 28 }}>
      <SectionTitle title="52주 신고가 · 신저가" sub="오늘 52주 최고·최저가를 새로 쓴 종목" />
      <div className="nv-chips" style={{ marginBottom: 12 }}>
        <Seg<Kind> value={kind} onChange={setKind} options={[['high', '신고가'], ['low', '신저가']]} />
        <Seg<Mkt> value={mkt} onChange={setMkt} options={[['KOSPI', '코스피'], ['KOSDAQ', '코스닥']]} />
      </div>
      {hi != null && lo != null && (
        <p className="text-[12.5px] text-[var(--text-muted)] mb-2 tabular-nums">
          {mkt === 'KOSPI' ? '코스피' : '코스닥'} 오늘 신고가 <b style={{ color: 'var(--up)' }}>{hi}</b> · 신저가 <b style={{ color: 'var(--down)' }}>{lo}</b>
          <span className="text-[var(--faint)]"> — 신고가가 많을수록 오르는 종목이 넓게 퍼진 장</span>
        </p>
      )}
      <div className="fin-card" style={{ padding: '6px 14px' }}>
        {error ? <Empty /> : !data ? <div className="skeleton" style={{ height: 240, margin: '8px 0' }} /> : !data.stocks.length ? <Empty text="해당 종목이 없습니다." /> : (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 pt-2 pb-1.5 text-[11px] text-[var(--text-muted)] border-b border-[var(--line-2)]">
              <span>종목</span><span className="text-right">현재가</span><span className="text-right w-[60px]">거래대금</span>
            </div>
            {data.stocks.map((s) => (
              <Link key={s.code} href={`/stock/${s.code}`} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center py-2 border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--bg-card-hover)]">
                <span className="min-w-0"><span className="block text-[13.5px] text-[var(--ink)] truncate">{s.name}</span><span className="block text-[10.5px] text-[var(--faint)]">{s.code} · 시총 {eok(s.marketCapEok)}</span></span>
                <span className="text-right tabular-nums"><span className="block text-[13px] text-[var(--ink)]">{s.price.toLocaleString('ko-KR')}</span>
                  <span className="block text-[11px] font-semibold" style={{ color: s.changeRate > 0 ? 'var(--up)' : s.changeRate < 0 ? 'var(--down)' : 'var(--text-muted)' }}>{s.changeRate > 0 ? '+' : ''}{s.changeRate.toFixed(2)}%</span></span>
                <span className="text-right text-[12px] tabular-nums text-[var(--text)] w-[60px]">{eok(s.tradingValueEok)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <SourceNote>출처: 네이버페이 증권. 52주 신고가·신저가는 가격 기록일 뿐 매수·매도 신호가 아닙니다. ETF·ETN은 빼고 일반 주식만(우선주·스팩 포함) 셉니다.</SourceNote>
    </div>
  );
}
