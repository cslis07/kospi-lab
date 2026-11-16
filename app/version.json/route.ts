import { NextResponse } from 'next/server';
import { BUILD_VERSION } from '@/lib/appVersion';

/**
 * 지금 배포의 버전 — 빌드 때 한 번 만들어지는 정적 파일(함수 실행 없음, CDN 이 배포마다 새로 내준다).
 * 열어 둔 옛 화면이 이 값과 자기 버전을 비교해 새 배포를 알아챈다(components/VersionWatcher).
 */
export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({ v: BUILD_VERSION });
}
