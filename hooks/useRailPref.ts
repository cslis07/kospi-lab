'use client';

/**
 * 상단 지수 레일 구성(표시·순서) — 홈 레일과 관심종목 화면이 공유하는 단일 리스트.
 * useSyncedList 기반이라 같은 기기 내 여러 화면/탭이 라이브로 동기화된다(관심종목에서 바꾸면 레일도 즉시 반영).
 * 이 기기 한정(cloudSync SYNC_EXCLUDE). 저장 형식 = 순서 있는 표시 코드 배열(기존 kospi-lab-rail 호환).
 */
import { useSyncedList } from './useSyncedList';

export const RAIL_KEY = 'kospi-lab-rail';
export const DEFAULT_RAIL = ['KOSPI', 'KOSDAQ', 'USDKRW', '.INX', '.IXIC', '.DJI'];

export function useRailPref() {
  const { list, mounted, save } = useSyncedList<string>(RAIL_KEY, DEFAULT_RAIL);
  return { pref: list, mounted, save };
}
