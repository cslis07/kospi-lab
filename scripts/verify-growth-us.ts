/**
 * 미국 성장주 스캔 + 시장 환경 실데이터 검증.
 * 실행: npx tsx scripts/verify-growth-us.ts
 */
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const { fetchMarketEnvironment } = await import('../lib/marketEnvironment');
  const { scanUsTicker } = await import('../lib/usGrowth');

  console.log('=== 1) 시장 환경 ===');
  const env = await fetchMarketEnvironment();
  console.log(`종합: [${env.overall.label}] ${env.overall.comment}`);
  for (const i of env.indicators) {
    console.log(`  [${i.tone.padEnd(7)}] ${i.label.padEnd(12)} ${i.value}${i.unit} (${i.asOf}) 1M변화 ${i.changePct ?? '-'}`);
  }

  console.log('\n=== 2) 미국 대표 10종목 스캔 ===');
  const SAMPLE = ['NVDA', 'MSFT', 'LLY', 'V', 'PLTR', 'KO', 'TSLA', 'CRWD', 'XOM', 'SNOW'];
  const rows: Array<{ t: string; n: string; total: number; badges: string[]; peg: number | null; buffett: number; comment: string }> = [];
  for (const t of SAMPLE) {
    const r = await scanUsTicker(t);
    if (!r) { console.log(`  ${t}: 조회 실패`); continue; }
    rows.push({ t, n: r.name, total: r.score.total, badges: r.score.badges, peg: r.score.metrics.peg, buffett: r.score.buffett.pass, comment: r.score.comment });
  }
  rows.sort((a, b) => b.total - a.total);
  for (const r of rows) {
    console.log(`  ${r.t.padEnd(5)} ${String(r.total).padStart(5)}점  PEG ${String(r.peg ?? '-').padStart(5)}  버핏 ${r.buffett}/7  ${r.badges.join('·')}`);
    console.log(`        💬 ${r.comment}`);
  }

  console.log('\n=== 3) 무결성 ===');
  const checks: Array<[string, boolean]> = [
    ['환경 지표 4개 이상 수집', env.indicators.length >= 4],
    ['10종목 중 8개 이상 점수 산출', rows.length >= 8],
    ['점수 변별력(고유값 4개 이상)', new Set(rows.map((r) => r.total)).size >= 4],
    ['전 종목 코멘트 존재', rows.every((r) => r.comment.length > 5)],
    ['PEG 음수 없음', rows.every((r) => r.peg == null || r.peg > 0)],
  ];
  let ok = true;
  for (const [label, pass] of checks) { console.log(`  ${pass ? '✓' : '✗'} ${label}`); if (!pass) ok = false; }
  process.exit(ok ? 0 : 1);
}

main();
