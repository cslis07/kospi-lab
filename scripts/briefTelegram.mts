/**
 * 모닝 브리핑 텔레그램 발송 — 아침 크론(brief-warm.yml)이 /api/brief 를 데운 뒤 실행.
 *
 * 배포된 공개 API(/api/brief·/api/brief/edge)에서 3개 증시 요약·지표·뉴스를 받아
 * "kospi lab" 그룹으로 보낸다(coinTrack 과 같은 봇·채팅). 앱 코드는 import 하지 않아 독립적.
 *
 * 설계(2026-10-06 사용자 피드백): "아침에 딱 보면 시장을 안다" — 맨 위 【한눈에】 4줄(3증시 방향+핵심
 *   숫자 + 공통 거시 한 줄)로 즉시 파악, 아래는 증시별 한 줄 요약 + 코인 수급/과거통계 + 뉴스 1건으로 압축.
 *   같은 숫자를 두 번 쓰지 않는다(공통 거시는 한눈에에만). 매매 신호 아님.
 *
 * 토큰: KL_TELEGRAM_BOT_TOKEN||TELEGRAM_BOT_TOKEN · KL_TELEGRAM_CHAT_ID||TELEGRAM_CHAT_ID.
 */
const BASE = process.env.BRIEF_BASE || 'https://kospi-lab.vercel.app';
const TG_TOKEN = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

