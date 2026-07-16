'use client';

/** 루트 레이아웃까지 무너졌을 때의 최후 방어선 — 자체 html/body 필요 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ fontSize: 32, margin: '0 0 12px' }}>⚠️</p>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>앱에 문제가 생겼습니다</h2>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 20px' }}>{error.digest ? `오류 코드: ${error.digest}` : '잠시 후 다시 시도해 주세요.'}</p>
          <button onClick={reset} style={{ padding: '8px 16px', borderRadius: 12, border: '1px solid #38bdf8', background: 'rgba(56,189,248,.15)', color: '#38bdf8', fontWeight: 600, cursor: 'pointer' }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
