import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto mt-24 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
      <p className="text-3xl mb-3">🔍</p>
      <h2 className="text-base font-bold text-[var(--text)] mb-2">페이지를 찾을 수 없습니다</h2>
      <p className="text-xs text-[var(--text-muted)] mb-5">주소가 바뀌었거나 잘못 입력됐을 수 있습니다.</p>
      <Link href="/" className="inline-block px-4 py-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/40 text-sm font-semibold">
        홈으로
      </Link>
    </div>
  );
}
