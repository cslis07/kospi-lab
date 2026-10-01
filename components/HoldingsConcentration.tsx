'use client';

/**
 * 보유 종목 비중 도넛 + 쏠림 경고선(참고: 토스증권 '자산 비중', Copilot Money 배분 도넛).
 * 데이터: 종목 상세 › 보유(usePortfolio, 국내주식) × 현재가(/api/stock/batch) · 업종(/api/stock/sectors).
 * 판정: lib/concentration(테스트 고정) — 한 종목 25%·한 업종 40% 넘으면 경고. 이 앱의 리스크 기준선이지 추천이 아니다.
 * 도넛은 SVG 직접(차트 라이브러리 없이 — 자산 화면 번들을 늘리지 않게).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { usePortfolio } from '@/hooks/usePortfolio';
import { concentration, STOCK_LIMIT, SECTOR_LIMIT, type Slice } from '@/lib/concentration';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
// 슬라이스 색 — 테마 토큰(빨강은 경고 전용으로 비워 둔다), 7번째부터는 '기타'로 묶음
const PALETTE = ['var(--accent)', 'var(--ok)', 'var(--amber)', 'var(--violet)', 'var(--rose)', 'var(--accent-ink)'];
const OTHER = 'var(--faint)';
const MAX_SLICES = 6;
const krw = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(2)}억원` : `${Math.round(n).toLocaleString()}원`);

function group(slices: Slice[]): (Slice & { color: string })[] {
  const head = slices.slice(0, MAX_SLICES).map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  const rest = slices.slice(MAX_SLICES);
  if (rest.length) head.push({ key: '__etc', label: `기타 ${rest.length}개`, value: rest.reduce((a, s) => a + s.value, 0), pct: rest.reduce((a, s) => a + s.pct, 0), color: OTHER });
  return head;
}

function Donut({ parts, center, sub }: { parts: { pct: number; color: string; label: string }[]; center: string; sub: string }) {
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" width="100%" style={{ maxWidth: 190, display: 'block' }} role="img"
      aria-label={`비중: ${parts.map((p) => `${p.label} ${p.pct.toFixed(0)}%`).join(', ')}`}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="18" />
      {parts.map((p, i) => {
        const len = (p.pct / 100) * C;
        const el = (
          <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={p.color} strokeWidth="18"
            strokeDasharray={`${Math.max(0, len - (parts.length > 1 ? 1.5 : 0))} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
        );
        acc += len;
        return el;
      })}
      <text x="70" y="66" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--ink)">{center}</text>
      <text x="70" y="84" textAnchor="middle" fontSize="9.5" fill="var(--faint)">{sub}</text>
    </svg>
  );
}

/** 비중 막대 + 경고선(세로 점선) */
function BarRow({ s, color, limit }: { s: Slice; color: string; limit: number }) {
  const over = s.key !== '__etc' && s.pct > limit;
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span aria-hidden className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
        <span className="font-semibold text-[var(--text)] truncate min-w-0 flex-1">{s.label}{s.estimated ? <span className="text-[10px] font-normal text-[var(--faint)] ml-1">(평단 추정)</span> : null}</span>
        <span className="tabular-nums font-bold shrink-0" style={{ color: over ? 'var(--warn)' : 'var(--ink-2)' }}>{s.pct.toFixed(1)}%</span>
      </div>
      <div className="relative h-1.5 rounded-full mt-1" style={{ background: 'var(--surface-2)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, s.pct)}%`, background: over ? 'var(--warn)' : color }} />
        <div aria-hidden className="absolute -top-1 -bottom-1" style={{ left: `${limit}%`, borderLeft: '1.5px dashed var(--warn)', opacity: 0.8 }} />
      </div>
    </div>
  );
}

export default function HoldingsConcentration() {
  const { portfolio } = usePortfolio();
  const [view, setView] = useState<'stock' | 'sector'>('stock');
  const codes = useMemo(() => Object.keys(portfolio).filter((t) => portfolio[t]?.quantity > 0).sort(), [portfolio]);
  const q = codes.slice(0, 20).join(',');
  const { data: px } = useSWR<Record<string, { price?: number; name?: string }>>(codes.length ? `/api/stock/batch?tickers=${q}` : null, fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const { data: sec } = useSWR<Record<string, string>>(codes.length ? `/api/stock/sectors?codes=${q}` : null, fetcher, { revalidateOnFocus: false });

  const c = useMemo(() => concentration(codes.map((t) => ({
    ticker: t, name: px?.[t]?.name ?? t, quantity: portfolio[t].quantity, price: px?.[t]?.price ?? null,
    avgPrice: portfolio[t].avgPrice, sector: sec?.[t],
  }))), [codes, portfolio, px, sec]);

  if (!codes.length) {
    return (
      <div className="fin-card px-4 py-5 text-[13px] text-[var(--text-muted)] leading-relaxed">
        등록한 보유 종목이 없습니다. 종목 상세 › <b className="text-[var(--text)]">보유 · 가격 알림</b>에서 수량·평단을 넣으면 비중과 쏠림 경고가 여기에 나옵니다.
      </div>
    );
  }

  const list = view === 'stock' ? c.stocks : c.sectors;
  const parts = group(list);
  const limit = view === 'stock' ? STOCK_LIMIT : SECTOR_LIMIT;

  return (
    <div className="fin-card p-4 sm:p-5">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="seg" role="tablist" aria-label="비중 기준">
          <button type="button" role="tab" aria-selected={view === 'stock'} className={`seg-i ${view === 'stock' ? 'on' : ''}`} onClick={() => setView('stock')}>종목</button>
          <button type="button" role="tab" aria-selected={view === 'sector'} className={`seg-i ${view === 'sector' ? 'on' : ''}`} onClick={() => setView('sector')}>업종</button>
        </div>
        <span className="text-[11px] text-[var(--faint)] ml-auto">경고선 — 한 종목 {STOCK_LIMIT}% · 한 업종 {SECTOR_LIMIT}%</span>
      </div>

      {c.warnings.length > 0 && (
        <div className="mb-3 rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed" style={{ background: 'var(--warn-soft)', color: 'var(--ink)' }}>
          <b style={{ color: 'var(--warn)' }}>쏠림 경고</b> ·{' '}
          {c.warnings.map((w, i) => (
            <span key={i}>{i ? ' · ' : ''}{w.kind === 'stock' ? '종목' : '업종'} <b>{w.label}</b> {w.pct.toFixed(0)}%(기준 {w.limit}%)</span>
          ))}
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">한 종목이 반토막 나면 계좌가 그 비중의 절반만큼 깎입니다. 매도 권유가 아니라 위험 크기 안내입니다.</div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[190px_minmax(0,1fr)] gap-4 items-center">
        <div className="mx-auto w-full" style={{ maxWidth: 190 }}>
          <Donut parts={parts} center={krw(c.total)} sub={`${view === 'stock' ? `${c.stocks.length}종목` : `${c.sectors.length}개 업종`} 평가금액`} />
        </div>
        <div className="min-w-0">
          {parts.map((s) => <BarRow key={s.key} s={s} color={s.color} limit={limit} />)}
        </div>
      </div>
      <p className="text-[11px] text-[var(--faint)] mt-3 leading-relaxed">
        국내주식 보유분(수량 × 현재가) 기준{c.estimated ? ' · 현재가를 못 받은 종목은 평단으로 추정' : ''}. 업종은 네이버 업종 분류.
        보유 수정은 <Link href="/my-stocks" className="underline">관심종목</Link> › 종목 상세에서.
      </p>
    </div>
  );
}
