'use client';

/**
 * 거래소 대조 패널 — "내 진짜 성적"을 손이 아니라 거래소가 채우게 한다.
 *
 * 정직성 설계:
 *  - 계획 없이 친 매매도 **그대로 기록에 남긴다**(숨기면 성적표가 예뻐질 뿐이다).
 *  - 계획 리스크를 모르는 건은 R 을 지어내지 않고 비워 둔다.
 *  - 선물 읽기 권한이 없으면 그 사실을 그대로 보여준다.
 */

import { useCallback, useState } from 'react';
import { reconcileClosedPositions, type ClosedPositionLike, type JournalLike } from '@/lib/bitgetJournal';
import type { JournalEntry } from '@/hooks/useCoinJournal';

const COIN_NAME: Record<string, string> = {
  BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나',
};

interface Props {
  entries: JournalEntry[];
  applyReconcile: (
    updates: { id: string; patch: Partial<JournalEntry> }[],
    additions: JournalEntry[],
  ) => void;
}

export default function ExchangeReconcile({ entries, applyReconcile }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const run = useCallback(async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch(`/api/bitget/history?days=${days}`);
      if (res.status === 401) { setErr('잠금 상태입니다 — /bitget 에서 접근 토큰을 1회 입력하세요.'); return; }
      const j = await res.json() as { configured?: boolean; error?: string; positions?: ClosedPositionLike[] };
      if (j.configured === false) { setErr('Bitget API 키가 서버에 설정되지 않았습니다.'); return; }
      if (j.error) { setErr(`거래소 조회 실패 — ${j.error.includes('40014') ? '키에 선물 읽기 권한이 없습니다(Bitget API 관리에서 Futures/Position Read 추가).' : j.error}`); return; }

      const closed = j.positions ?? [];
      if (!closed.length) { setMsg(`최근 ${days}일 청산된 선물 포지션이 없습니다.`); return; }

      const r = reconcileClosedPositions(closed, entries as unknown as JournalLike[], (s) => COIN_NAME[s] ?? s);
      applyReconcile(
        r.updates as unknown as { id: string; patch: Partial<JournalEntry> }[],
        r.additions as unknown as JournalEntry[],
      );

      const parts: string[] = [];
      if (r.updates.length) parts.push(`계획 기록 ${r.updates.length}건에 실제 손익 반영`);
      if (r.additions.length) parts.push(`계획 없이 친 매매 ${r.additions.length}건 새로 기록`);
      if (r.skipped) parts.push(`이미 반영됨 ${r.skipped}건`);
      setMsg(parts.length ? parts.join(' · ') : `청산 ${closed.length}건 모두 이미 반영돼 있습니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }, [days, entries, applyReconcile]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-sm font-bold text-[var(--text)]">
          거래소 대조 <span className="text-[10px] font-normal text-[var(--text-muted)]">Bitget 선물 청산 이력 → 매매일지 자동 채움</span>
        </h3>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} disabled={busy}
              className={`px-2 py-1 rounded-lg border text-[11px] transition-colors disabled:opacity-50 ${
                days === d ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'
              }`}>{d}일</button>
          ))}
          <button onClick={run} disabled={busy}
            className="px-3 py-1 rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-400 text-[11px] font-semibold disabled:opacity-50">
            {busy ? '대조 중…' : '⟳ 가져오기'}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
        손으로 적은 기록은 <strong className="text-[var(--text)]">이긴 매매만 남기 쉽습니다</strong>. 거래소가 아는 실현손익(수수료·펀딩 반영)을 그대로 가져와
        계획 기록을 닫고, <strong className="text-[var(--text)]">계획 없이 친 매매도 숨기지 않고 기록</strong>합니다. 읽기 전용 조회이며 주문은 하지 않습니다.
      </p>
      {msg && <p className="mt-2 text-[11px] text-emerald-400">✓ {msg}</p>}
      {err && <p className="mt-2 text-[11px] text-red-400">⚠ {err}</p>}
    </div>
  );
}
