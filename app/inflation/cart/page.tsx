'use client';

/** 장바구니 담기 — grocery_basket 품목을 담아 월 비용 합계·1년 전 대비를 계산(이 기기 한정 저장). nowflation 'Build your cart'. */
import { useMemo } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { useSyncedList } from '@/hooks/useSyncedList';
import { cartTotals, type GroceryBasket } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const CART_KEY = 'kospi-lab-inflation-cart';
const money = (v?: number | null) => (v == null ? '—' : `$${v.toFixed(2)}`);
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

interface CartLine { code: string; qty: number }

export default function CartPage() {
  const { data: gb } = useSWR<GroceryBasket>('/api/nf/grocery_basket.json', fetcher, SWR_OPT);
  const { list: cart, mounted, save } = useSyncedList<CartLine>(CART_KEY, []);
  const items = gb?.items ?? [];

  const qty = useMemo(() => Object.fromEntries(cart.map((c) => [c.code, c.qty])), [cart]);
  const setQty = (code: string, q: number) => {
    const next = cart.filter((c) => c.code !== code);
    if (q > 0) next.push({ code, qty: q });
    save(next);
  };
  const totals = useMemo(() => cartTotals(items, qty), [items, qty]);
  const anyQty = cart.some((c) => c.qty > 0);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">장바구니 담기</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        자주 사는 품목을 담으면 <b className="text-[var(--text)]">월 비용 합계와 1년 전 대비 변화</b>를 계산합니다(미국 평균가 기준). 담은 내용은 <b className="text-[var(--text)]">이 기기에만</b> 저장됩니다.
      </p>

      {gb?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!gb?.locked && items.length > 0 && (
        <>
          {anyQty && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[10px] text-[var(--text-muted)]">월 비용</p><p className="text-xl font-extrabold tabular-nums text-[var(--text)]">{money(totals.now)}</p></div>
                <div><p className="text-[10px] text-[var(--text-muted)]">1년 전</p><p className="text-xl font-extrabold tabular-nums text-[var(--text-muted)]">{money(totals.yearAgo)}</p></div>
                <div><p className="text-[10px] text-[var(--text-muted)]">전년대비</p><p className={`text-xl font-extrabold tabular-nums ${sign(totals.yoyPct)}`}>{totals.yoyPct != null ? `${totals.yoyPct >= 0 ? '+' : ''}${totals.yoyPct.toFixed(1)}%` : '—'}</p></div>
              </div>
              <button type="button" onClick={() => save([])} className="mt-3 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">장바구니 비우기</button>
            </div>
          )}

          <ul className="space-y-2 mb-3">
            {items.map((it) => {
              const q = mounted ? (qty[it.code] ?? 0) : 0;
              return (
                <li key={it.code} className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text)] truncate">{it.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] tabular-nums">{it.latest?.value != null ? `$${it.latest.value.toFixed(it.latest.value < 10 ? 3 : 2)}` : '—'} / 단위</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => setQty(it.code, Math.max(0, q - 1))} disabled={q <= 0}
                      className="w-7 h-7 rounded-lg border border-[var(--border)] text-[var(--text)] text-[15px] font-bold disabled:opacity-30" aria-label={`${it.label} 빼기`}>−</button>
                    <span className="w-6 text-center text-[13px] font-bold tabular-nums text-[var(--text)]">{q}</span>
                    <button type="button" onClick={() => setQty(it.code, q + 1)}
                      className="w-7 h-7 rounded-lg border border-[var(--border)] text-[var(--text)] text-[15px] font-bold" aria-label={`${it.label} 담기`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!anyQty && <p className="text-[12px] text-[var(--text-muted)] text-center py-4">품목을 담으면 월 비용과 전년대비가 계산됩니다.</p>}
        </>
      )}

      {!gb && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · BLS 평균 소매가. 품목별 추이는 <a href="/inflation/prices" className="text-[var(--accent-ink)]">품목별 가격</a>을 참고하세요. 수량·단위는 참고용 추정입니다.
      </p>
    </>
  );
}
