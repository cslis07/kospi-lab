'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { BriefData, BriefMarket, MacroNum, BriefNews, NewsTag } from '@/lib/brief';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TABS: { key: BriefMarket; label: string; emoji: string }[] = [
  { key: 'coin', label: '코인', emoji: '🪙' },
  { key: 'kr', label: '국내증시', emoji: '🇰🇷' },
  { key: 'us', label: '해외증시', emoji: '🇺🇸' },
];

const SOURCES: Record<BriefMarket, string> = {
  coin: 'FRED(美 금리·WTI) · 네이버 금융(환율) · 뉴스(CoinDesk·Cointelegraph·Decrypt·The Block 등 해외 코인 매체 + 네이버)',
  kr: '네이버 금융(코스피·환율) · FRED(유가·美 금리) · 네이버 증권 뉴스',
  us: '네이버 금융(S&P·나스닥·다우) · FRED(美 금리·WTI) · 뉴스(CNBC·연준 등)',
};

const TAG_STYLE: Record<Exclude<NewsTag, null>, { label: string; cls: string }> = {
  war: { label: '지정학', cls: 'bg-[var(--warn-soft)] text-[var(--warn)]' },
  oil: { label: '유가', cls: 'bg-amber-500/15 text-amber-400' },
  rate: { label: '금리', cls: 'bg-[var(--accent-soft)] text-[var(--accent)]' },
};

/** 한국 관행: 상승=빨강(--warn), 하락=파랑(--accent) */
function changeColor(n: number | null): string {
  if (n == null || n === 0) return 'text-[var(--text-muted)]';
  return n > 0 ? 'text-[var(--warn)]' : 'text-[var(--accent)]';
}

function MacroGrid({ macro }: { macro: MacroNum[] }) {
  if (!macro.length) {
    return <p className="text-sm text-[var(--text-muted)] py-4">거시 수치를 불러오지 못했습니다 (잠시 후 다시 시도).</p>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {macro.map((m) => (
        <div key={m.key} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <div className="text-xs text-[var(--text-muted)] truncate">{m.label}</div>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-lg font-semibold text-[var(--text)] font-mono">{m.value}</span>
            <span className={`text-xs font-mono ${changeColor(m.change)}`}>{m.changeText}</span>
          </div>
          {m.hint && <div className="mt-1 text-[11px] leading-snug text-[var(--text-muted)] opacity-80">{m.hint}</div>}
          <div className="mt-1 text-[10px] text-[var(--text-muted)] opacity-50">{m.source}</div>
        </div>
      ))}
    </div>
  );
}

function NewsRow({ item }: { item: BriefNews }) {
  const tag = item.tag ? TAG_STYLE[item.tag] : null;
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors group"
    >
      {tag && <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.cls}`}>{tag.label}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] leading-snug group-hover:text-sky-400 transition-colors line-clamp-2">{item.title}</p>
        <span className="text-xs text-[var(--text-muted)] opacity-60">{item.source}</span>
      </div>
    </a>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-24 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />)}
      </div>
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />)}
    </div>
  );
}

function hhmm(iso: string): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function BriefPage() {
  const [market, setMarket] = useState<BriefMarket>('coin');
  const { data, isLoading, error } = useSWR<BriefData>(`/api/brief?market=${market}`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30 * 60 * 1000,
  });

  const ai = data?.ai;

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">모닝 브리핑</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          간밤 美 시장·금리·유가·지정학이 각 시장에 주는 <b className="text-[var(--text)]">맥락</b>. 매일 아침 자동 정리.
        </p>
      </div>

      {/* 시장 탭 */}
      <div className="flex gap-0 mb-4 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMarket(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              market === t.key ? 'border-sky-500 text-sky-400' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {error && !isLoading && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>브리핑을 불러오지 못했습니다</p>
          <p className="text-xs mt-1 opacity-60">잠시 후 다시 시도해 주세요</p>
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="space-y-5">
          {/* AI 요약 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">AI 요약</span>
              {ai?.model && <span className="text-[10px] text-[var(--text-muted)] opacity-50">{ai.model}</span>}
              {ai?.stale && <span className="text-[10px] text-amber-400 opacity-80">이전 요약</span>}
            </div>
            {ai?.headline ? (
              <>
                <p className="text-base font-semibold text-[var(--text)] leading-snug">{ai.headline}</p>
                <ul className="mt-2 space-y-1.5">
                  {ai.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-muted)] leading-snug">
                      <span className="text-sky-400 shrink-0">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                {ai?.notConfigured ? 'AI 요약 준비 중 (키 미설정)' : `AI 요약 생성 실패${ai?.error ? ` — ${ai.error}` : ''}. 아래 수치·뉴스는 정상입니다.`}
              </p>
            )}
          </div>

          {/* 거시 수치 */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">거시 지표</h3>
            <MacroGrid macro={data.macro} />
          </div>

          {/* 전쟁·지정학 */}
          {data.war.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)] mb-2">⚠️ 전쟁·지정학</h3>
              <div className="space-y-2">{data.war.map((n, i) => <NewsRow key={`w-${i}`} item={n} />)}</div>
            </div>
          )}

          {/* 관련 뉴스 */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">관련 뉴스</h3>
            {data.news.length > 0 ? (
              <div className="space-y-2">{data.news.map((n, i) => <NewsRow key={`n-${i}`} item={n} />)}</div>
            ) : (
              <p className="text-sm text-[var(--text-muted)] py-2">관련 뉴스를 찾지 못했습니다.</p>
            )}
          </div>

          {/* 오늘 일정 */}
          {data.events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)] mb-2">변동성 주의 일정</h3>
              <div className="space-y-1.5">
                {data.events.map((e, i) => (
                  <div key={`e-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">{e.date.slice(5)}</span>
                    <span className="text-sm text-[var(--text)] flex-1 min-w-0 truncate">{e.title}</span>
                    {e.importance === 'high' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--warn-soft)] text-[var(--warn)] shrink-0">중요</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 면책 */}
          <div className="text-[11px] text-[var(--text-muted)] opacity-70 leading-relaxed border-t border-[var(--border)] pt-3">
            <p>※ 맥락 참고용이며 <b>매매 신호가 아닙니다</b>. 수치의 방향 설명은 일반적 경향일 뿐 예측이 아닙니다.</p>
            <p className="mt-0.5">출처: {SOURCES[market]} · 기준 {hhmm(data.asOf)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
