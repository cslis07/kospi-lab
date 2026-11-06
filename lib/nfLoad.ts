/**
 * Nowflation 중계 공통 로더(서버 전용) — /api/nf/[...name] 과 /api/nf/bundle 가 같이 쓴다.
 * 상류 fetch 성공 → 원문(Next Data Cache 6h, refresh 면 무캐시) / 실패·깨진 응답 → seed/nf/ 스냅샷 / 둘 다 없으면 null.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nfUpstreamUrl } from './nf';

const TTL = 6 * 60 * 60; // 6시간
const SEED_DIR = path.join(process.cwd(), 'seed', 'nf');

async function readSeed(name: string): Promise<string | null> {
  try {
    const p = path.join(SEED_DIR, ...name.split('/'));
    if (!path.resolve(p).startsWith(path.resolve(SEED_DIR) + path.sep)) return null; // 경로 탈출 이중 방지
    return await fs.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

/** name 은 호출부에서 nfAllowed 로 검사한 값이어야 한다 */
export async function loadNf(name: string, refresh = false): Promise<string | null> {
  try {
    const res = await fetch(nfUpstreamUrl(name), {
      headers: { 'User-Agent': 'kospi-lab/1.0 (+https://kospi-lab.vercel.app)', Accept: 'application/json' },
      // 상류가 느리면 함수 한도(15초)에 걸려 seed 폴백까지 못 갔다 → 5초에 끊고 폴백
      signal: AbortSignal.timeout(5000),
      ...(refresh ? { cache: 'no-store' as const } : { next: { revalidate: TTL } }),
    });
    if (res.ok) {
      const text = await res.text();
      JSON.parse(text); // 깨진 응답(HTML 차단 페이지 등)은 폴백으로
      return text;
    }
  } catch {
    /* 폴백으로 */
  }
  return readSeed(name);
}
