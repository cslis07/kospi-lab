// 온체인 고래 추적 (무료·무키) — coin-signal에서 이식
//  ① 거래소 대량 체결(Binance) ② BTC 온체인(blockchain.info) ③ ETH 온체인(퍼블릭 RPC) ④ XRP 온체인(XRPL)
//  ⑤ Whale Alert(WHALE_ALERT_API_KEY 있을 때만)
const THRESHOLD_USD: Record<string, number> = { BTCUSDT: 1_000_000, ETHUSDT: 500_000, XRPUSDT: 200_000, SOLUSDT: 200_000 };
const ETH_MIN = 100, XRP_MIN = 100_000, BTC_MIN = 25;
const XRP_SCAN_MAX = 16;         // 한 번에 훑는 최근 XRP 원장 수(병렬, 약 1분 분량 — 예전 콜드 21개와 비슷한 범위)
const XRP_BUDGET_MS = 7000;      // XRP 조회 상한 — 넘으면 누적 캐시로 응답(함수 한도 20초 안에서 전체 응답 보장)
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT'];
const shortAddr = (a: string | undefined) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '?';

export interface WhaleItem {
  type: 'exchange' | 'onchain' | 'whale-alert'; symbol: string; ts: number;
  side: 'BUY' | 'SELL' | 'MOVE'; price?: number; qty: number; usd: number | null;
  label: string; from?: string; to?: string; hash?: string;
}

// warm 인스턴스 공유 캐시
const cache = new Map<string, { v: unknown; exp: number }>();
const cget = <T>(k: string): T | null => { const h = cache.get(k); return h && h.exp > Date.now() ? (h.v as T) : null; };
const cset = <T>(k: string, v: T, ttl: number): T => { cache.set(k, { v, exp: Date.now() + ttl }); return v; };

