'use client';

/**
 * 후보 종목 — 성장주 발굴에서 ☆ 로 담아두는 관심 목록.
 *
 * 스캔 결과는 페이지를 나가면 사라진다. 발굴(넓게) → 후보(좁게) → 정밀 분석 의
 * 가운데 단계를 이 훅이 맡는다. 등록 시점의 성장 점수를 스냅샷으로 함께 저장해
 * "언제 어떤 근거로 담았는지"가 남게 한다.
 *
 * 저장 형식은 {v, data} 로 감싼다 — 기존 훅들이 배열을 날것으로 저장해
 * 스키마가 바뀌면 조용히 깨지던 문제(완성도 점검 1차 지적)를 반복하지 않기 위해서다.
 * 키 접두사 kospi-lab- 이라 /virtual 백업(v2)에 자동으로 포함된다.
 */

import { useState, useEffect, useCallback } from 'react';

const KEY = 'kospi-lab-candidates';
const SCHEMA = 1;
const MAX = 60;

export interface Candidate {
  code: string;                 // 국내 6자리 또는 미국 티커
  name: string;
  market: 'KR' | 'US';
  sector?: string;
  themes?: string[];
  /* 등록 시점 스냅샷 — 나중에 다시 스캔하면 점수가 바뀌므로 근거를 박제한다 */
  growthScore: number;
  badges: string[];
  buffettPass: number;
  buffettTotal: number;
  peg: number | null;
  comment: string;
  addedAt: number;
  memo?: string;
}

interface Stored { v: number; data: Candidate[] }

function load(): Candidate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // v1 이전(배열 날것) 하위호환
    if (Array.isArray(parsed)) return parsed.filter(isCandidate);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Stored).data)) {
      return (parsed as Stored).data.filter(isCandidate);
    }
    return [];
  } catch {
    // 파싱 불가 — 원본을 보존해 두고 빈 상태로 시작한다(조용히 날리지 않는다)
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}-corrupt-${Date.now()}`, raw);
    } catch { /* 저장 실패는 무시 */ }
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isCandidate(x: any): x is Candidate {
  return x && typeof x.code === 'string' && typeof x.name === 'string';
}

export function useCandidates() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ready, setReady] = useState(false);
  /** 저장 실패(용량 초과·시크릿 모드) 시 사용자에게 알릴 메시지 */
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { setCandidates(load()); setReady(true); }, []);

  const persist = useCallback((next: Candidate[]) => {
    setCandidates(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA, data: next } satisfies Stored));
      setSaveError(null);
    } catch {
      setSaveError('브라우저에 저장하지 못했습니다 — 저장 공간 부족이거나 시크릿 모드일 수 있습니다.');
    }
  }, []);

  const add = useCallback((c: Omit<Candidate, 'addedAt'>) => {
    setCandidates((prev) => {
      // 같은 종목을 다시 담으면 최신 점수로 갱신(중복 생성 금지)
      const next = [{ ...c, addedAt: Date.now() }, ...prev.filter((x) => x.code !== c.code)].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA, data: next } satisfies Stored));
        setSaveError(null);
      } catch {
        setSaveError('브라우저에 저장하지 못했습니다 — 저장 공간 부족이거나 시크릿 모드일 수 있습니다.');
      }
      return next;
    });
  }, []);

  const remove = useCallback((code: string) => {
    setCandidates((prev) => {
      const next = prev.filter((x) => x.code !== code);
      try { localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA, data: next } satisfies Stored)); } catch {}
      return next;
    });
  }, []);

  const setMemo = useCallback((code: string, memo: string) => {
    setCandidates((prev) => {
      const next = prev.map((x) => (x.code === code ? { ...x, memo } : x));
      try { localStorage.setItem(KEY, JSON.stringify({ v: SCHEMA, data: next } satisfies Stored)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), [persist]);
  const has = useCallback((code: string) => candidates.some((x) => x.code === code), [candidates]);

  return { candidates, ready, saveError, add, remove, setMemo, clear, has };
}
