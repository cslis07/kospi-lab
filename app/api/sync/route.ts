/**
 * 클라우드 동기화 — localStorage 자산(매매일지·후보·관심종목·포트폴리오…)의 기기 간 동기화.
 *
 * 저장소: Supabase REST(테이블 `kl_sync`). supabase-js 의존성 없이 fetch 만 쓴다.
 * ⚠ 이 라우트는 middleware 게이트 뒤에 있다(개인 데이터). 서비스 키는 서버에서만 쓴다.
 * ⚠ env 미구성이면 200 + {configured:false} 를 준다 — 클라이언트가 조용히 로컬 전용으로 돌기 위해서다.
 *   (503 으로 만들면 미설정 사용자 화면에 에러가 뜬다. 동기화는 부가 기능이지 필수가 아니다.)
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const URL_ = process.env.SUPABASE_URL ?? '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TABLE = 'kl_sync';
const MAX_ITEMS = 40;
const MAX_BYTES = 2_000_000;   // 2MB — 저널 1000건도 여유롭게 들어간다

const configured = () => Boolean(URL_ && KEY);

function sb(path: string, init: RequestInit = {}) {
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

interface Row { id: string; data: unknown; updated_at: number; device: string | null }
interface Item { id: string; data: unknown; updatedAt: number }

async function readAll(): Promise<Row[]> {
  const r = await sb(`${TABLE}?select=id,data,updated_at,device`);
  if (!r.ok) throw new Error(`supabase read ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as Row[];
}
const toItems = (rows: Row[]): Item[] => rows.map((x) => ({ id: x.id, data: x.data, updatedAt: Number(x.updated_at) }));

export async function GET() {
  if (!configured()) return NextResponse.json({ configured: false, items: [] });
  try {
    return NextResponse.json({ configured: true, items: toItems(await readAll()) });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), items: [] }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!configured()) return NextResponse.json({ configured: false, items: [], applied: 0 });
  let body: { items?: Item[]; device?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const incoming = (body.items ?? []).filter(
    (i) => i && typeof i.id === 'string' && i.id.startsWith('kospi-lab-') && Number.isFinite(i.updatedAt),
  ).slice(0, MAX_ITEMS);
  if (JSON.stringify(incoming).length > MAX_BYTES) {
    return NextResponse.json({ error: '동기화 데이터가 너무 큽니다(2MB 초과)' }, { status: 413 });
  }

  try {
    // 서버가 더 최신인 키는 덮어쓰지 않는다 — 키 단위 Last-Write-Wins
    const current = await readAll();
    const at = new Map(current.map((r) => [r.id, Number(r.updated_at)]));
    const upserts = incoming.filter((i) => i.updatedAt > (at.get(i.id) ?? -1));

    if (upserts.length) {
      const payload = upserts.map((i) => ({
        id: i.id, data: i.data, updated_at: i.updatedAt, device: (body.device ?? '').slice(0, 40) || null,
      }));
      const r = await sb(`${TABLE}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`supabase upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }

    // 병합 후 최종 상태를 돌려준다 → 클라이언트는 이 한 번의 왕복으로 push+pull 을 끝낸다
    return NextResponse.json({ configured: true, applied: upserts.length, items: toItems(await readAll()) });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), items: [], applied: 0 }, { status: 502 });
  }
}
