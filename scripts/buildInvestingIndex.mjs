// public/data/investing/*.json 을 스캔해 index.json(매니페스트) 생성.
// 인베스팅 지표 수집 파일 하나를 추가/갱신할 때마다 실행: node scripts/buildInvestingIndex.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'data', 'investing');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'index.json');

const items = files.map((f) => {
  const d = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const rows = Array.isArray(d.rows) ? d.rows : [];
  return {
    id: d.id ?? f.replace(/\.json$/, ''),
    name: d.name ?? d.id,
    url: d.url ?? null,
    count: rows.length,
    newest: rows[0]?.date ?? null,
    oldest: rows[rows.length - 1]?.date ?? null,
  };
}).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

writeFileSync(join(DIR, 'index.json'), JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), items }, null, 2));
console.log(`index.json: ${items.length}개 지표`);
for (const it of items) console.log(` - ${it.id}  ${it.count}행  ${it.oldest}~${it.newest}`);
