'use client';

import { useState, useEffect } from 'react';
import { useVirtualPortfolio } from '@/hooks/useVirtualPortfolio';
import type { AssetType, TradeCurrency } from '@/lib/types';

interface Props {
  symbol:    string;
  name:      string;
  assetType: AssetType;
  price:     number;
  currency:  TradeCurrency;
  onClose:   () => void;
}

function fmt(n: number, cur: TradeCurrency) {
  if (cur === 'KRW') return `₩${Math.round(n).toLocaleString('ko-KR')}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default function VirtualTradeModal({ symbol, name, assetType, price, currency, onClose }: Props) {
  const { state, buy, sell } = useVirtualPortfolio();
  const [side, setSide]       = useState<'buy' | 'sell'>('buy');
  const [qtyStr, setQtyStr]   = useState('');
  const [msg, setMsg]         = useState<{ text: string; ok: boolean } | null>(null);

  const qty    = parseFloat(qtyStr) || 0;
  const total  = qty * price;
  const balance = currency === 'KRW' ? state.krw : state.usd;
  const holding = state.holdings[symbol];
  const heldQty = holding?.qty ?? 0;

  // 최대 매수 수량
  const maxBuy  = price > 0 ? Math.floor(balance / price) : 0;
  const maxSell = heldQty;

  useEffect(() => { setMsg(null); setQtyStr(''); }, [side]);

  const handleConfirm = () => {
    let result: { ok: boolean; msg: string };
    if (side === 'buy') {
      result = buy(symbol, name, assetType, qty, price, currency);
    } else {
      result = sell(symbol, qty, price);
    }
    setMsg({ text: result.msg, ok: result.ok });
    if (result.ok) {
      setTimeout(onClose, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-bold text-[var(--text)] text-lg leading-tight">{name}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{symbol}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 현재가 */}
        <div className="text-center mb-5 p-3 rounded-xl bg-white/5">
          <p className="text-xs text-[var(--text-muted)] mb-0.5">현재가</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--text)]">{fmt(price, currency)}</p>
        </div>

        {/* 매수 / 매도 탭 */}
        <div className="flex rounded-xl overflow-hidden border border-[var(--border)] mb-5">
          <button
            onClick={() => setSide('buy')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              side === 'buy' ? 'bg-emerald-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >매수</button>
          <button
            onClick={() => setSide('sell')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              side === 'sell' ? 'bg-red-500 text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >매도</button>
        </div>

        {/* 잔액 / 보유 */}
        <div className="flex justify-between text-xs text-[var(--text-muted)] mb-2">
          <span>
            {side === 'buy'
              ? `예수금: ${fmt(balance, currency)}`
              : `보유 수량: ${heldQty.toLocaleString()}`}
          </span>
          <button
            className="text-sky-400 hover:text-sky-300"
            onClick={() => setQtyStr(String(side === 'buy' ? maxBuy : maxSell))}
          >
            최대
          </button>
        </div>

        {/* 수량 입력 */}
        <input
          type="number"
          min="0"
          step={currency === 'KRW' ? '1' : '0.00001'}
          placeholder="수량"
          value={qtyStr}
          onChange={(e) => { setQtyStr(e.target.value); setMsg(null); }}
          className="w-full bg-white/5 border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-sky-500/50 mb-3 tabular-nums"
        />

        {/* 주문 총액 */}
        <div className="flex justify-between text-sm mb-4">
          <span className="text-[var(--text-muted)]">주문 총액</span>
          <span className={`font-semibold tabular-nums ${qty > 0 ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
            {qty > 0 ? fmt(total, currency) : '-'}
          </span>
        </div>

        {/* 결과 메시지 */}
        {msg && (
          <p className={`text-xs text-center mb-3 font-medium ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.text}
          </p>
        )}

        {/* 확인 버튼 */}
        <button
          onClick={handleConfirm}
          disabled={qty <= 0}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'buy'
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
              : 'bg-red-500 hover:bg-red-400 text-white'
          }`}
        >
          {side === 'buy' ? '매수 확인' : '매도 확인'}
        </button>

        {/* 유의사항 */}
        <p className="text-[10px] text-[var(--text-muted)] text-center mt-3 opacity-60">
          가상투자 · 실제 거래와 무관합니다
        </p>
      </div>
    </div>
  );
}
