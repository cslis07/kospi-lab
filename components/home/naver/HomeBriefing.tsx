'use client';

/**
 * 홈 AI 브리핑 — 헤드라인 + 불릿 3개(방향 추천 없음). /api/home/briefing(1시간 캐시).
 * ANTHROPIC 키/크레딧 문제로 실패하면 facts 기반 룰 요약으로 폴백(가짜 분석 대신 사실 나열).
 */
import useSWR from 'swr';

interface Facts { kospi: number; kospiRate: number; foreign: number; inst: number; indiv: number; up: number; down: number }
interface BriefResp { headline?: string; bullets?: string[]; facts?: Facts; asOf?: string; error?: string }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function ruleBullets(f?: Facts): { headline: string; bullets: string[] } {
  if (!f) return { headline: '시황 요약을 준비 중입니다.', bullets: [] };
  const eok = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')}억`;
  const lead = f.foreign > 0 && f.inst > 0 ? '외국인·기관 동반 순매수' : f.foreign < 0 && f.inst < 0 ? '외국인·기관 동반 순매도' : '수급 엇갈림';
  return {
    headline: `코스피 ${f.kospi ? f.kospi.toLocaleString() : '—'} (${f.kospiRate >= 0 ? '+' : ''}${f.kospiRate}%), ${lead}`,
    bullets: [
      `외국인 ${eok(f.foreign)} · 기관 ${eok(f.inst)} · 개인 ${eok(f.indiv)} 순매수`,
      `상승 ${f.up.toLocaleString()}종목 · 하락 ${f.down.toLocaleString()}종목`,
      'AI 요약 일시 중단 — 사실 데이터만 표시(방향 판단은 참고용).',
    ],
  };
}

export default function HomeBriefing() {
  const { data } = useSWR<BriefResp>('/api/home/briefing', fetcher, { revalidateOnFocus: false });
  const ai = data && !data.error && data.headline;
  const view = ai ? { headline: data!.headline!, bullets: data!.bullets ?? [] } : ruleBullets(data?.facts);
  const ts = data?.asOf ? new Date(data.asOf).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="fin-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="kicker" style={{ fontSize: 12 }}>AI 브리핑</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{view.headline || '—'}</span>
        {ts && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)', whiteSpace: 'nowrap' }}>{ts}</span>}
      </div>
      {view.bullets.length > 0 && (
        <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span><span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--faint)' }}>AI 요약 참고 자료이며, 기술적 오류로 실제 내용과 다를 수 있습니다. 매수·매도 신호가 아닙니다.</p>
    </div>
  );
}
