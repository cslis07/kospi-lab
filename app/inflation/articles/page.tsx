'use client';

/** 경제 기사 — articles_index.json. Nowflation 경제 기사 목록(영문·외부 링크). 요약은 수치 맥락용, 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { nfLink, type ArticlesIndex } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const dShort = (d?: string) => (d ? d.slice(0, 10).replace(/-/g, '.').slice(2) : '');

export default function ArticlesPage() {
  const { data: ai } = useSWR<ArticlesIndex>('/api/nf/articles_index.json', fetcher, SWR_OPT);
  const articles = ai?.articles ?? [];
  const author = ai?.author;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">경제 기사</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        Nowflation이 쓰는 <b className="text-[var(--text)]">경제·물가 해설 기사</b> 목록입니다(영문, 원문은 nowflation.com). 발표·지표를 맥락으로 읽는 참고용이며,
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {ai?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!ai?.locked && author?.name && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3 mb-3">
          <p className="text-[12px] font-semibold text-[var(--text)]">{author.name}</p>
          {author.credentials && <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{author.credentials}</p>}
          {author.role && <p className="text-[11px] text-[var(--text-muted)]">{author.role}</p>}
        </div>
      )}

      {!ai?.locked && articles.length > 0 && (
        <ul className="space-y-2.5 mb-3">
          {articles.map((a) => (
            <li key={a.slug} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <a href={nfLink(a.url)} target="_blank" rel="noopener noreferrer" className="block">
                <div className="flex items-center gap-2 mb-1 text-[10px] text-[var(--text-muted)] tabular-nums">
                  <span>{dShort(a.date)}</span>
                  {a.reading_min != null && <span>· {a.reading_min}분</span>}
                  {a.has_video && <span className="px-1 py-0.5 rounded bg-[var(--surface-2)]">영상</span>}
                </div>
                <p className="text-[13px] font-bold text-[var(--text)] leading-snug hover:underline">{a.title}</p>
                {a.summary && <p className="text-[11px] text-[var(--text-muted)] leading-relaxed mt-1 line-clamp-3">{a.summary}</p>}
                {a.tags && a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {a.tags.slice(0, 4).map((tg) => <span key={tg} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">{tg}</span>)}
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}

      {!ai && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 기사 원문·저작권은 작성자/Nowflation에 있으며, 링크는 원문으로 연결됩니다.
      </p>
    </>
  );
}
