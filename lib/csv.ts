/**
 * CSV 내보내기 — 순수함수(테스트 대상) + 브라우저 다운로드.
 *
 * - 엑셀(한국어 윈도우)이 UTF-8 을 알아보도록 BOM(﻿)을 붙이고 줄바꿈은 CRLF.
 * - 쉼표·따옴표·줄바꿈이 든 칸은 큰따옴표로 감싸고 안의 따옴표는 두 번.
 * - **수식 주입 방지**: 문자열 칸이 = + - @ 탭·CR 로 시작하면 앞에 ' 를 붙인다(메모에 "=HYPERLINK(...)" 같은 것이
 *   엑셀에서 실행되지 않게). 숫자 칸(음수 손익 포함)은 그대로 둔다.
 */

export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: CsvCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** ms → 'YYYY-MM-DD HH:mm'(KST) — 엑셀에서 날짜로 정렬되는 형식 */
export function kstDateTime(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '';
  return new Date(ts + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}

/** 파일 이름용 오늘 날짜(KST) 'YYYYMMDD' */
export function kstStamp(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** 브라우저에서 CSV 파일 저장(서버 왕복 없음 — 기록은 이 기기에만 있다) */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
