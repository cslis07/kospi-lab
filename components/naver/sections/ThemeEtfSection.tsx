'use client';

/**
 * 주목할 만한 테마 ETF 섹션 — /theme-etf 페이지와 홈(PC) 공용.
 * 네이버 ETF 테마 분류(대분류 > 중분류)에서 테마를 고르면 상위 ETF. 국내 = 1주 수익률 순, 미국 = 거래대금 순(표기).
 * home=true: ETF 4개(1~4위)만, '전체보기 →'. 과거 수익률은 미래 수익을 보장하지 않는다 — 추천이 아닌 현황판.
 */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, colorOf, signPct, Seg, SectionTitle, SourceNote, Empty, fmtUsd, MoreLink } from '@/components/naver/ui';

interface Theme { code: string; name: string; large: string; count: number; return1d?: number; return3m?: number }
interface Etf { code: string; name: string; price: number; change: number; changeRate: number; return1w?: number; return1m?: number; type: string; currency: 'KRW' | 'USD' }
interface Resp { region: 'kr' | 'us'; theme: string; themes: Theme[]; etfs: Etf[]; sortedBy: string }

function EtfCard({ e, rank }: { e: Etf; rank: number }) {
  const usd = e.currency === 'USD';
  return (
    <Link href={usd ? `/overseas/${encodeURIComponent(e.code)}` : `/stock/${e.code}`} className="fin-card"
      style={{ padding: 16, minWidth: 0, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: rank === 1 ? 'var(--ok)' : 'var(--faint)' }}>{rank}위</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 40 }}>{e.name}</span>
      {e.type && <span style={{ fontSize: 11, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.type}</span>}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>현재가</div>
        <div className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
          {usd ? fmtUsd(e.price) : `${e.price.toLocaleString()}원`}{' '}
          <span style={{ fontSize: 12.5, color: colorOf(e.changeRate) }}>({signPct(e.changeRate)})</span>
        </div>
      </div>
      {e.return1w != null && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--faint)' }}>1주일 수익률</div>
          <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 800, color: colorOf(e.return1w) }}>{signPct(e.return1w)}</div>
        </div>
      )}
    </Link>
  );
}

export default function ThemeEtfSection({ home = false }: { home?: boolean }) {
  const [region, setRegion] = useState<'kr' | 'us'>('kr');
  const [theme, setTheme] = useState('');
  const [large, setLarge] = useState('');
  const { data, error, isLoading } = useSWR<Resp>(`/api/naver/theme-etf?region=${region}${theme ? `&theme=${theme}` : ''}`, fetcher, { keepPreviousData: true });

  const larges = useMemo(() => [...new Set((data?.themes ?? []).map((t) => t.large))], [data?.themes]);
  const curLarge = large || data?.themes.find((t) => t.code === data.theme)?.large || larges[0] || '';
  const list = (data?.themes ?? []).filter((t) => t.large === curLarge && t.count > 0);
  const sel = data?.theme ?? '';
  const etfs = (data?.etfs ?? []).slice(0, home ? 4 : 8);

  return (
    <div>
      <SectionTitle big={home} title="주목할 만한 테마 ETF" sub={data ? `${data.sortedBy} 순` : undefined}
        right={<>
          <Seg<'kr' | 'us'> value={region} onChange={(v) => { setRegion(v); setTheme(''); setLarge(''); }} options={[['kr', '국내'], ['us', '미국']]} />
          {home && <MoreLink href="/theme-etf" />}
        </>} />

      {/* 대분류 */}
      <div className="chip-scroll in-card" style={{ marginBottom: 10 }}>
        {larges.map((l) => (
          <button key={l} type="button" className={`chip ${curLarge === l ? 'active' : ''}`} onClick={() => setLarge(l)}>{l}</button>
        ))}
      </div>

      <div className="te-wrap">
        {/* 중분류(테마) 목록 */}
        <div className="fin-card te-list" style={{ padding: 8, maxHeight: home ? 380 : undefined, overflowY: home ? 'auto' : undefined }}>
          {list.length === 0 ? <div className="skeleton" style={{ height: 200 }} /> : list.map((t) => (
            <button key={t.code} type="button" onClick={() => { setTheme(t.code); setLarge(t.large); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                background: sel === t.code ? 'var(--surface-2)' : 'transparent', color: sel === t.code ? 'var(--ink)' : 'var(--ink-2)', fontWeight: sel === t.code ? 800 : 500, fontSize: 14 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              {t.return1d != null
                ? <span className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(t.return1d) }}>{signPct(t.return1d)}</span>
                : <span style={{ fontSize: 11, color: 'var(--faint)' }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* 선택 테마 ETF */}
        <div style={{ minWidth: 0 }}>
          {error ? <div className="fin-card"><Empty /></div> : (
            <div className="te-grid">
              {(isLoading && !data ? Array.from({ length: 4 }) : etfs).map((e, i) =>
                e ? <EtfCard key={(e as Etf).code} e={e as Etf} rank={i + 1} /> : <div key={i} className="skeleton" style={{ height: 210, borderRadius: 'var(--r)' }} />)}
            </div>
          )}
          {data && data.etfs.length === 0 && <div className="fin-card"><Empty text="이 테마의 ETF 정보가 없습니다." /></div>}
        </div>
      </div>

      <SourceNote>출처: 네이버페이 증권 ETF 테마 분류. 국내는 1주일 수익률, 미국은 거래대금 순위입니다. 과거 수익률은 미래 수익을 보장하지 않으며 추천이 아닙니다.</SourceNote>
      <style jsx>{`
        .te-wrap { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 14px; align-items: start; }
        .te-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 1100px) { .te-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 760px) {
          .te-wrap { grid-template-columns: 1fr; }
          .te-wrap :global(.te-list) { display: flex; overflow-x: auto; gap: 4px; }
          .te-wrap :global(.te-list) > :global(button) { width: auto !important; flex: 0 0 auto; }
        }
      `}</style>
    </div>
  );
}
