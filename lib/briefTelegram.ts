/**
 * 모닝 브리핑 텔레그램 메시지 빌드·발송 — 공용(Vercel 크론 라우트 /api/brief/telegram + GitHub 스크립트 공용).
 *
 * 배포된 공개 API(/api/brief·/api/brief/edge)에서 3개 증시 요약·지표·뉴스를 받아 "kospi lab" 그룹으로 보낸다.
 * 앱 서버 코드는 import 하지 않는다(fetch 만 사용) — tsx 스크립트에서도 그대로 돌아가게.
 *
 * 포맷(2026-10-06 사용자 2차 피드백): ① 📊 시장지표(공통 거시) 맨 위 ② 증시별 = 한 줄 핵심 + 영향 뉴스 + 과거통계.
 *   같은 숫자 중복 금지. 과거 통계는 급변+유의일 때만 1줄. 매매 신호 아님.
 */

export type Market = 'coin' | 'kr' | 'us';
interface MacroNum { key: string; label: string; value: string; change: number | null; changeText: string; group?: string; live?: boolean }
interface News { title: string; link: string; source: string; tag: string | null }
interface Brief { market: Market; ai: { headline: string; bullets: string[]; error?: string }; macro: MacroNum[]; news: News[]; war: News[]; events: { date: string; title: string; importance: string }[] }
interface EdgeRow { factor: string; label: string; bucket: 'surge' | 'drop'; n: number; upRate: number; baseRate: number; verdict: string; intra?: { verdict: string } }
interface Edge { target: string; rows: EdgeRow[]; latest: { factor: string; date: string; bucket: string }[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function getJson<T>(base: string, path: string): Promise<T | null> {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** 급변+과거 '유의'였던 경우만 1줄(가장 강한 1건) */
function edgeLine(e: Edge | null): string | null {
  if (!e?.rows?.length) return null;
  for (const r of e.rows) {
    if (r.verdict !== 'significant') continue;
    if (!e.latest.find((x) => x.factor === r.factor && x.bucket === r.bucket)) continue;
    const gap = r.intra && r.intra.verdict !== 'significant' ? '*' : '';
    return `📊 어젯밤 ${esc(r.label)} ${r.bucket === 'surge' ? '급등' : '급락'} → 과거 다음날 ${esc(e.target)} 상승 <b>${Math.round(r.upRate)}%</b>(평소 ${Math.round(r.baseRate)}%)${gap}`;
  }
  return null;
}

const TAG_ICON: Record<string, string> = { war: '⚠️', oil: '🛢', rate: '💵' };
const TOPIC_STOP = new Set('속보 단독 종합 마켓뷰 투자 투자360 사상 최고 최고가 신고가 경신 전망 코스피 코스닥 나스닥 다우 다우존스 증시 시장 오늘 내년 올해 관련 분석 목표가 유력 이틀째 사흘째 기록 돌파 상승 하락 마감 개장 눈앞 목전 nvidia bitcoin crypto market markets stocks shares record high rally rallies tech news wrap the and for with to of in on as at'.split(' '));
const topicTokens = (t: string) => new Set(t.replace(/[^가-힣a-z0-9]/gi, ' ').toLowerCase().split(/\s+/).filter((w) => w.length >= 2 && !TOPIC_STOP.has(w)));
function sameTopic(a: Set<string>, b: Set<string>): boolean {
  let sh = 0; for (const w of b) if (a.has(w)) sh++;
  return sh >= 2; // 핵심어(종목·사건) 2개 이상 겹치면 같은 사건
}
function newsLines(b: Brief, n: number): string[] {
  const out: string[] = [];
  const picked: Set<string>[] = [];
  for (const it of b.news) {
    if (out.length >= n) break;
    const tok = topicTokens(it.title);
    if (picked.some((p) => sameTopic(p, tok))) continue; // 같은 사건 중복 제거
    picked.push(tok);
    const ic = it.tag && TAG_ICON[it.tag] ? TAG_ICON[it.tag] : '·';
    out.push(`${ic} <a href="${esc(it.link)}">${esc(it.title)}</a>`);
  }
  return out;
}

/** 증시별 섹션: 헤더(이름·대표가) + 한 줄 핵심 + (추가줄) + 뉴스 + 과거통계 + 일정 */
function section(emoji: string, name: string, headerRight: string, b: Brief | null, e: Edge | null, nNews: number, extra?: string | null): string {
  const L = [`${emoji} <b>${name}</b>${headerRight ? `  ·  ${headerRight}` : ''}`];
  if (!b) { L.push('<i>불러오지 못했습니다</i>'); return L.join('\n'); }
  if (b.ai.headline) L.push(esc(b.ai.headline));
  else if (b.ai.error) L.push(`<i>요약 실패 (${esc(b.ai.error)})</i>`);
  if (extra) L.push(extra);
  L.push(...newsLines(b, nNews));
  const el = edgeLine(e); if (el) L.push(el);
  const ev = b.events.find((x) => x.importance === 'high') || b.events[0];
  if (ev) L.push(`🗓 ${esc(ev.date.slice(5))} ${esc(ev.title)}`);
  return L.join('\n');
}

/** 3개 증시 브리핑·과거통계를 받아 텔레그램 HTML 메시지를 만든다. */
export async function buildBriefMessage(base: string): Promise<string> {
  const [coin, kr, us, coinE, krE, usE] = await Promise.all([
    getJson<Brief>(base, '/api/brief?market=coin'), getJson<Brief>(base, '/api/brief?market=kr'), getJson<Brief>(base, '/api/brief?market=us'),
    getJson<Edge>(base, '/api/brief/edge?market=coin'), getJson<Edge>(base, '/api/brief/edge?market=kr'), getJson<Edge>(base, '/api/brief/edge?market=us'),
  ]);
  const all = [coin, kr, us].filter(Boolean) as Brief[];
  const mget = (key: string) => { for (const b of all) { const m = b.macro.find((x) => x.key === key); if (m) return m; } return null; };
  const fmtCh = (m: MacroNum | null) => (m == null || m.change == null ? '' : Math.abs(m.change) < 0.005 ? '(보합)' : `(${esc(m.changeText)})`);

  const kst = new Date(Date.now() + 9 * 3600_000);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];
  const head = `📰 <b>모닝 브리핑</b> · ${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${dow}) ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;

  const wti = mget('wti'), y10 = mget('us10y'), y2 = mget('us2y'), dxy = mget('dxy'), fx = mget('usdkrw'), vix = mget('vix');
  const ind = ['📊 <b>시장지표</b>'];
  if (wti) ind.push(`🛢 WTI 유가  <b>${esc(wti.value)}</b> ${fmtCh(wti)}`);
  if (y10 || y2) ind.push(`💵 美 국채금리  ${[y10 && `10Y <b>${esc(y10.value)}</b>${fmtCh(y10)}`, y2 && `2Y ${esc(y2.value)}${fmtCh(y2)}`].filter(Boolean).join(' · ')}`);
  if (dxy || fx) ind.push(`💱 달러  ${[dxy && `달러인덱스 <b>${esc(dxy.value)}</b>${fmtCh(dxy)}`, fx && `원/달러 <b>${esc(fx.value)}</b>${fmtCh(fx)}`].filter(Boolean).join(' · ')}`);
  if (vix) ind.push(`😨 VIX  <b>${esc(vix.value)}</b> ${fmtCh(vix)}`);

  const btc = mget('btc');
  const coinHdr = btc ? `BTC ${esc(btc.value)} ${esc(btc.changeText.replace(' 24h', ''))}` : '';
  const kospi = coin && kr ? kr.macro.find((x) => x.key === 'kospi') : null;
  const krHdr = kospi ? `코스피 ${esc(kospi.value)} · 개장 전` : '개장 전';
  const sp = us?.macro.find((x) => x.key === 'sp500'), nq = us?.macro.find((x) => x.key === 'nasdaq');
  const usHdr = [sp && `S&amp;P ${esc(sp.changeText)}`, nq && `나스닥 ${esc(nq.changeText)}`].filter(Boolean).join(' · ') + (sp || nq ? ' · 마감' : '');

  const etf = mget('etf'), fng = mget('fng'), fund = mget('funding');
  const flow = [etf && `ETF ${esc(etf.value)}`, fng && `공포탐욕 ${esc(fng.value)}`, fund && `펀딩 ${esc(fund.changeText)}`].filter(Boolean).join(' · ');

  const sections = [
    section('🪙', '코인', coinHdr, coin, coinE, 5, flow ? `💰 ${flow}` : null),
    section('🇰🇷', '국내증시', krHdr, kr, krE, 5),
    section('🇺🇸', '해외증시', usHdr, us, usE, 5),
  ];

  const gapNote = [coinE, krE, usE].some((e) => edgeLine(e)?.includes('*')) ? '* 장중(시가→종가)은 우연 범위 — 시가 갭에 이미 반영\n' : '';
  const foot = `${gapNote}📊 과거 통계는 다음날 보장 아님 · <b>맥락 참고용, 매매 신호 아님</b>\n🔗 ${base}/brief`;

  return [head, ind.join('\n'), ...sections, foot].join('\n\n');
}

export interface SendResult { status: number; ok: boolean; len: number; skipped?: string; dryText?: string }

/** 메시지를 만들어 텔레그램으로 보낸다(dry 면 텍스트만 반환). 토큰/채팅 미설정이면 skipped. */
export async function sendBriefTelegram(opts: { base: string; token?: string; chat?: string; dry?: boolean }): Promise<SendResult> {
  const text = await buildBriefMessage(opts.base);
  if (opts.dry) return { status: 0, ok: true, len: text.length, dryText: text };
  if (!opts.token || !opts.chat) return { status: 0, ok: false, len: text.length, skipped: '토큰/채팅 미설정' };
  const r = await fetch(`https://api.telegram.org/bot${opts.token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: opts.chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!(body as { ok?: boolean }).ok, len: text.length };
}
