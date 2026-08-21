'use client';
// 실시간 청산(브라우저 WS: Binance→Bybit) + 온체인 고래 피드 — coin-signal에서 이식
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'];
const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Liq { sym: string; long: boolean; usd: number; price: number; ts: number }
interface WhaleItem { type: string; symbol: string; ts: number; side: string; usd: number | null; qty: number; label: string; from?: string; to?: string }

function fmtPx(sym: string, v: number) {
  const d = sym === 'BTCUSDT' ? 0 : sym === 'ETHUSDT' ? 1 : sym === 'SOLUSDT' ? 2 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtUsd(v: number | null) {
  if (v == null) return '-';
  return v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1e3) + 'K';
}
function ago(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

export default function WhaleLiquidationPanel() {
  const [liqs, setLiqs] = useState<Liq[]>([]);
  const [liqSrc, setLiqSrc] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { data: whale } = useSWR<{ items: WhaleItem[]; note?: string; sources?: Record<string, number> }>('/api/whale', fetcher, { refreshInterval: 90_000 });

  useEffect(() => {
    let alive = true;
    const push = (it: Liq) => { if (!alive) return; setLiqs((prev) => [it, ...prev].slice(0, 25)); };
    const connectBybit = () => {
      let ws: WebSocket; try { ws = new WebSocket('wss://stream.bybit.com/v5/public/linear'); } catch { return; }
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ op: 'subscribe', args: SYMBOLS.map((s) => 'allLiquidation.' + s) }));
      ws.onmessage = (ev) => {
        let m: any; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.op === 'subscribe') { if (m.success && alive) setLiqSrc('Bybit'); return; }
        if (!m.topic || !m.data) return;
        for (const d of (Array.isArray(m.data) ? m.data : [m.data])) {
          const sym = d.s || m.topic.split('.')[1]; if (!SYMBOLS.includes(sym)) continue;
          const price = +d.p, usd = price * +(d.v || d.q || 0);
          if (!usd || usd < 5000) continue;
          push({ sym, long: (d.S || d.side) === 'Sell', usd, price, ts: +d.T || Date.now() });
        }
      };
      ws.onclose = () => { if (alive) setTimeout(connectBybit, 4000); };
    };
    const connectBinance = () => {
      let ws: WebSocket; try { ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr'); } catch { connectBybit(); return; }
      wsRef.current = ws;
      let got = false;
      const probe = setTimeout(() => { if (!got) { try { ws.onclose = null; ws.close(); } catch { /* noop */ } connectBybit(); } }, 20000);
      ws.onmessage = (ev) => {
        let m: any; try { m = JSON.parse(ev.data); } catch { return; }
        const o = m.o; if (!o || !SYMBOLS.includes(o.s)) return;
        got = true; clearTimeout(probe); if (alive) setLiqSrc('Binance');
        const price = +o.ap || +o.p, usd = price * +o.q;
        if (usd < 5000) return;
        push({ sym: o.s, long: o.S === 'SELL', usd, price, ts: o.T || Date.now() });
      };
      ws.onclose = () => { if (!got) { clearTimeout(probe); connectBybit(); } else if (alive) setTimeout(connectBinance, 3000); };
    };
    connectBinance();
    return () => { alive = false; try { wsRef.current?.close(); } catch { /* noop */ } };
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h3 className="text-sm font-bold text-[var(--text)]">⚡ 실시간 청산 · 🐋 온체인 고래 <span className="text-[10px] font-normal text-[var(--text-muted)]">강제청산 = 반대 포지션 유동성</span></h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${liqSrc ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-[var(--text-muted)]'}`}>
          {liqSrc ? `청산 LIVE · ${liqSrc}` : '청산 연결 중…'}
        </span>
      </div>
      <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">실시간 청산 (Liquidation)</p>
      <ul className="mb-3 max-h-56 overflow-y-auto">
        {liqs.length ? liqs.map((it, i) => (
          <li key={i} className="flex items-baseline gap-2 py-1 border-b border-[var(--border)] text-[12px]">
            <span className={`min-w-[52px] text-center text-[10px] font-bold rounded px-1 py-0.5 ${it.long ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{it.long ? '롱 청산' : '숏 청산'}</span>
            <span className="font-bold">{it.sym.replace('USDT', '')}</span>
            <span className="font-bold tabular-nums">{fmtUsd(it.usd)}</span>
            <span className="text-[var(--text-muted)] text-[11px]">@ {fmtPx(it.sym, it.price)}</span>
            <span className="ml-auto text-[var(--text-muted)] text-[10px]">{new Date(it.ts).toLocaleTimeString('ko-KR')}</span>
          </li>
        )) : <li className="text-[11px] text-[var(--text-muted)] py-1">청산 대기 중… (발생 시 실시간 표시)</li>}
      </ul>
      <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">대량 체결 · 온체인 이동</p>
      <ul className="max-h-72 overflow-y-auto">
        {(whale?.items ?? []).slice(0, 30).map((it, i) => (
          <li key={i} className="flex items-baseline gap-2 py-1 border-b border-[var(--border)] text-[12px] flex-wrap">
            <span className={`min-w-[42px] text-center text-[10px] font-bold rounded px-1 py-0.5 ${it.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : it.side === 'SELL' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-amber-400'}`}>{it.side === 'BUY' ? '매수' : it.side === 'SELL' ? '매도' : '이동'}</span>
            <span className="font-bold tabular-nums min-w-[64px]">{fmtUsd(it.usd)}</span>
            <span className="text-[var(--text)]">{it.label}{it.from ? <span className="text-[10px] text-[var(--text-muted)] ml-1">{it.from} → {it.to}</span> : null}</span>
            <span className="ml-auto text-[var(--text-muted)] text-[10px]">{ago(it.ts)}</span>
          </li>
        ))}
        {!whale?.items?.length && <li className="text-[11px] text-[var(--text-muted)] py-1">고래 데이터 로딩 중…</li>}
      </ul>
      {whale?.note && <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-70">{whale.note}</p>}
    </section>
  );
}
