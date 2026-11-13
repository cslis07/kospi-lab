'use client';

/**
 * 🧪 엔진 공통 환경(코인 홈) — 분석을 돌리지 않아도 보이는 공통 입력: 거래 보류·다음 발표, 유동성, 뉴스 충격 보드, 데이터 상태,
 * 그리고 이 기기에 남은 코인별 마지막 엔진 판단. 실전 신호 아님 · 알림·주문 없음.
 * 데이터: /api/intel/context(공개, CDN 5분 — 코인 분석 화면과 같은 주소라 캐시를 같이 쓴다).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import type { IntelContext } from '@/lib/intel/liquidity';
import { buildMarketBoard, lastBySymbol } from '@/lib/intel/marketBoard';
import { STATUS_LABEL, type EngineStatus } from '@/lib/intel/decisionEngine';
import { loadLog, LOG_EVENT } from '@/lib/intel/evidenceStore';
import type { EngineLogEntry } from '@/lib/intel/evidenceLog';
import { useRiskSettings } from '@/hooks/useRiskControl';
import NewsEventList, { shortWhen } from './NewsEventList';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const ST_CLS: Record<EngineStatus, string> = {
  BLOCKED: 'text-red-400', NO_SETUP: 'text-amber-400', WATCH: 'text-sky-400', READY: 'text-emerald-400',
};
const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

function Box({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.02] px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[11.5px] font-bold text-[var(--text)]">{title}</p>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

export default function EngineBoard() {
  const { data: ctx, error } = useSWR<IntelContext>('/api/intel/context', fetcher, { refreshInterval: 300_000, revalidateOnFocus: false, shouldRetryOnError: false });
  const { settings } = useRiskSettings();
  const [now, setNow] = useState(() => Date.now());
  const [log, setLog] = useState<EngineLogEntry[]>([]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const load = () => setLog(loadLog());
    load();
    window.addEventListener(LOG_EVENT, load);
    window.addEventListener('storage', load);
    return () => { clearInterval(id); window.removeEventListener(LOG_EVENT, load); window.removeEventListener('storage', load); };
  }, []);
  const board = useMemo(() => (ctx ? buildMarketBoard(ctx, now, settings.eventPreMin, settings.eventPostMin) : null), [ctx, now, settings.eventPreMin, settings.eventPostMin]);
  const last = useMemo(() => lastBySymbol(log), [log]);

  if (error && !ctx) return null; // 공통 입력을 못 받으면 카드를 숨긴다(다른 코인 화면에 영향 없음)
  return (
    <section className="rounded-2xl border border-violet-500/35 bg-violet-500/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-extrabold text-[var(--text)]">🧪 엔진 공통 환경</h2>
        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold">실험 · 연구용</span>
        {board && (
          <span className={`ml-auto text-[11px] font-extrabold px-2 py-0.5 rounded-lg border ${board.blocks.length ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
            {board.blocks.length ? '공통 거래 보류 중' : '공통 보류 없음'}
          </span>
        )}
      </div>
      <p className="text-[10.5px] text-[var(--text-muted)] mt-1">모든 코인에 같이 걸리는 입력만 모았습니다. 코인별 기술·파생 판단은 코인 분석을 실행해야 나옵니다. 매수·매도 신호가 아닙니다.</p>
      {!board && <p className="text-[11px] text-[var(--text-muted)] mt-2">불러오는 중…</p>}
      {board && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2.5">
          <Box title="거래 보류 · 다음 발표">
            {board.blocks.map((b) => (
              <p key={b.name} className="text-[11px] text-red-400 leading-snug">
                • {b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{b.reason}</a> : b.reason}
              </p>
            ))}
            {board.nextRelease ? (
              <p className="text-[11px] text-[var(--text)] leading-snug tabular-nums">
                {board.nextRelease.active ? '지금 보류 구간: ' : '다음: '}<b>{board.nextRelease.title}</b> {shortWhen(board.nextRelease.at)}
                <span className="text-[var(--text-muted)]"> · 보류 {hm(board.nextRelease.blockFrom)}~{hm(board.nextRelease.blockTo)}{board.nextRelease.hoursUntil > 0 ? ` · ${board.nextRelease.hoursUntil}시간 뒤` : ''}</span>
              </p>
            ) : <p className="text-[11px] text-[var(--text-muted)]">48시간 안 주요 미국 발표 없음</p>}
            <p className="text-[9.5px] text-[var(--text-muted)] mt-1">발표 전 {settings.eventPreMin}분·후 {settings.eventPostMin}분(위험관리 설정) · 위기 속보는 처음 보인 뒤 2시간 · FOMC 성명 공개 후 {settings.eventPostMin}분</p>
          </Box>

          <Box title="유동성">
            {board.liquidity.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">받지 못함</p>}
            {board.liquidity.map(({ obs, stale }) => (
              <p key={`${obs.id}-${obs.source}`} className={`text-[11px] leading-snug ${stale ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text)]'}`}>
                <span className={obs.direction > 0 ? 'text-emerald-400' : obs.direction < 0 ? 'text-red-400' : 'text-[var(--text-muted)]'}>{obs.direction > 0 ? '롱 쪽' : obs.direction < 0 ? '숏 쪽' : '중립'}</span>{' '}
                {obs.explanation}{stale && <span className="text-amber-400 no-underline"> (유효기간 지남)</span>}
              </p>
            ))}
            <p className="text-[9.5px] text-[var(--text-muted)] mt-1">스테이블코인 증가는 대기 자금이지 바로 매수가 아닙니다. SOL·XRP 는 현물 ETF 데이터가 없어 빼고 봅니다.</p>
          </Box>

          <Box title="뉴스 충격 보드(24시간)">
            <NewsEventList events={board.news} limit={5} />
            <p className="text-[9.5px] text-[var(--text-muted)] mt-1">같은 사건은 한 줄로 묶고 확인 수준을 붙입니다. 제목으로 호재·악재를 판단하지 않습니다. 코인별 뉴스는 코인 분석 때 함께 봅니다.</p>
          </Box>

          <Box title="데이터 상태">
            {board.providers.map((p) => (
              <p key={p.id} className="text-[11px] leading-snug">
                <span className={`mr-1.5 ${p.ok ? 'text-emerald-400' : 'text-red-400'}`}>{p.ok ? '●' : '○'}</span>
                <span className="text-[var(--text)]">{p.label}</span>
                <span className="text-[var(--text-muted)]"> · {p.delay}{p.note ? ` · ${p.note}` : ''}</span>
              </p>
            ))}
            <p className="text-[9.5px] text-[var(--text-muted)] mt-1">받은 시각 {shortWhen(new Date(ctx!.ingestedAt).toISOString())} · 5분마다 갱신</p>
          </Box>

          <div className="lg:col-span-2">
            <Box title="코인별 마지막 엔진 판단(이 기기 기록)">
              {last.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">아직 기록 없음 — 코인 분석을 실행하면 엔진 판단이 남습니다.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                {last.map((e) => (
                  <p key={e.symbol} className="text-[11px] leading-snug tabular-nums py-0.5">
                    <Link href={`/coin-analysis?symbol=${e.symbol}`} className="font-bold text-[var(--text)] hover:underline">{e.symbol.replace(/USDT$/, '')}</Link>{' '}
                    <b className={ST_CLS[e.status]}>{STATUS_LABEL[e.status]}</b>
                    {e.selected ? <span className="text-[var(--text-muted)]"> · {e.selected === 'long' ? '롱' : '숏'} 후보</span> : null}
                    <span className="text-[var(--text-muted)]"> · {ago(e.recordedAt, now)}</span>
                  </p>
                ))}
              </div>
              {last.length > 0 && <p className="text-[9.5px] text-[var(--text-muted)] mt-1">기록 당시 판단입니다 — 지금 상태는 코인 분석에서 다시 확인하세요. 성과 판정은 코인 분석 &gt; 진입 전 점검 &gt; 📒 사전 기록·사후 판정.</p>}
            </Box>
          </div>
        </div>
      )}
    </section>
  );
}
