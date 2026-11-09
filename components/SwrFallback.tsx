'use client';

import { SWRConfig } from 'swr';

/**
 * 서버 컴포넌트가 미리 받은 데이터를 SWR 캐시 초기값으로 넣는다(Next 문서 single-page-applications 'SWR' 절).
 * 아래 화면의 useSWR(같은 키)은 이 값으로 첫 HTML 을 그리고, 화면이 뜬 뒤 평소처럼 새로 받는다.
 * 바깥 SWRConfig(PollingGovernor 의 isPaused 등)는 그대로 합쳐진다.
 */
export default function SwrFallback({ fallback, children }: { fallback: Record<string, unknown>; children: React.ReactNode }) {
  return <SWRConfig value={{ fallback }}>{children}</SWRConfig>;
}
