/** 뉴스 사건 목록(같은 사건 묶음·확인 수준·주제) — 엔진 패널과 코인 홈 엔진 보드가 같이 쓴다. 방향 점수 없음 */
import { TOPIC_LABEL, VERIFICATION_LABEL, type NewsEvent, type Verification } from '@/lib/intel/newsEvents';

const VER_CLS: Record<Verification, string> = {
  official: 'bg-emerald-500/15 text-emerald-400', multi_source: 'bg-sky-500/15 text-sky-400', single_source: 'bg-white/[0.06] text-[var(--text-muted)]',
};
export const shortWhen = (iso: string) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function NewsEventList({ events, limit = 6 }: { events: NewsEvent[]; limit?: number }) {
  if (!events.length) return <p className="text-[10.5px] text-[var(--text-muted)]">시각이 확인된 기사 없음</p>;
  return (
    <>
      {events.slice(0, limit).map((e) => (
        <p key={e.eventId} className="text-[10.5px] text-[var(--text)] leading-snug mb-0.5">
          {e.crisis && <span className="text-red-400 font-bold">⚠ </span>}
          <span className={`text-[9.5px] px-1 py-px rounded mr-1 ${VER_CLS[e.verification]}`}>{VERIFICATION_LABEL[e.verification]}{e.sources.length > 1 ? ` ${e.sources.length}곳` : ''}</span>
          {e.topic && <span className="text-[9.5px] text-[var(--text-muted)] mr-1">[{TOPIC_LABEL[e.topic]}]</span>}
          <a href={e.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{e.title}</a>
          <span className="text-[var(--text-muted)]"> · {e.sources.slice(0, 2).join('·')} · {shortWhen(e.firstSeenAt)}{e.articleCount > 1 ? ` · 기사 ${e.articleCount}건` : ''}</span>
        </p>
      ))}
    </>
  );
}