async function jget(url: string, ms = 7000): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function jpost(url: string, body: unknown, ms = 7000): Promise<any> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function getPrices(): Promise<Record<string, number>> {
  const hit = cget<Record<string, number>>('px'); if (hit) return hit;
  const px: Record<string, number> = {};
  await Promise.allSettled(['BTCUSDT', 'ETHUSDT', 'XRPUSDT'].map(async (s) => {
    const t = await jget(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${s}`);
    px[s.replace('USDT', '')] = +t.price;
  }));
  return cset('px', px, 60_000);
}

async function largeTrades(symbol: string): Promise<WhaleItem[]> {
  const raw = await jget(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${symbol}&limit=1000`);
  const th = THRESHOLD_USD[symbol]; const out: WhaleItem[] = [];
  for (const t of raw) {
    const usd = +t.p * +t.q; if (usd < th) continue;
    out.push({ type: 'exchange', symbol, ts: t.T, side: t.m ? 'SELL' : 'BUY', price: +t.p, qty: +t.q, usd: Math.round(usd), label: `${symbol.replace('USDT', '')} 선물 대량 ${t.m ? '매도' : '매수'} 체결` });
  }
  return out.slice(-20);
}

async function bigBtcOnchain(btcPrice?: number): Promise<WhaleItem[]> {
  try {
    const raw = await jget('https://blockchain.info/unconfirmed-transactions?format=json', 6000);
    const out: WhaleItem[] = [];
    for (const tx of (raw.txs || [])) {
      const sats = (tx.out || []).reduce((s: number, o: any) => s + (o.value || 0), 0);
      const btc = sats / 1e8; if (btc < BTC_MIN) continue;
      out.push({ type: 'onchain', symbol: 'BTCUSDT', ts: (tx.time || 0) * 1000, side: 'MOVE', qty: +btc.toFixed(2), usd: btcPrice ? Math.round(btc * btcPrice) : null, label: `BTC 온체인 대형 전송 ${btc.toFixed(1)} BTC`, hash: tx.hash });
    }
    return out.slice(0, 15);
  } catch { return []; }
}

async function bigEthOnchain(ethPrice?: number): Promise<WhaleItem[]> {
  const hit = cget<WhaleItem[]>('eth'); if (hit) return hit;
  try {
    const rpc = (method: string, params: unknown[]) => jpost('https://ethereum-rpc.publicnode.com', { jsonrpc: '2.0', id: 1, method, params }, 8000).then((r) => { if (r.error) throw new Error(r.error.message); return r.result; });
    const latest = parseInt(await rpc('eth_blockNumber', []), 16);
    const blocks = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => rpc('eth_getBlockByNumber', ['0x' + (latest - i).toString(16), true])));
    const E18 = BigInt(10) ** BigInt(18), E14 = BigInt(10) ** BigInt(14);
    const minWei = BigInt(ETH_MIN) * E18; const out: WhaleItem[] = [];
    for (const b of blocks) {
      if (b.status !== 'fulfilled' || !b.value) continue;
      const ts = parseInt(b.value.timestamp, 16) * 1000;
      for (const tx of (b.value.transactions || [])) {
        let wei: bigint; try { wei = BigInt(tx.value); } catch { continue; }
        if (wei < minWei) continue;
        const eth = Number(wei / E14) / 1e4;
        out.push({ type: 'onchain', symbol: 'ETHUSDT', ts, side: 'MOVE', qty: +eth.toFixed(1), usd: ethPrice ? Math.round(eth * ethPrice) : null, label: `ETH 온체인 대형 전송 ${eth.toFixed(0)} ETH`, from: shortAddr(tx.from), to: shortAddr(tx.to), hash: tx.hash });
      }
    }
    const prev = cget<WhaleItem[]>('eth:acc') || [];
    const cutoff = Date.now() - 3600_000;
    const merged = [...out, ...prev.filter((p) => !out.some((o) => o.hash === p.hash))].filter((x) => x.ts > cutoff).sort((a, b) => b.ts - a.ts).slice(0, 15);
    cset('eth:acc', merged, 3600_000);
    return cset('eth', merged, 55_000);
  } catch { return cget<WhaleItem[]>('eth:acc') || []; }
}

async function xrpNames(): Promise<Record<string, string>> {
  const hit = cget<Record<string, string>>('xrpnames'); if (hit) return hit;
  try {
    const raw = await jget('https://api.xrpscan.com/api/v1/names/well-known', 8000);
    const map: Record<string, string> = {};
    for (const r of raw) if (r.account && r.name) map[r.account] = r.name + (r.desc && /^\d+$/.test(r.desc) ? ` #${r.desc}` : '');
    return cset('xrpnames', map, 6 * 3600_000);
  } catch { return cset('xrpnames', {}, 600_000); }
}
const XRPL_HOSTS = ['https://xrplcluster.com', 'https://s1.ripple.com:51234', 'https://s2.ripple.com:51234'];
async function bigXrpOnchain(xrpPrice?: number): Promise<WhaleItem[]> {
  const hit = cget<WhaleItem[]>('xrp'); if (hit) return hit;
  try {
    // 속도(2026-11-06 실측): 원장 1개 조회 1.3~3초 × 예전 최대 21개를 3개씩 순차+200ms 대기 = 콜드 18초(함수 한도 20초 근접).
    // → 이름표는 원장 조회와 동시에, 원장은 최근 최대 16개를 한 번에 병렬로(누적 캐시가 24시간을 이어 붙인다).
    const namesP = xrpNames();
    const first = await jpost(XRPL_HOSTS[0], { method: 'ledger', params: [{ ledger_index: 'validated', transactions: false }] }, 5000);
    const latestIdx = +(first.result?.ledger_index || first.result?.ledger?.ledger_index);
    if (!latestIdx) throw new Error('no ledger index');
    const lastScanned = cget<number>('xrp:last') || 0;
    const fromIdx = Math.max(lastScanned + 1, latestIdx - XRP_SCAN_MAX + 1);
    const idxs: number[] = []; for (let i = fromIdx; i <= latestIdx; i++) idxs.push(i);
    const out: WhaleItem[] = [];
    const ledgers = await Promise.all(idxs.map((idx, j) =>
      jpost(XRPL_HOSTS[j % XRPL_HOSTS.length], { method: 'ledger', params: [{ ledger_index: idx, transactions: true, expand: true }] }, 4000).catch(() => null)));
    const names = await namesP;
    {
      const results = ledgers;
      for (const r of results) {
        const lg = r?.result?.ledger; if (!lg) continue;
        const ts = (+lg.close_time + 946684800) * 1000;
        for (const tx of (lg.transactions || [])) {
          const t = tx.tx_json || tx;
          if (t.TransactionType !== 'Payment') continue;
          const meta = tx.metaData || tx.meta;
          const delivered = meta && meta.delivered_amount != null ? meta.delivered_amount : (t.DeliverMax ?? t.Amount);
          if (typeof delivered !== 'string' || t.Account === t.Destination) continue;
          const xrp = +delivered / 1e6; if (xrp < XRP_MIN) continue;
          out.push({ type: 'onchain', symbol: 'XRPUSDT', ts, side: 'MOVE', qty: Math.round(xrp), usd: xrpPrice ? Math.round(xrp * xrpPrice) : null, label: `XRP 대형 전송 ${xrp >= 1e6 ? (xrp / 1e6).toFixed(2) + 'M' : Math.round(xrp / 1e3) + 'K'} XRP`, from: names[t.Account] || shortAddr(t.Account), to: names[t.Destination] || shortAddr(t.Destination), hash: tx.hash || t.hash });
        }
      }
    }
    cset('xrp:last', latestIdx, 3600_000);
    const prev = cget<WhaleItem[]>('xrp:acc') || [];
    const cutoff = Date.now() - 24 * 3600_000;
    const merged = [...out, ...prev.filter((p) => !out.some((o) => o.hash === p.hash))].filter((x) => x.ts > cutoff).sort((a, b) => b.ts - a.ts).slice(0, 15);
    cset('xrp:acc', merged, 24 * 3600_000);
    return cset('xrp', merged, 55_000);
  } catch { return cget<WhaleItem[]>('xrp:acc') || []; }
}

async function whaleAlert(): Promise<{ items: WhaleItem[]; enabled: boolean }> {
  const key = process.env.WHALE_ALERT_API_KEY;
  if (!key) return { items: [], enabled: false };
  try {
    const start = Math.floor(Date.now() / 1000) - 3600;
    const raw = await jget(`https://api.whale-alert.io/v1/transactions?api_key=${key}&min_value=1000000&start=${start}&limit=50`, 7000);
    const want = new Set(['btc', 'eth', 'xrp', 'sol', 'usdt', 'usdc']);
    const items: WhaleItem[] = (raw.transactions || []).filter((t: any) => want.has((t.symbol || '').toLowerCase())).map((t: any) => ({
      type: 'whale-alert', symbol: (t.symbol || '').toUpperCase(), ts: t.timestamp * 1000, side: 'MOVE', qty: t.amount, usd: Math.round(t.amount_usd || 0),
      from: t.from?.owner || t.from?.owner_type || 'unknown', to: t.to?.owner || t.to?.owner_type || 'unknown',
      label: `${(t.symbol || '').toUpperCase()} ${t.from?.owner || '?'} → ${t.to?.owner || '?'}`,
    }));
    return { items, enabled: true };
  } catch { return { items: [], enabled: true }; }
}

export async function getWhaleFeed() {
  const hit = cget<any>('all'); if (hit) return hit;
  // 시세는 거래소 체결 조회와 동시에(예전엔 시세를 먼저 기다린 뒤 나머지를 시작)
  const pxP = getPrices();
  const xrpCapped = pxP.then((px) => Promise.race([
    bigXrpOnchain(px.XRP),
    new Promise<WhaleItem[]>((res) => setTimeout(() => res(cget<WhaleItem[]>('xrp:acc') || []), XRP_BUDGET_MS)),
  ]));
  const [trades, btc, eth, xrp, wa] = await Promise.all([
    Promise.allSettled(SYMBOLS.map(largeTrades)).then((rs) => rs.flatMap((r) => r.status === 'fulfilled' ? r.value : [])),
    pxP.then((px) => bigBtcOnchain(px.BTC)), pxP.then((px) => bigEthOnchain(px.ETH)), xrpCapped, whaleAlert(),
  ]);
  const items = [...trades, ...btc, ...eth, ...xrp, ...wa.items].sort((a, b) => b.ts - a.ts).slice(0, 60);
  const payload = {
    ts: Date.now(), items, whaleAlertEnabled: wa.enabled,
    sources: { exchange: trades.length, btcChain: btc.length, ethChain: eth.length, xrpChain: xrp.length, whaleAlert: wa.items.length },
    note: 'BTC(25개↑)·ETH(100개↑)·XRP(10만개↑) 온체인 대형 전송 + 4개 코인 선물 대량 체결을 무료 공개 데이터로 추적. XRP·일부 지갑은 공개 이름(거래소 등) 라벨. SOL 온체인은 무료 RPC 제한으로 거래소 체결만.',
  };
  return cset('all', payload, 55_000);
}
