/**
 * 현물 ETF 순유입 누적 보관 — SoSoValue 공식 API가 최근 1개월만 주므로 매일 받아 쌓는다.
 *   ETF_ARCHIVE_IN=old.json ETF_ARCHIVE_OUT=data/etf-flows.json npx tsx scripts/etfArchive.mts
 * 소스는 배포된 /api/etf/history(키는 Vercel에만 있음). 병합 규칙은 lib/etfEdge.mergeRows(같은 날짜는 새 값).
 * .github/workflows/etf-archive.yml 이 실행 후 etf-data 브랜치에 커밋한다.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mergeRows, type EtfArchive } from '../lib/etfEdge';

const BASE = process.env.ETF_BASE || 'https://kospi-lab.vercel.app';
const IN = process.env.ETF_ARCHIVE_IN || 'data/etf-flows.json';
const OUT = process.env.ETF_ARCHIVE_OUT || IN;

async function main() {
  const res = await fetch(`${BASE}/api/etf/history?t=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`history ${res.status}`);
  const fresh = await res.json() as Pick<EtfArchive, 'BTC' | 'ETH'>;
  const old: EtfArchive = existsSync(IN) ? JSON.parse(readFileSync(IN, 'utf8')) : { updatedAt: '', BTC: [], ETH: [] };
  const next: EtfArchive = { updatedAt: new Date().toISOString(), BTC: mergeRows(old.BTC, fresh.BTC), ETH: mergeRows(old.ETH, fresh.ETH) };
  if (next.BTC.length < old.BTC.length || next.ETH.length < old.ETH.length) throw new Error('보관분이 줄어듦 — 중단');
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(next) + '\n');
  console.log(`BTC ${old.BTC.length}→${next.BTC.length} · ETH ${old.ETH.length}→${next.ETH.length} (${next.BTC[0]?.date}~${next.BTC.at(-1)?.date})`);
}

main().catch((e) => { console.error('etfArchive fail', e); process.exit(1); });
