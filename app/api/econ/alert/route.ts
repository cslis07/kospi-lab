import { NextRequest, NextResponse } from 'next/server';
import { TRACKED, computeHeadline, formatAlert, isFresh, sendTelegram, type Obs, type EconCfg, type Headline } from '@/lib/econAlert';

// 경제지표 발표 알림 — Vercel 크론(평일 07:00 KST)이 호출. FRED last_updated 가 최근이면 '방금 발표'로 보고
// 'kospi lab' 그룹에 결과를 보낸다. 상태 저장 없음(1일 1회 + window 로 중복 방지).
export const maxDuration = 60;
export const preferredRegion = 'icn1';
export const dynamic = 'force-dynamic';

const BASE = process.env.BRIEF_BASE || 'https://kospi-lab.vercel.app';

async function fredMeta(id: string, key: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.stlouisfed.org/fred/series?series_id=${id}&api_key=${key}&file_type=json`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { seriess?: { last_updated?: string }[] };
    return j.seriess?.[0]?.last_updated ?? null;
  } catch { return null; }
}
async function fredObs(id: string, key: string, limit = 16): Promise<Obs[]> {
  try {
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { observations?: { date: string; value: string }[] };
    return (j.observations ?? [])
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((o) => Number.isFinite(o.value))
      .reverse(); // 오름차순
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET 미설정 — Vercel 환경변수에 추가 후 사용' }, { status: 503 });
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const key = process.env.FRED_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'FRED_API_KEY 미설정' }, { status: 503 });

  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const all = req.nextUrl.searchParams.get('all') === '1';        // 테스트: window 무시하고 전부
  const windowH = Number(req.nextUrl.searchParams.get('hours')) || 26;

  const hits: { cfg: EconCfg; h: Headline }[] = [];
  const diag: Record<string, string> = {};
  await Promise.all(TRACKED.map(async (cfg) => {
    const meta = await fredMeta(cfg.fred, key);
    const fresh = all || (meta ? isFresh(meta, windowH) : false);
    diag[cfg.id] = `${meta ?? 'no-meta'}${fresh ? ' ✔' : ''}`;
    if (!fresh) return;
    const obs = await fredObs(cfg.fred, key);
    const h = computeHeadline(obs, cfg);
    if (h) hits.push({ cfg, h });
  }));

  if (hits.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, windowHours: windowH, checked: TRACKED.length, diag });
  }

  // 발표일(refDate) 순 정렬 유지 — 표시 순서는 TRACKED 순서
  hits.sort((a, b) => TRACKED.findIndex((t) => t.id === a.cfg.id) - TRACKED.findIndex((t) => t.id === b.cfg.id));
  const text = formatAlert(hits, BASE);
  const res = await sendTelegram(
    text,
    process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN,
    process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID,
    dry,
  );
  const code = res.skipped ? 500 : res.ok || dry ? 200 : 502;
  return NextResponse.json({ ...res, sent: dry ? 0 : hits.length, indicators: hits.map((x) => x.cfg.id), dryText: dry ? res.dryText : undefined, diag }, { status: code });
}
