/**
 * 데이터 상태 공통 표시(기획서 §4.4·§6) — 실시간/지연/마감/오류/오래됨을 색 + 글자 + 점 모양으로 중복 표현.
 *   live = 채운 점 · delayed = 네모 · closed = 빈 원 · error = 세모 · stale = 네모(노랑)
 * at: 기준 시각(문자열 그대로 표기), source: 출처. 숫자를 만들지 않는다 — 받은 상태만 보여준다.
 */
export type DataState = 'live' | 'delayed' | 'closed' | 'error' | 'stale';
const LABEL: Record<DataState, string> = { live: '실시간', delayed: '지연', closed: '장마감', error: '오류', stale: '갱신 지연' };

export default function DataStatus({ state, label, at, source, className = '' }: {
  state: DataState; label?: string; at?: string | null; source?: string; className?: string;
}) {
  const text = label ?? LABEL[state];
  return (
    <span className={`ds ${state} ${className}`} title={[text, at && `기준 ${at}`, source && `출처 ${source}`].filter(Boolean).join(' · ')}>
      <i aria-hidden />{text}{at ? <span className="ds-at">· {at}</span> : null}
    </span>
  );
}

/** 네이버 시세 상태 문자열('실시간' · 'N분 지연' · '장마감' 등) → DataState */
export function stateOf(status: string | null | undefined): DataState {
  if (!status) return 'closed';
  if (status === '실시간') return 'live';
  if (status.endsWith('지연')) return 'delayed';
  if (status.includes('오류') || status.includes('실패')) return 'error';
  return 'closed';
}
