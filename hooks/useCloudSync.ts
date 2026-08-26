'use client';

/**
 * 클라우드 동기화 오케스트레이션.
 *
 * 왜 폴링인가: 기존 훅 11개는 마운트 때 localStorage 를 한 번 읽고 자체 state 로 산다.
 * 훅을 고치지 않고 변경을 알아채려면 바깥에서 스냅샷 해시를 주기적으로 비교하는 수밖에 없다.
 * (훅 11개에 이벤트를 심는 쪽이 '깨끗'해 보이지만, 저널·포트폴리오처럼 돈이 걸린 저장 경로를
 *  건드리는 위험을 부가 기능 하나 때문에 지는 건 맞바꿈이 나쁘다.)
 *
 * 내려받은 뒤 새로고침하는 이유: 훅들이 이미 들고 있는 state 는 localStorage 를 다시 안 읽는다.
 * 첫 동기화에서 실제로 바뀐 게 있을 때만 1회 새로고침한다(세션 플래그로 루프 차단).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyRemote, detectLocalChanges, findFirstSyncConflicts, labelFor, readMeta, writeMeta, type SyncItem } from '@/lib/cloudSync';

const PUSH_DEBOUNCE = 2500;
const WATCH_INTERVAL = 4000;
const PULL_INTERVAL = 90_000;
const RELOAD_FLAG = 'kl-sync-reloaded';
const DEVICE_KEY = 'kospi-lab-device-id';

export type SyncStatus = 'init' | 'off' | 'locked' | 'syncing' | 'synced' | 'error' | 'conflict';

function deviceId(): string {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) {
      const ua = navigator.userAgent;
      const kind = /Android|iPhone|iPad|Mobile/i.test(ua) ? '모바일' : 'PC';
      d = `${kind}-${Math.random().toString(36).slice(2, 6)}`;
      localStorage.setItem(DEVICE_KEY, d);
    }
    return d;
  } catch { return 'unknown'; }
}

export interface CloudSyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  pushed: string[];        // 마지막으로 올린 항목 라벨
  pulled: string[];        // 마지막으로 내려받은 항목 라벨
  error: string | null;
  device: string;
  /** 첫 동기화 충돌 항목(사람이 읽는 라벨) — 해결 전까지 자동 동기화가 멈춘다 */
  conflicts: string[];
  syncNow: () => void;
  /** 충돌 해결: 이 기기 것을 정본으로 삼아 서버를 덮어쓴다 */
  resolveKeepLocal: () => void;
  /** 충돌 해결: 서버 것을 정본으로 삼아 이 기기를 덮어쓴다 */
  resolveKeepRemote: () => void;
}

export function useCloudSync(): CloudSyncState {
  const [status, setStatus] = useState<SyncStatus>('init');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pushed, setPushed] = useState<string[]>([]);
  const [pulled, setPulled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState('');
  const [conflicts, setConflicts] = useState<string[]>([]);
  // 충돌 해결 방향이 정해지기 전까지 자동 동기화를 멈춘다
  const blocked = useRef(false);
  const forceRef = useRef<'local' | 'remote' | null>(null);

  const busy = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  const sync = useCallback(async () => {
    if (busy.current) return;
    if (blocked.current && !forceRef.current) return;   // 충돌 대기 중에는 아무것도 밀지 않는다
    busy.current = true;
    setStatus((s) => (s === 'off' ? s : 'syncing'));
    try {
      const force = forceRef.current;
      forceRef.current = null;

      // 첫 동기화(이 기기에 동기화 이력 없음)에서는 먼저 서버를 읽어 충돌부터 확인한다.
      // 확인 없이 올리면 나중에 연 기기가 먼저 기기의 기록을 조용히 덮어쓴다.
      if (!force) {
        const meta0 = readMeta();
        if (Object.keys(meta0).length === 0) {
          const peek = await fetch('/api/sync');
          if (peek.status === 401) { setStatus('locked'); return; }
          const pj = (await peek.json()) as { configured?: boolean; items?: SyncItem[] };
          if (pj.configured === false) { setStatus('off'); return; }
          const cf = findFirstSyncConflicts(pj.items ?? [], meta0);
          if (cf.length) {
            setConflicts(cf.map(labelFor));
            blocked.current = true;
            setStatus('conflict');
            return;
          }
        }
      }

      const { items, meta, changed } = detectLocalChanges();
      writeMeta(meta);

      // 충돌을 '이 기기 우선'으로 해결하는 경우: 로컬 항목에 최신 시각을 찍어 서버를 이기게 한다
      if (force === 'local') {
        const now = Date.now();
        for (const it of items) { it.updatedAt = now; meta[it.id] = { ...(meta[it.id] ?? { hash: '' }), updatedAt: now }; }
        writeMeta(meta);
      }

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, device: deviceId() }),
      });

      if (res.status === 401) { setStatus('locked'); return; }
      const j = (await res.json()) as { configured?: boolean; items?: SyncItem[]; error?: string };
      if (j.configured === false) { setStatus('off'); return; }
      if (!res.ok) { setStatus('error'); setError(j.error ?? `HTTP ${res.status}`); return; }

      const meta2 = readMeta();
      const { applied, meta: meta3 } = applyRemote(j.items ?? [], meta2);
      writeMeta(meta3);

      setPushed(changed.map(labelFor));
      setPulled(applied.map(labelFor));
      setLastSyncAt(Date.now());
      setError(null);
      setConflicts([]);
      blocked.current = false;
      setStatus('synced');

      // 내려받은 변경이 있으면 화면이 낡았다 — 첫 동기화에서 1회만 새로고침
      if (applied.length && firstRun.current) {
        try {
          if (!sessionStorage.getItem(RELOAD_FLAG)) {
            sessionStorage.setItem(RELOAD_FLAG, '1');
            location.reload();
          }
        } catch {}
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      firstRun.current = false;
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    setDevice(deviceId());
    void sync();

    // 로컬 변경 감지 → 디바운스 push
    const watch = setInterval(() => {
      const { changed, meta } = detectLocalChanges();
      if (!changed.length) return;
      writeMeta(meta);
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void sync(), PUSH_DEBOUNCE);
    }, WATCH_INTERVAL);

    // 주기 pull — 다른 기기에서 바뀐 것을 받아온다
    const pull = setInterval(() => void sync(), PULL_INTERVAL);
    // 탭으로 돌아왔을 때도 한 번
    const onVis = () => { if (document.visibilityState === 'visible') void sync(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(watch); clearInterval(pull);
      document.removeEventListener('visibilitychange', onVis);
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [sync]);

  return {
    status, lastSyncAt, pushed, pulled, error, device, conflicts,
    syncNow: () => void sync(),
    resolveKeepLocal: () => { forceRef.current = 'local'; blocked.current = false; void sync(); },
    resolveKeepRemote: () => {
      // 서버 우선: 로컬 메타를 비워 두면 applyRemote 가 서버 값을 전부 내려받아 덮어쓴다
      writeMeta({});
      forceRef.current = 'remote'; blocked.current = false; void sync();
    },
  };
}
