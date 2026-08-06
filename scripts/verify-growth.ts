/**
 * 성장주 스크리너 실데이터 검증 — lib/growthScreener 를 그대로 실행.
 * 실행: npx tsx scripts/verify-growth.ts
 */
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const { fetchGrowthFinance, scoreGrowth } = await import('../lib/growthScreener');
  const { fetchKrxDailyMap } = await import('../lib/krx');

  console.log('=== 1) 유니버스 (KRX 시총 상위, 우선주·스팩 제외) ===');
  const { map, date } = await fetchKrxDailyMap();
  console.log(`전종목 ${map.size}개, 기준일 ${date}`);
  const uni = [...map.entries()]
    .filter(([code, d]) => code[5] === '0' && !/스팩|리츠|SPAC/i.test(d.name) && d.marketCap > 0)
    .sort((a, b) => b[1].marketCap - a[1].marketCap)
    .slice(0, 12);
  console.log('상위 12:', uni.map(([c, d]) => `${d.name}(${c})`).join(', '));

  console.log('\n=== 2) 재무·점수 (상위 12종목 실데이터) ===');
  const rows: Array<{ name: string; code: string; total: number; badges: string[]; m: ReturnType<typeof scoreGrowth>['metrics']; hasC: boolean }> = [];
  for (const [code, d] of uni) {
    const fin = await fetchGrowthFinance(code);
    if (!fin) { console.log(`  ${d.name}(${code}): 재무 조회 실패`); continue; }
    const s = scoreGrowth(fin);
    rows.push({ name: d.name, code, total: s.total, badges: s.badges, m: s.metrics, hasC: s.hasConsensus });
  }
  rows.sort((a, b) => b.total - a.total);
  console.log('종목          점수  매출YoY  영업YoY  컨센영업  fwdPER   PEG   배지');
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(10)} ${String(r.total).padStart(5)}  ${String(r.m.revYoY ?? '-').padStart(7)}  ${String(r.m.opYoY ?? '-').padStart(7)}  ` +
      `${String(r.m.cOpGrowth ?? '-').padStart(8)}  ${String(r.m.forwardPer ?? '-').padStart(6)}  ${String(r.m.peg ?? '-').padStart(5)}  ` +
      `${r.badges.join('·') || (r.hasC ? '' : '미커버')}`,
    );
  }

  console.log('\n=== 3) 무결성 체크 ===');
  const checks: Array<[string, boolean]> = [
    ['12종목 중 10개 이상 점수 산출', rows.length >= 10],
    ['점수가 전부 0~100', rows.every((r) => r.total >= 0 && r.total <= 100)],
    ['점수가 전부 동일하지 않음(변별력)', new Set(rows.map((r) => r.total)).size > 3],
    ['PEG 음수 없음', rows.every((r) => r.m.peg == null || r.m.peg > 0)],
    ['fwdPER 음수 없음', rows.every((r) => r.m.forwardPer == null || r.m.forwardPer > 0)],
  ];
  let allOk = true;
  for (const [label, pass] of checks) { console.log(`  ${pass ? '✓' : '✗'} ${label}`); if (!pass) allOk = false; }
  process.exit(allOk ? 0 : 1);
}

main();
