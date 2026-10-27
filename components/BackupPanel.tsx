'use client';

/**
 * 데이터 백업·복원 — 이 브라우저의 `kospi-lab-` 저장 항목 전체(매매일지 태그·포트폴리오·관심종목·알림 등)를 JSON 으로.
 * 예전엔 가상 계좌(/virtual) 화면 안에 있었다 → 2026-10-27 메뉴 정리로 가상 계좌를 없애며 더보기 '설정 · 정보'(/tools#backup)로 옮김.
 * 파일 형식(v2·v1 하위호환)은 그대로 — 예전에 받은 백업 파일도 복원된다.
 */
import { useRef, useState } from 'react';

/** 모든 앱 데이터의 공통 접두사 — 새 훅이 생겨도 백업에서 자동으로 누락되지 않도록 접두사로 훑는다. */
const LS_PREFIX = 'kospi-lab-';
/** v1 백업 파일(관심종목·가상투자·코인관심 3개만 담음) 하위호환 키 */
const V1_KEYS = { watchlist: 'kospi-lab-watchlist', virtual: 'kospi-lab-virtual', cryptoWatchlist: 'kospi-lab-crypto-watchlist' };

function collectAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) {
      const val = localStorage.getItem(k);
      if (val !== null) out[k] = val;
    }
  }
  return out;
}

function exportData() {
  const keys = collectAll();
  const payload = { version: 2, exportedAt: new Date().toISOString(), keys, keyCount: Object.keys(keys).length };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kospi-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.version) throw new Error('올바른 백업 파일이 아닙니다');
        if (data.version >= 2 && data.keys && typeof data.keys === 'object') {
          for (const [k, v] of Object.entries(data.keys as Record<string, string>)) {
            if (k.startsWith(LS_PREFIX) && typeof v === 'string') localStorage.setItem(k, v);
          }
        } else {
          if (data.watchlist) localStorage.setItem(V1_KEYS.watchlist, JSON.stringify(data.watchlist));
          if (data.virtual) localStorage.setItem(V1_KEYS.virtual, JSON.stringify(data.virtual));
          if (data.cryptoWatchlist) localStorage.setItem(V1_KEYS.cryptoWatchlist, JSON.stringify(data.cryptoWatchlist));
        }
        resolve(data.exportedAt ?? '');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
    reader.readAsText(file);
  });
}

export default function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const show = (type: 'ok' | 'err', text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!confirm('현재 데이터를 백업 파일로 덮어씁니다. 계속할까요?')) return;
    try {
      const at = await importData(file);
      show('ok', `복원 완료${at ? ` (백업일: ${at.slice(0, 10)})` : ''} — 페이지를 새로고침합니다`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      show('err', String(err));
    }
  };

  return (
    <div id="backup" className="list-row !block scroll-mt-20">
      <p className="text-sm font-semibold">데이터 백업 · 복원</p>
      <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
        이 브라우저에 저장된 <b className="text-[var(--text)]">KOSPI LAB 데이터 전체</b>(매매일지 태그·포트폴리오·관심종목·알림)를 JSON 파일로 저장하거나 복원합니다.
        사이트 데이터를 지우면 복구 경로가 없으니 정기적으로 내보내 두세요.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={() => { exportData(); show('ok', '백업 파일이 다운로드됐습니다'); }}
          className="px-3.5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-sm font-medium">
          백업 내보내기 (.json)
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
          백업 가져오기
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImport} />
      </div>
      {msg && (
        <p role="status" className={`mt-2 text-[13px] ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.type === 'ok' ? '✅' : '❌'} {msg.text}
        </p>
      )}
    </div>
  );
}
