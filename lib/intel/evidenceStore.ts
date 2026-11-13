/**
 * 엔진 사전 기록 저장소 — localStorage 'kospi-lab-engine-log'(클라우드 동기화 대상 키 접두어라 기기 간에 같이 간다).
 * 브라우저 전용. 저장 실패(사생활 보호 모드·용량)는 조용히 넘어간다 — 화면 동작에 영향 없음.
 */
import { LOG_KEY, appendEntry, parseLog, shouldRecord, type EngineLogEntry } from './evidenceLog';

export const LOG_EVENT = 'kospi-lab-engine-log-changed';

export function loadLog(): EngineLogEntry[] {
  try { return parseLog(JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]')); } catch { return []; }
}

/** 기록 규칙에 맞으면 덧붙이고 true */
export function recordIfDue(e: EngineLogEntry): boolean {
  try {
    const log = loadLog();
    if (!shouldRecord(log, e)) return false;
    localStorage.setItem(LOG_KEY, JSON.stringify(appendEntry(log, e)));
    window.dispatchEvent(new Event(LOG_EVENT));
    return true;
  } catch { return false; }
}
