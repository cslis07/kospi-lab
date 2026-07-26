/**
 * 경제지표 수집 검증 — 실제 lib/macroIndicators.ts 를 그대로 실행한다.
 * 실행: npx tsx scripts/verify-macro.ts
 * (일회성 진단 스크립트. .env.local 을 직접 읽고 키는 출력하지 않는다.)
 */
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// env 를 먼저 채운 뒤 동적 import — lib 모듈의 ECOS_KEY 가 모듈 로드 시점에 고정되기 때문
async function main() {
const { fetchMacroIndicators } = await import('../lib/macroIndicators');

const r = await fetchMacroIndicators();
const show = (name: string, v: typeof r.usCpi) =>
  console.log(
    `  ${name.padEnd(12)} ${v ? `${v.value} ${v.unit} [${v.label}] ${v.changeLabel}=${v.change ?? 'null'} (${v.source})` : 'null ⚠'}`,
  );

console.log('\n=== fetchMacroIndicators() 실측 ===');
show('미국 CPI', r.usCpi);
show('반도체수출', r.semiconExport);
show('가계부채', r.householdDebt);
show('부동산', r.realEstate);

console.log('\n=== 검증 ===');
const nowQ = (() => { const d = new Date(); return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`; })();
console.log(`  현재 분기: ${nowQ}`);
const ok = [
  ['CPI 값이 3.4~3.5% 구간(12개월 기준)', r.usCpi != null && r.usCpi.value >= 3.4 && r.usCpi.value < 3.6],
  ['가계부채 라벨이 2025 Q1 이 아님', r.householdDebt != null && r.householdDebt.label !== '2025 Q1'],
  ['가계부채 QoQ 가 null 이 아님', r.householdDebt?.change != null],
  ['부동산 정상', r.realEstate != null],
  ['반도체 정상', r.semiconExport != null],
] as const;
for (const [label, pass] of ok) console.log(`  ${pass ? '✓' : '✗'} ${label}`);
process.exit(ok.every(([, p]) => p) ? 0 : 1);
}

main();
