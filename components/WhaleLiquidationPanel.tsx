'use client';
// 실시간 청산(브라우저 WS: Binance→Bybit) + 온체인 고래 피드 — coin-signal에서 이식
import { useEffect, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import RotatingTicker from '@/components/ui/RotatingTicker';

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

export default function WhaleLiquidationPanel({ symbol }: { symbol?: string }) {
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

  // 현재 코인만 보기 — ETH 화면이면 ETH 청산·고래만, SOL 화면이면 SOL만
  const sym = symbol && SYMBOLS.includes(symbol) ? symbol : null;
  const short = sym ? sym.replace('USDT', '') : null;
  const fLiqs = sym ? liqs.filter((it) => it.sym === sym) : liqs;
  const fWhale = (whale?.items ?? []).filter((it) => !short || (it.symbol ?? '').toUpperCase().includes(short));

  const liqLine = (it: Liq): ReactNode => (
    <span className="flex items-baseline gap-2">
      <span className={`min-w-[52px] text-center text-[10px] font-bold rounded px-1 py-0.5 ${it.long ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{it.long ? '롱 청산' : '숏 청산'}</span>
      <span className="font-bold">{it.sym.replace('USDT', '')}</span>
      <span className="font-bold tabular-nums">{fmtUsd(it.usd)}</span>
      <span className="text-[var(--text-muted)] text-[11px]">@ {fmtPx(it.sym, it.price)}</span>
      <span className="ml-auto text-[var(--text-muted)] text-[10px]">{new Date(it.ts).toLocaleTimeString('ko-KR')}</span>
    </span>
  );
  const whaleLine = (it: WhaleItem): ReactNode => (
    <span className="flex items-baseline gap-2 flex-wrap">
      <span className={`min-w-[42px] text-center text-[10px] font-bold rounded px-1 py-0.5 ${it.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : it.side === 'SELL' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-amber-400'}`}>{it.side === 'BUY' ? '매수' : it.side === 'SELL' ? '매도' : '이동'}</span>
      <span className="font-bold tabular-nums min-w-[64px]">{fmtUsd(it.usd)}</span>
      <span className="text-[var(--text)]">{it.label}{it.from ? <span className="text-[10px] text-[var(--text-muted)] ml-1">{it.from} → {it.to}</span> : null}</span>
      <span className="ml-auto text-[var(--text-muted)] text-[10px]">{ago(it.ts)}</span>
    </span>
  );

  // 한 줄 회전용 — 청산·고래를 최신순으로 섞어 흘린다
  const merged: { ts: number; node: ReactNode }[] = [
    ...fLiqs.map((it) => ({ ts: it.ts, node: liqLine(it) })),
    ...fWhale.map((it) => ({ ts: it.ts, node: whaleLine(it) })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 24);

  const title = <>⚡ 실시간 청산 · 🐋 온체인 고래{short ? <span className="text-[10px] font-normal text-[var(--text-muted)] ml-1">{short}</span> : null}</>;
  const badge = (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${liqSrc ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-[var(--text-muted)]'}`}>
      {liqSrc ? `LIVE · ${liqSrc}` : '연결 중…'}
    </span>
  );

  return (
    <RotatingTicker
      title={title} badge={badge}
      lines={merged.map((m) => m.node)}
      emptyText={short ? `${short} 청산·고래 대기 중… (발생 시 실시간 표시)` : '청산·고래 대기 중…'}
    >
      <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">실시간 청산 (Liquidation){short ? ` · ${short}` : ''}</p>
      <ul className="mb-3 max-h-56 overflow-y-auto">
        {fLiqs.length ? fLiqs.map((it, i) => <li key={i} className="py-1 border-b border-[var(--border)] text-[12px]">{liqLine(it)}</li>)
          : <li className="text-[11px] text-[var(--text-muted)] py-1">청산 대기 중… (발생 시 실시간 표시)</li>}
      </ul>
      <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">대량 체결 · 온체인 이동{short ? ` · ${short}` : ''}</p>
      <ul className="max-h-72 overflow-y-auto">
        {fWhale.slice(0, 30).map((it, i) => <li key={i} className="py-1 border-b border-[var(--border)] text-[12px]">{whaleLine(it)}</li>)}
        {!fWhale.length && <li className="text-[11px] text-[var(--text-muted)] py-1">{short ? `${short} 고래 데이터 대기 중…` : '고래 데이터 로딩 중…'}</li>}
      </ul>
      {whale?.note && <p className="text-[10px] text-[var(--text-muted)] mt-2 opacity-70">{whale.note}</p>}
    </RotatingTicker>
  );
}
