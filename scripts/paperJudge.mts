/**
 * 모의 선행테스트 자동 판정 — data/paper-trades.json(사전 기록)을 Bitget 1시간봉으로 판정.
 *   npx tsx scripts/paperJudge.mts           # 보고서 출력만
 *   npx tsx scripts/paperJudge.mts --write   # 모의매매테스트.md 자동 집계 블록 갱신
 * 판정 규칙은 lib/paperJudge.ts 머리말. 결과를 보고 사전 기록을 고치지 말 것(문서 규칙 1).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  judgeTrade, checkSkip, summarize, byCondition, binomTailP, verdictText, fetchHourly, meanRTest, meanRText,
  type Candle, type PaperLog, type Judged,
} from '../lib/paperJudge';

const LOG = 'data/paper-trades.json';
const DOC = '모의매매테스트.md';
const START = '<!-- auto:paper-judge:start -->';
const END = '<!-- auto:paper-judge:end -->';

const kst = (ts?: number) => (ts == null ? '–' : new Date(ts + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' '));
const fmtR = (r: number | null) => (r == null ? '–' : `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`);
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}%`;
const LABEL: Record<string, string> = { win: '✅ 승', loss: '❌ 패', open: '⏳ 미결', void: '🚫 무효(미체결)', pending: '⌛ 체결 대기' };

async function main() {
  const log = JSON.parse(readFileSync(LOG, 'utf8')) as PaperLog;
  const coins = [...new Set([...log.trades.map((t) => t.coin), ...log.skips.map((s) => s.coin)])];
  const data = new Map<string, Candle[]>();
  for (const c of coins) data.set(c, await fetchHourly(c));
  const now = Date.now();

  const judged: Judged[] = log.trades.map((t) => judgeTrade(t, data.get(t.coin)!, now));
  const s = summarize(judged);
  const p = binomTailP(s.wins, s.wins + s.losses);
  const out: string[] = [];
  out.push(`> 자동 판정 ${kst(now)} KST · Bitget 1시간봉 · \`npx tsx scripts/paperJudge.mts --write\`로 갱신 (손으로 고치지 말 것)`, '');
  out.push(`**누계: ${s.n}건 · ${s.wins}승 ${s.losses}패 ${s.open}미결 · 누적 ${fmtR(s.sumR)}** · 무효 ${s.voided} · 대기 ${s.pending} → 승률 **${verdictText(s.wins + s.losses, s.winRate, p)}** · **${meanRText(meanRTest(judged.filter((j) => j.status === 'win' || j.status === 'loss').map((j) => j.r ?? 0)))}**`, '');
  out.push('| 라운드 | 코인 | 방향 | 방식 | 진입/손절/목표 | 체결 | 청산 | 결과 | R | 최대 유리/불리 |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const j of judged) {
    const t = j.trade;
    const fav = j.best != null ? `${pct(((j.best - t.entry) / t.entry) * 100 * (t.side === 'long' ? 1 : -1))} / ${pct(((j.worst! - t.entry) / t.entry) * 100 * (t.side === 'long' ? 1 : -1))}` : '–';
    out.push(`| R${t.round} | ${t.coin} | ${t.side === 'long' ? '롱' : '숏'} | ${t.type === 'limit' ? '지정가' : '시장가'} | ${t.entry} / ${t.stop} / ${t.target} | ${kst(j.filledAt)} | ${kst(j.exitAt)} | ${LABEL[j.status]} | ${fmtR(j.r)} | ${fav} |`);
  }
  out.push('', '**조건별 성적** (확정 승패만 승률, 미결은 R 합에만 · 표본 적으면 전부 우연일 수 있음)', '', '| 조건 | 값 | n | 승-패 | 승률 | R 합 | 판정 |', '|---|---|---|---|---|---|---|');
  for (const r of byCondition(judged)) {
    const d = r.wins + r.losses;
    out.push(`| ${r.key} | ${r.value} | ${r.n} | ${r.wins}-${r.losses} | ${r.winRate == null ? '–' : `${Math.round(r.winRate * 100)}%`} | ${fmtR(r.sumR)} | ${verdictText(d, r.winRate, binomTailP(r.wins, d))} |`);
  }
  out.push('', '**관망 사후 점검** (판정 구간 = 다음 라운드까지 · "엔진대로였다면" = 구간 끝 가격 기준 방향만)', '', '| 라운드 | 코인 | 관망 사유 | 엔진 | 이후 고/저 | 끝 | 엔진대로였다면 |', '|---|---|---|---|---|---|---|');
  let engW = 0, engL = 0;
  for (const sk of log.skips) {
    const c = checkSkip(sk, data.get(sk.coin)!, now);
    if (!c) { out.push(`| R${sk.round} | ${sk.coin} | ${sk.reason} | ${sk.engine ?? '–'} | 데이터 없음 | – | – |`); continue; }
    if (sk.until) { if (c.engineWouldWin === true) engW++; else if (c.engineWouldWin === false) engL++; }
    const eng = sk.engine === 'long' ? '롱' : sk.engine === 'short' ? '숏' : '관망';
    out.push(`| R${sk.round} | ${sk.coin} | ${sk.reason} | ${eng} | ${pct(c.highPct)} / ${pct(c.lowPct)} | ${pct(c.lastPct)}${sk.until ? '' : ' (진행 중)'} | ${c.engineWouldWin == null ? '–' : c.engineWouldWin ? '이득' : '손해'} |`);
  }
  out.push('', `> 엔진대로였다면(끝난 구간만) 이득 ${engW} / 손해 ${engL} — 같은 라운드 코인들은 같이 움직여 독립 표본이 아니다(규칙 5).`);

  const report = out.join('\n');
  console.log(report);
  if (process.argv.includes('--write')) {
    const doc = readFileSync(DOC, 'utf8');
    const block = `${START}\n${report}\n${END}`;
    const next = doc.includes(START) ? doc.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
      : doc.replace('## 누적 성적', `## 자동 판정 (scripts/paperJudge.mts)\n${block}\n\n## 누적 성적`);
    writeFileSync(DOC, next);
    console.error(`\n${DOC} 갱신`);
  }
}

main().catch((e) => { console.error('paperJudge fail', e); process.exit(1); });
