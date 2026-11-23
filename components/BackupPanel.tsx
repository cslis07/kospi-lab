'use client';

/**
 * 데이터 백업·복원 — 이 브라우저의 `kospi-lab-` 저장 항목 전체(매매일지 태그·포트폴리오·관심종목·알림 등)를 JSON 으로.
 * 예전엔 가상 계좌(/virtual) 화면 안에 있었다 → 2026-10-27 메뉴 정리로 가상 계좌를 없애며 더보기 '설정 · 정보'(/tools#backup)로 옮김.
 * 파일 형식(v2·v1 하위호환)은 그대로 — 예전에 받은 백업 파일도 복원된다.
 */
import { useRef, useState } from 'react';
import { readMeta, writeMeta } from '@/lib/cloudSync';
import { applyBackup, buildBackupPayload, collectBackup, parseBackup, previewBackup } from '@/lib/backup';

/** 복원한 키의 동기화 기록을 지운다 → 다음 동기화가 '이 기기에서 방금 바뀐 값'으로 보고 서버에 올린다(서버 값이 되돌리지 않게) */
function forgetSyncMeta(keys: string[]) {
  const meta = readMeta();
  for (const k of keys) delete meta[k];
  writeMeta(meta);
}

/** 이 브라우저의 데이터 전체를 파일로 — prefix 는 파일 이름 앞부분(복원 직전 자동 백업은 'before-restore') */
function exportData(prefix = 'backup') {
  const payload = buildBackupPayload(collectBackup(localStorage));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kospi-lab-${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  // 클릭 직후 해제하면 일부 브라우저에서 다운로드가 끊길 수 있어 잠시 뒤 해제
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const show = (type: 'ok' | 'err', text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 6000); };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      // 1) 파일 전체를 먼저 검증(이때까지 아무것도 쓰지 않음)
      const plan = parseBackup(await file.text());
      const pv = previewBackup(plan, localStorage);
      const when = plan.exportedAt ? plan.exportedAt.slice(0, 10) : '날짜 미상';
      // 2) 미리보기 — 무엇이 바뀌는지 보여 주고 확인
      if (!confirm(
        `백업(${when}, v${plan.version})의 ${pv.total}개 항목으로 복원합니다.
` +
        `· 내용이 바뀌는 항목 ${pv.changed}개 · 새로 생기는 항목 ${pv.added}개 · 백업에 없는 현재 항목은 그대로
` +
        `${plan.skipped ? `· 형식이 맞지 않아 건너뛰는 항목 ${plan.skipped}개
` : ''}` +
        `복원 전에 지금 데이터를 'kospi-lab-before-restore-…json'으로 자동 저장합니다(되돌리기용). 계속할까요?`,
      )) return;
      // 3) 되돌리기용 자동 백업 → 4) 쓰기 → 동기화 메타 정리
      exportData('before-restore');
      forgetSyncMeta(applyBackup(plan, localStorage));
      show('ok', `복원 완료(백업일 ${when}, ${pv.total}개) — 되돌리려면 방금 받은 before-restore 파일을 가져오세요. 새로고침합니다`);
      setTimeout(() => window.location.reload(), 2500);
    } catch (err) {
      show('err', err instanceof Error ? err.message : String(err));
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
