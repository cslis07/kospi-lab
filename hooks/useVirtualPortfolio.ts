'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  VirtualState, VirtualHolding, VirtualTrade,
  AssetType, TradeSide, TradeCurrency,
} from '@/lib/types';

const KEY = 'kospi-lab-virtual';

const INITIAL: VirtualState = {
  krw:        10_000_000,   // ₩1,000만원
  usd:        10_000,        // $10,000
  holdings:   {},
  history:    [],
  initialKrw: 10_000_000,
  initialUsd: 10_000,
};

function load(): VirtualState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...INITIAL, ...JSON.parse(raw) };
  } catch {}
  return INITIAL;
}

function persist(state: VirtualState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function useVirtualPortfolio() {
  const [state, setState] = useState<VirtualState>(INITIAL);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(load());
    setMounted(true);
  }, []);

  const save = useCallback((next: VirtualState) => {
    setState(next);
    persist(next);
  }, []);

  /* ── 매수 ──────────────────────────────────────────── */
  const buy = useCallback((
    symbol:    string,
    name:      string,
    assetType: AssetType,
    qty:       number,
    price:     number,
    currency:  TradeCurrency,
  ): { ok: boolean; msg: string } => {
    const amount = qty * price;
    const cur = load();

    if (currency === 'KRW' && cur.krw < amount)
      return { ok: false, msg: `잔액 부족 (보유 ₩${cur.krw.toLocaleString('ko-KR')})` };
    if (currency === 'USD' && cur.usd < amount)
      return { ok: false, msg: `잔액 부족 (보유 $${cur.usd.toFixed(2)})` };
    if (qty <= 0) return { ok: false, msg: '수량을 입력하세요' };

    const prev = cur.holdings[symbol];
    const newQty = (prev?.qty ?? 0) + qty;
    const newAvg = prev
      ? (prev.avgPrice * prev.qty + price * qty) / newQty
      : price;

    const holding: VirtualHolding = {
      symbol, name, assetType,
      qty: newQty,
      avgPrice: newAvg,
      currency,
    };

    const trade: VirtualTrade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      symbol, name, assetType,
      side: 'buy', qty, price, amount, currency,
    };

    save({
      ...cur,
      krw: currency === 'KRW' ? cur.krw - amount : cur.krw,
      usd: currency === 'USD' ? cur.usd - amount : cur.usd,
      holdings: { ...cur.holdings, [symbol]: holding },
      history:  [trade, ...cur.history],
    });
    return { ok: true, msg: '매수 완료' };
  }, [save]);

  /* ── 매도 ──────────────────────────────────────────── */
  const sell = useCallback((
    symbol: string,
    qty:    number,
    price:  number,
  ): { ok: boolean; msg: string } => {
    const cur = load();
    const holding = cur.holdings[symbol];
    if (!holding)           return { ok: false, msg: '보유 종목이 없습니다' };
    if (holding.qty < qty)  return { ok: false, msg: `보유 수량 부족 (${holding.qty})` };
    if (qty <= 0)           return { ok: false, msg: '수량을 입력하세요' };

    const amount = qty * price;
    const newQty = holding.qty - qty;
    const newHoldings = { ...cur.holdings };
    if (newQty <= 0) delete newHoldings[symbol];
    else newHoldings[symbol] = { ...holding, qty: newQty };

    const trade: VirtualTrade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      symbol, name: holding.name, assetType: holding.assetType,
      side: 'sell', qty, price, amount, currency: holding.currency,
    };

    save({
      ...cur,
      krw: holding.currency === 'KRW' ? cur.krw + amount : cur.krw,
      usd: holding.currency === 'USD' ? cur.usd + amount : cur.usd,
      holdings: newHoldings,
      history:  [trade, ...cur.history],
    });
    return { ok: true, msg: '매도 완료' };
  }, [save]);

  /* ── 초기화 ─────────────────────────────────────────── */
  const reset = useCallback(() => {
    save(INITIAL);
  }, [save]);

  return { state, mounted, buy, sell, reset };
}
