'use client';

/** 품목별 가격 — grocery_basket(품목별 현재가·YoY·월별 series) + fuel(휘발유). 품목 누르면 가격 추이 차트(바텀시트). */
import { useState } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import InflationChartLazy from '@/components/InflationChartLazy';
import BottomSheet from '@/components/ui/BottomSheet';
import { priceRows, pctFrac, type GroceryBasket, type GroceryItem } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');
const money = (v?: number) => (v == null ? '—' : v < 10 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`);

interface Fuel { locked?: boolean; current?: number; forward_2wk?: number; delta_cents?: number; driver_short?: string; source?: string; current_date?: string }

export default function PricesPage() {
  const { data: gb } = useSWR<GroceryBasket>('/api/nf/grocery_basket.json', fetcher, SWR_OPT);
  const { data: fuel } = useSWR<Fuel>('/api/nf/fuel.json', fetcher, SWR_OPT);
  const [sel, setSel] = useState<GroceryItem | null>(null);
  const items = gb?.items ?? [];

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">품목별 가격</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        장바구니 단골 품목의 <b className="text-[var(--text)]">현재 가격과 1년 전 대비 변화</b>입니다(미국 평균). 품목을 누르면 가격 추이가 열립니다.
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {gb?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!gb?.locked && items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {items.map((it) => (
            <button key={it.code} type="button" onClick={() => setSel(it)}
              className="text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 hover:border-[var(--accent)] transition-colors">
              <p className="text-[12px] font-semibold text-[var(--text)] truncate">{it.label}</p>
              <p className="text-[18px] font-extrabold tabular-nums text-[var(--text)] mt-0.5">{money(it.latest?.value)}</p>
              <p className={`text-[11px] font-bold tabular-nums ${sign(it.yoy)}`}>{it.yoy != null ? `${it.yoy >= 0 ? '+' : ''}${pctFrac(it.yoy, 1)} YoY` : '—'}</p>
              {it.stale && <p className="text-[9px] text-[var(--text-muted)] mt-0.5">업데이트 지연</p>}
            </button>
          ))}
        </div>
      )}

      {fuel && !fuel.locked && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-sky-400 mb-1.5">휘발유 (펌프가)</h2>
          <div className="text-[12px] tabular-nums space-y-1">
            <p><span className="text-[var(--text-muted)]">현재 </span><b className="text-[var(--text)] text-[16px]">${fuel.current?.toFixed(3)}</b><span className="text-[var(--text-muted)]">/gal{fuel.current_date ? ` · ${fuel.current_date}` : ''}</span></p>
            <p><span className="text-[var(--text-muted)]">2주 전망 </span><b className={sign(fuel.delta_cents)}>${fuel.forward_2wk?.toFixed(3)}</b> <span className={`text-[11px] ${sign(fuel.delta_cents)}`}>({(fuel.delta_cents ?? 0) >= 0 ? '+' : ''}{fuel.delta_cents?.toFixed(1)}¢)</span></p>
            {fuel.driver_short && <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">선행: {fuel.driver_short}. 출처 {fuel.source}.</p>}
          </div>
        </div>
      )}

      {!gb && !fuel && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <PriceSheet item={sel} open={!!sel} onClose={() => setSel(null)} />

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · BLS 평균 소매가·AAA. 장바구니 비용은 <a href="/inflation/cart" className="text-[var(--accent-ink)]">장바구니 담기</a>에서 계산할 수 있습니다.
      </p>
    </>
  );
}

function PriceSheet({ item, open, onClose }: { item: GroceryItem | null; open: boolean; onClose: () => void }) {
  const rows = priceRows(item?.series, 96);
  return (
    <BottomSheet open={open} onClose={onClose} title={item?.label ?? '품목'}>
      {item ? (
        <>
          <div className="flex items-baseline gap-3 mb-3 tabular-nums">
            <span className="text-[22px] font-extrabold text-[var(--text)]">{money(item.latest?.value)}</span>
            <span className={`text-[13px] font-bold ${sign(item.yoy)}`}>{item.yoy != null ? `${item.yoy >= 0 ? '+' : ''}${pctFrac(item.yoy, 1)} YoY` : ''}</span>
            {item.latest?.date && <span className="text-[11px] text-[var(--text-muted)] ml-auto">{item.latest.date}</span>}
          </div>
          {rows.length ? <InflationChartLazy kind="price" rows={rows} height={220} /> : <p className="text-[12px] text-[var(--text-muted)] py-4 text-center">가격 이력이 없습니다.</p>}
          <p className="text-[10px] text-[var(--text-muted)] mt-2 leading-relaxed">월별 미국 평균 소매가(최근 8년). 공식 발표 기반이며 매매 신호가 아닙니다.</p>
        </>
      ) : null}
    </BottomSheet>
  );
}
