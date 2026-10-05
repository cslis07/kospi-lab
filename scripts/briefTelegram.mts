/**
 * 모닝 브리핑 텔레그램 발송 — 아침 크론(brief-warm.yml)이 /api/brief 를 데운 뒤 실행.
 *
 * 배포된 공개 API(/api/brief·/api/brief/edge)에서 3개 증시 요약·지표·뉴스를 받아
 * "kospi lab" 그룹으로 보낸다(coinTrack 과 같은 봇·채팅). 앱 코드는 import 하지 않아 독립적.
 *
 * 토큰: KL_TELEGRAM_BOT_TOKEN||TELEGRAM_BOT_TOKEN · KL_TELEGRAM_CHAT_ID||TELEGRAM_CHAT_ID.
 * 원칙: 매매 신호 아님. 과거 통계는 '유의'여도 다음 날 보장 아님(시가 갭 반영 주의 포함).
 */
const BASE = process.env.BRIEF_BASE || 'https://kospi-lab.vercel.app';
const TG_TOKEN = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

type Market = 'coin' | 'kr' | 'us';
interface MacroNum { key: string; label: string; value: string; change: number | null; changeText: string; group?: string }
interface News { title: string; link: string; source: string; tag: string | null }
interface Brief { market: Market; ai: { headline: string; bullets: string[]; error?: string }; macro: MacroNum[]; news: News[]; war: News[]; events: { date: string; title: string; importance: string }[] }
interface EdgeRow { factor: string; label: string; bucket: 'surge' | 'drop'; n: number; upRate: number; baseRate: number; verdict: string; intra?: { verdict: string } }
interface Edge { target: string; rows: EdgeRow[]; latest: { factor: string; date: string; bucket: string }[] }

const MARKETS: { key: Market; emoji: string; name: string; macro: string[] }[] = [
  { key: 'coin', emoji: '🪙', name: '코인', macro: ['btc', 'us10y', 'wti', 'vix', 'dxy', 'funding', 'fng'] },
  { key: 'kr', emoji: '🇰🇷', name: '국내증시', macro: ['kospi', 'kosdaq', 'usdkrw', 'us10y', 'wti'] },
  { key: 'us', emoji: '🇺🇸', name: '해외증시', macro: ['sp500', 'nasdaq', 'us10y', 'vix', 'wti'] },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const shortLabel = (l: string) =>
  l.replace('달러인덱스(DXY)', 'DXY').replace(/\(선물\)/, '').replace('국채금리', '금리').replace('(변동성)', '')
    .replace('원/달러 환율', '원·달러').replace('공포·탐욕 지수', '공포탐욕').replace('BTC ', '').trim();

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, { signal: AbortSignal.timeout(20000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** 어젯밤 요인이 급변했고 과거 그런 날 '유의'한 차이가 있었던 경우만 한 줄로 */
function edgeLine(e: Edge | null): string[] {
  if (!e?.rows?.length) return [];
  const out: string[] = [];
  for (const r of e.rows) {
    if (r.verdict !== 'significant') continue;
    const l = e.latest.find((x) => x.factor === r.factor && x.bucket === r.bucket);
    if (!l) continue; // 지금 그 구간에 해당하는 요인만
    const gap = r.intra && r.intra.verdict !== 'significant' ? ' (단 시가 갭에 반영 — 장중 우위 없음)' : '';
    out.push(`📊 어젯밤 ${esc(r.label)} ${r.bucket === 'surge' ? '급등' : '급락'} → 과거 이런 날 다음날 ${esc(e.target)} 상승 <b>${Math.round(r.upRate)}%</b>(평소 ${Math.round(r.baseRate)}%)${gap}`);
    if (out.length >= 2) break;
  }
  return out;
}

function section(b: Brief, e: Edge | null, def: typeof MARKETS[number]): string {
  const lines: string[] = [`${def.emoji} <b>${def.name}</b>`];
  if (b.ai.headline) {
    lines.push(esc(b.ai.headline));
    for (const bl of b.ai.bullets.slice(0, 3)) lines.push(`· ${esc(bl)}`);
  } else {
    lines.push(`<i>AI 요약 생성 실패${b.ai.error ? ` (${esc(b.ai.error)})` : ''}</i>`);
  }
  // 지표 한 줄
  const picks = def.macro.map((k) => b.macro.find((m) => m.key === k)).filter((m): m is MacroNum => !!m).slice(0, 5);
  if (picks.length) lines.push('📉 ' + picks.map((m) => `${esc(shortLabel(m.label))} ${esc(m.value)}${m.change != null ? `(${esc(m.changeText)})` : ''}`).join(' · '));
  // 과거 통계 하이라이트
  for (const el of edgeLine(e)) lines.push(el);
  // 전쟁·지정학 1건
  if (b.war[0]) lines.push(`⚠️ <a href="${esc(b.war[0].link)}">${esc(b.war[0].title)}</a>`);
  // 주요 뉴스 2건
  for (const n of b.news.slice(0, 2)) lines.push(`• <a href="${esc(n.link)}">${esc(n.title)}</a> <i>${esc(n.source)}</i>`);
  // 오늘 일정
  if (b.events[0]) lines.push(`🗓 ${esc(b.events[0].date.slice(5))} ${esc(b.events[0].title)}`);
  return lines.join('\n');
}

const DRY = !!process.env.BRIEF_TG_DRY;

async function main() {
  if (!DRY && (!TG_TOKEN || !TG_CHAT)) { console.log('telegram: 토큰/채팅 미설정 — 발송 생략'); return; }
  const kst = new Date(Date.now() + 9 * 3600_000);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];
  const head = `📰 <b>모닝 브리핑</b> · ${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${dow}) ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;

  const sections: string[] = [];
  for (const def of MARKETS) {
    const [b, e] = await Promise.all([getJson<Brief>(`/api/brief?market=${def.key}`), getJson<Edge>(`/api/brief/edge?market=${def.key}`)]);
    if (b) sections.push(section(b, e, def));
    else sections.push(`${def.emoji} <b>${def.name}</b>\n<i>불러오지 못했습니다</i>`);
  }
  const foot = `※ 맥락 참고용 · 매매 신호 아님\n🔗 ${BASE}/brief`;
  const text = [head, ...sections, foot].join('\n\n');

  if (DRY) { console.log(`[DRY] ${text.length}자 (한도 4096)\n----\n${text}\n----`); return; }

  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await r.json().catch(() => ({}));
  console.log(`telegram: ${r.status} ok=${(body as { ok?: boolean }).ok} · ${text.length}자`);
  if (!r.ok) { console.error('telegram error', JSON.stringify(body).slice(0, 300)); process.exit(1); }
}

main().catch((e) => { console.error('briefTelegram fail', e); process.exit(1); });
