'use client';

export type SortKey = 'default' | 'changeRate' | 'changeRateAsc' | 'price';
export type FilterMarket = 'all' | 'KOSPI' | 'KOSDAQ';

interface Props {
  sort: SortKey;
  filter: FilterMarket;
  onSort: (k: SortKey) => void;
  onFilter: (m: FilterMarket) => void;
  count: number;
}

export default function StockFilter({ sort, filter, onSort, onFilter, count }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--text-muted)]">{count}종목</span>
      <div className="flex gap-1">
        {(['all', 'KOSPI', 'KOSDAQ'] as FilterMarket[]).map((m) => (
          <button
            key={m}
            onClick={() => onFilter(m)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filter === m
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-400'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {m === 'all' ? '전체' : m}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <span className="text-xs text-[var(--text-muted)]">정렬</span>
        {(
          [
            { key: 'default', label: '기본' },
            { key: 'changeRate', label: '▲ 등락률' },
            { key: 'changeRateAsc', label: '▼ 등락률' },
            { key: 'price', label: '시가총액' },
          ] as { key: SortKey; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSort(key)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              sort === key
                ? 'bg-white/10 text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
