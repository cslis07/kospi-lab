'use client';

import { useState } from 'react';

const BROKERAGES = [
  { name: '토스증권', domestic: 0.0, us: 0.0, exchange_discount: 1, isa: true,  irp: false, cma: 3.5,  pros: ['국내 수수료 무료', '미국 수수료 무료', '앱 UX 최고'], cons: ['IRP 없음', '해외 환전 비용'] },
  { name: 'NH나무',   domestic: 0.0036396, us: 0.07, exchange_discount: 100, isa: true,  irp: true,  cma: 3.55, pros: ['ISA·IRP 모두 지원', '저렴한 수수료', 'NH농협 연계'], cons: ['앱이 다소 복잡'] },
  { name: '키움증권', domestic: 0.015, us: 0.07, exchange_discount: 0, isa: true,  irp: true,  cma: 3.5,  pros: ['국내 주식 최강', '빠른 체결', 'HTS 기능 풍부'], cons: ['앱 UI 구식', '해외 수수료 비쌈'] },
  { name: '미래에셋', domestic: 0.0, us: 0.0, exchange_discount: 0, isa: true,  irp: true,  cma: 3.7,  pros: ['해외 수수료 무료', '글로벌 서비스', 'CMA 금리 높음'], cons: ['국내 수수료 조건부'] },
  { name: 'KB증권',   domestic: 0.0140, us: 0.1, exchange_discount: 0, isa: true,  irp: true,  cma: 3.5,  pros: ['KB국민은행 연계', 'ISA·IRP 지원', '안정적'], cons: ['수수료 높은 편'] },
  { name: '삼성증권', domestic: 0.0, us: 0.07, exchange_discount: 30, isa: true,  irp: true,  cma: 3.4,  pros: ['자산가 특화', '리서치 우수', 'ISA·IRP 지원'], cons: ['일반 투자자 UI 평범'] },
  { name: '신한투자', domestic: 0.0, us: 0.1, exchange_discount: 0, isa: true,  irp: true,  cma: 3.5,  pros: ['신한은행 연계', 'ISA·IRP 지원'], cons: ['기능 평범', '해외 수수료 비쌈'] },
];

const BANKS = [
  { name: 'KB국민',  deposit: 3.8, saving: 4.1, cma: null },
  { name: '신한',    deposit: 3.7, saving: 4.0, cma: null },
  { name: '하나',    deposit: 3.9, saving: 4.2, cma: null },
  { name: '우리',    deposit: 3.6, saving: 4.0, cma: null },
  { name: '농협',    deposit: 3.8, saving: 4.1, cma: null },
  { name: '토스뱅크', deposit: 2.0, saving: 2.3, cma: 3.5 },
  { name: '카카오뱅크', deposit: 2.2, saving: 3.5, cma: null },
];

type BrokerFilter = 'all' | 'isa' | 'irp';
type Tab = 'broker' | 'bank';

export default function BrokeragePage() {
  const [tab,    setTab]    = useState<Tab>('broker');
  const [filter, setFilter] = useState<BrokerFilter>('all');
  const [sortBy, setSortBy] = useState<'domestic' | 'us' | 'cma'>('domestic');

  const filtered = BROKERAGES.filter((b) => {
    if (filter === 'isa') return b.isa;
    if (filter === 'irp') return b.irp;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'domestic') return a.domestic - b.domestic;
    if (sortBy === 'us')       return a.us - b.us;
    if (sortBy === 'cma')      return b.cma - a.cma;
    return 0;
  });

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-xl font-bold text-[var(--text)] mb-1">증권사·은행 비교</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">수수료·ISA·IRP·CMA 금리를 한눈에 비교하세요</p>

      {/* 탭 */}
      <div className="flex gap-1 p-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] w-fit mb-5">
        {(['broker', 'bank'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}>
            {t === 'broker' ? '증권사' : '은행'}
          </button>
        ))}
      </div>

      {tab === 'broker' && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              {([['all','전체'],['isa','ISA'],['irp','IRP']] as [BrokerFilter, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    filter === k
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}>{l}</button>
              ))}
            </div>
            <div className="flex gap-1 ml-auto">
              <span className="text-xs text-[var(--text-muted)] self-center">정렬</span>
              {([['domestic','국내수수료'],['us','미국수수료'],['cma','CMA금리']] as ['domestic'|'us'|'cma', string][]).map(([k, l]) => (
                <button key={k} onClick={() => setSortBy(k)}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-all ${
                    sortBy === k
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          {/* 카드 목록 */}
          <div className="space-y-3">
            {filtered.map((b) => (
              <div key={b.name} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text)]">{b.name}</h3>
                    {b.isa && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">ISA</span>}
                    {b.irp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">IRP</span>}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">CMA {b.cma}%</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                    <p className="text-[10px] text-[var(--text-muted)]">국내 수수료</p>
                    <p className={`text-sm font-bold ${b.domestic === 0 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>
                      {b.domestic === 0 ? '무료' : `${(b.domestic * 100).toFixed(4)}%`}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                    <p className="text-[10px] text-[var(--text-muted)]">미국 수수료</p>
                    <p className={`text-sm font-bold ${b.us === 0 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>
                      {b.us === 0 ? '무료' : `${b.us}%`}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                    <p className="text-[10px] text-[var(--text-muted)]">환전할인</p>
                    <p className="text-sm font-bold text-[var(--text)]">
                      {b.exchange_discount === 0 ? '-' : `${b.exchange_discount}%`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    {b.pros.map((p) => <p key={p} className="text-emerald-400">✓ {p}</p>)}
                  </div>
                  <div>
                    {b.cons.map((c) => <p key={c} className="text-red-400/70">✗ {c}</p>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'bank' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">기준 금리는 2026년 6월 기준 대략적 참고값입니다. 실제 금리는 은행 홈페이지를 확인하세요.</p>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
                  <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">은행</th>
                  <th className="text-right px-3 py-3 text-xs text-[var(--text-muted)] font-medium">예금 (1년)</th>
                  <th className="text-right px-3 py-3 text-xs text-[var(--text-muted)] font-medium">적금 (1년)</th>
                  <th className="text-right px-3 py-3 text-xs text-[var(--text-muted)] font-medium">CMA</th>
                </tr>
              </thead>
              <tbody>
                {[...BANKS].sort((a, b) => b.deposit - a.deposit).map((b, i) => (
                  <tr key={b.name} className={i % 2 === 0 ? '' : 'bg-[var(--bg)]/30'}>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{b.name}</td>
                    <td className="px-3 py-3 text-right text-[var(--text)]">{b.deposit}%</td>
                    <td className="px-3 py-3 text-right text-[var(--text)]">{b.saving}%</td>
                    <td className="px-3 py-3 text-right text-[var(--text-muted)]">
                      {b.cma != null ? `${b.cma}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
