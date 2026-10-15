/**
 * Nowflation 공개 데이터(CC BY 4.0) 중계 — 순수 로직.
 * nowprice-local `server.py` 의 nf_allowed / url 매핑을 포팅한다.
 * 실측(2026-10-15): nowflation.com 데이터 엔드포인트는 Vercel icn1 서버 IP 에서
 * 차단 없이 fetch 됨(인베스팅과 달리 Cloudflare 봇차단 없음). seed/nf/ 는 보조 폴백.
 */
export const NF_BASE = 'https://nowflation.com';

/**
 * `data/*.json` 과 `forecasts/` · `geo/` · `og/` 하위만 허용(경로 조작 방지).
 * 규칙: 슬래시 최대 1개 · `..` 금지 · `.json` 확장자 · 파일명은 영숫자/`_`/`-`/`.` 만.
 */
export function nfAllowed(name: string): boolean {
  if ((name.split('/').length - 1) > 1) return false; // 슬래시 최대 1개
  if (name.includes('..')) return false;
  if (!name.endsWith('.json')) return false;
  const base = name.split('/').pop()!.slice(0, -'.json'.length);
  const okBase = base.length > 0 && /^[A-Za-z0-9_.-]+$/.test(base);
  const prefixed = name.startsWith('forecasts/') || name.startsWith('geo/') || name.startsWith('og/');
  return okBase && (prefixed || !name.includes('/'));
}

/** 중계 대상 원본 URL — 접두 경로가 있으면 그대로, 없으면 `/data/` 아래로. */
export function nfUpstreamUrl(name: string): string {
  return name.includes('/') ? `${NF_BASE}/${name}` : `${NF_BASE}/data/${name}`;
}
