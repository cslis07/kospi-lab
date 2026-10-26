import { redirect } from 'next/navigation';

/**
 * 예전 '전체 메뉴' 페이지 — 2026-10-26 메뉴 1단계 정리로 /tools(더보기)와 합쳤다.
 * 메뉴 검색·자주 쓰는·전체 메뉴는 앱바 ☰ 시트, 보조 도구·설정은 /tools. 옛 링크 보호용으로 주소만 남긴다.
 */
export default function MorePage() {
  redirect('/tools');
}