type Market = 'coin' | 'kr' | 'us';
interface MacroNum { key: string; label: string; value: string; change: number | null; changeText: string; group?: string; live?: boolean }
interface News { title: string; link: string; source: string; tag: string | null }
interface Brief { market: Market; ai: { headline: string; bullets: string[]; error?: string }; macro: MacroNum[]; news: News[]; war: News[]; events: { date: string; title: string; importance: string }[] }
interface EdgeRow { factor: string; label: string; bucket: 'surge' | 'drop'; n: number; upRate: number; baseRate: number; verdict: string; intra?: { verdict: string } }
interface Edge { target: string; rows: EdgeRow[]; latest: { factor: string; date: string; bucket: string }[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, { signal: AbortSignal.timeout(20000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

const mget = (b: Brief | null, key: string) => b?.macro.find((m) => m.key === key) || null;
const arrow = (ch: number | null) => (ch == null ? '·' : ch > 0 ? '▲' : ch < 0 ? '▼' : '─');

/** 【한눈에】 한 줄 — 이모지 + 이름 + 방향 + 핵심 숫자 */
function snapLine(emoji: string, name: string, state: string, nums: string): string {
  return `${emoji} <b>${name}</b>  ${state}  ${nums}`;
}

/** 어젯밤 요인이 급변 + 과거 '유의'였던 경우만 한 줄(가장 강한 1건) */
function edgeLine(e: Edge | null): string | null {
  if (!e?.rows?.length) return null;
  for (const r of e.rows) {
    if (r.verdict !== 'significant') continue;
    if (!e.latest.find((x) => x.factor === r.factor && x.bucket === r.bucket)) continue;
    const gap = r.intra && r.intra.verdict !== 'significant' ? '*' : '';
    return `📊 어젯밤 ${esc(r.label)} ${r.bucket === 'surge' ? '급등' : '급락'} → 다음날 ${esc(e.target)} 상승 <b>${Math.round(r.upRate)}%</b>(평소 ${Math.round(r.baseRate)}%)${gap}`;
  }
  return null;
}

function topNews(b: Brief): string | null {
  const n = b.news[0];
  if (!n) return null;
  return `📰 <a href="${esc(n.link)}">${esc(n.title)}</a> <i>${esc(n.source)}</i>`;
}

/** 증시별 압축 섹션: 한 줄 요약 + (코인 수급/과거통계) + 뉴스 1건 (+ 일정) */
function section(emoji: string, name: string, b: Brief | null, e: Edge | null, extra?: string | null): string {
  const L = [`${emoji} <b>${name}</b>`];
  if (!b) { L.push('<i>불러오지 못했습니다</i>'); return L.join('\n'); }
  if (b.ai.headline) L.push(esc(b.ai.headline));
  else L.push(`<i>AI 요약 생성 실패${b.ai.error ? ` (${esc(b.ai.error)})` : ''}</i>`);
  if (extra) L.push(extra);
  const el = edgeLine(e); if (el) L.push(el);
  const nw = topNews(b); if (nw) L.push(nw);
  const ev = b.events.find((x) => x.importance === 'high') || b.events[0];
  if (ev) L.push(`🗓 ${esc(ev.date.slice(5))} ${esc(ev.title)}`);
  return L.join('\n');
}

const DRY = !!process.env.BRIEF_TG_DRY;

async function main() {
  if (!DRY && (!TG_TOKEN || !TG_CHAT)) { console.log('telegram: 토큰/채팅 미설정 — 발송 생략'); return; }
  const [coin, kr, us, coinE, krE, usE] = await Promise.all([
    getJson<Brief>('/api/brief?market=coin'), getJson<Brief>('/api/brief?market=kr'), getJson<Brief>('/api/brief?market=us'),
    getJson<Edge>('/api/brief/edge?market=coin'), getJson<Edge>('/api/brief/edge?market=kr'), getJson<Edge>('/api/brief/edge?market=us'),
  ]);

  const kst = new Date(Date.now() + 9 * 3600_000);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];
  const head = `📰 <b>모닝 브리핑</b> · ${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${dow}) ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;

  // ── 【한눈에】 ──
  const snap: string[] = ['<b>【한눈에】</b>'];
  // 코인: BTC 방향(24h, ±1%)
  const btc = mget(coin, 'btc');
  if (btc) {
    const c = btc.change;
    const [a, w] = c == null ? ['·', ''] : c >= 1 ? ['▲', '강세'] : c <= -1 ? ['▼', '약세'] : ['─', '보합'];
    snap.push(snapLine('🪙', '코인', `${a} ${w}`, `BTC ${esc(btc.value)} (${esc(btc.changeText.replace(' 24h', ''))})`));
  }
  // 국내: 개장 전 — 코스피(전일 종가) + 환율(거의 실시간)
  const kospi = mget(kr, 'kospi'), fx = mget(kr, 'usdkrw');
  if (kospi || fx) {
    const parts = [kospi ? `코스피 ${esc(kospi.value)}` : '', fx ? `환율 ${esc(fx.value)}(${esc(fx.changeText)})` : ''].filter(Boolean).join(' · ');
    snap.push(snapLine('🇰🇷', '국내', '개장 전', parts));
  }
  // 해외: 간밤 마감 — S&P·나스닥 등락
  const sp = mget(us, 'sp500'), nq = mget(us, 'nasdaq');
  if (sp || nq) {
    const w = sp?.change == null ? '마감' : sp.change > 0 ? '상승마감' : sp.change < 0 ? '하락마감' : '보합마감';
    const parts = [sp ? `S&amp;P ${esc(sp.changeText)}` : '', nq ? `나스닥 ${esc(nq.changeText)}` : ''].filter(Boolean).join(' · ');
    snap.push(snapLine('🇺🇸', '해외', `${arrow(sp?.change ?? null)} ${w}`, parts));
  }
  // 공통 거시 — 한 줄(코인 응답에서 추출). 美10Y·유가·달러·VIX
  const g = (k: string, lab: string) => { const m = mget(coin, k); return m ? `${lab} ${esc(m.value)}` : null; };
  const macroBits = [g('us10y', '美10Y'), g('wti', '유가'), g('dxy', '달러'), g('vix', 'VIX')].filter(Boolean);
  if (macroBits.length) snap.push(`🌐 <b>거시</b>  ${macroBits.join(' · ')}`);

  // ── 코인 수급 한 줄(코인 고유 지표만) ──
  const etf = mget(coin, 'etf'), fng = mget(coin, 'fng'), fund = mget(coin, 'funding');
  const flow = [etf ? `ETF ${esc(etf.value)}` : '', fng ? `공포탐욕 ${esc(fng.value)}` : '', fund ? `펀딩 ${esc(fund.changeText)}` : ''].filter(Boolean).join(' · ');

  const sections = [
    section('🪙', '코인', coin, coinE, flow ? `💰 ${flow}` : null),
    section('🇰🇷', '국내증시', kr, krE),
    section('🇺🇸', '해외증시', us, usE),
  ];

  const gapNote = [coinE, krE, usE].some((e) => edgeLine(e)?.includes('*')) ? '* 장중(시가→종가)은 우연 범위 — 시가 갭에 이미 반영\n' : '';
  const foot = `${gapNote}📊 과거 통계는 다음날 보장 아님 · <b>맥락 참고용, 매매 신호 아님</b>\n🔗 ${BASE}/brief`;

  const text = [head, snap.join('\n'), ...sections, foot].join('\n\n');

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
