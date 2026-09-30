'use client';

/**
 * 홈 AI 브리핑 — 국내 / 해외 / 코인 탭 × Gemini · ChatGPT.
 * 데스크탑(≥1024)은 두 모델을 나란히 비교, 모바일은 모델 토글. /api/home/briefing?tab= (탭별 1시간 캐시).
 * 방향(매수·매도·전망) 추천 없음. 키 미설정 모델은 '연결 대기'로 정직하게 표시.
 */
import { useState } from 'react';
import useSWR from 'swr';
import { useMediaQuery } from './Fold';

type Tab = 'kr' | 'us' | 'coin';
interface Provider {
  id: 'gemini' | 'openai'; name: string; ok: boolean;
  brief?: { headline: string; bullets: string[] }; model?: string; error?: string; notConfigured?: boolean; stale?: boolean;
}
interface BriefResp { tab: Tab; providers: Provider[]; facts: string; asOf: string }

const TABS: [Tab, string][] = [['kr', '국내'], ['us', '해외'], ['coin', '코인']];
const fetcher = (u: string) => fetch(u).then((r) => r.json());

const DOT: Record<Provider['id'], string> = { gemini: '#4c8df6', openai: '#10a37f' };

function ProviderCard({ p, facts }: { p: Provider; facts: string }) {
  return (
    <div style={{ minWidth: 0, padding: 14, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[p.id] }} />
        <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{p.name}</b>
        {p.model && <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>{p.model}</span>}
      </div>
      {p.ok && p.brief ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 8, lineHeight: 1.4 }}>{p.brief.headline}</div>
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.brief.bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                <span style={{ color: DOT[p.id], flexShrink: 0 }}>•</span><span>{b}</span>
              </li>
            ))}
          </ul>
          {p.stale && p.error && <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>{p.error}</div>}
        </>
      ) : p.notConfigured ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
          연결 대기 — {p.id === 'openai'
            ? 'OpenAI API 키(OPENAI_API_KEY)를 등록하면 표시됩니다. OpenAI API 는 무료 한도가 없어 소액 과금됩니다.'
            : 'Gemini API 키(GEMINI_API_KEY, 무료)를 등록하면 표시됩니다.'}
          {facts && <div style={{ marginTop: 6, whiteSpace: 'pre-line', color: 'var(--faint)', fontSize: 11.5 }}>{facts}</div>}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.55 }}>
          지금은 요약을 만들지 못했습니다({p.error ?? '실패'}).
          {facts && <div style={{ marginTop: 6, whiteSpace: 'pre-line', color: 'var(--faint)', fontSize: 11.5 }}>{facts}</div>}
        </div>
      )}
    </div>
  );
}

export default function HomeBriefing() {
  const [tab, setTab] = useState<Tab>('kr');
  const [pick, setPick] = useState<Provider['id']>('gemini');
  const wide = useMediaQuery('(min-width: 1024px)');
  const { data, isLoading } = useSWR<BriefResp>(`/api/home/briefing?tab=${tab}`, fetcher, { revalidateOnFocus: false, keepPreviousData: true });

  const providers = data?.tab === tab ? data.providers : [];
  const shown = wide ? providers : providers.filter((p) => p.id === pick);
  const ts = data?.asOf ? new Date(data.asOf).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="fin-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="kicker" style={{ fontSize: 12 }}>AI 브리핑</span>
        <div className="seg">
          {TABS.map(([k, l]) => <button key={k} className={`seg-i ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {!wide && (
          <div className="seg">
            <button className={`seg-i ${pick === 'gemini' ? 'on' : ''}`} onClick={() => setPick('gemini')}>Gemini</button>
            <button className={`seg-i ${pick === 'openai' ? 'on' : ''}`} onClick={() => setPick('openai')}>ChatGPT</button>
          </div>
        )}
        {ts && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{ts} 생성 · 1시간 주기</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: wide ? '1fr 1fr' : '1fr', gap: 12, marginTop: 14 }}>
        {shown.length === 0
          ? Array.from({ length: wide ? 2 : 1 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 270, borderRadius: 'var(--r-sm)' }} />)
          : shown.map((p) => <ProviderCard key={p.id} p={p} facts={data?.facts ?? ''} />)}
      </div>
      {isLoading && shown.length === 0 && <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 6 }}>시세·뉴스를 모아 요약하는 중…</div>}

      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--faint)' }}>AI 요약 참고 자료이며, 기술적 오류로 실제 내용과 다를 수 있습니다. 매수·매도 신호가 아닙니다.</p>
    </div>
  );
}
