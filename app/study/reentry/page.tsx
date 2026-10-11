'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

/**
 * 진입 전 7문항 + 손절 후 재진입 프로토콜(STOP→MAP→CLOSE→RETEST→RISK).
 * 방향 예측 도구가 아니라, 진입/재진입 전에 조건을 확인하는 규율 체크리스트.
 * 손절 대기 타이머만 localStorage(kl- 접두 → 클라우드 동기화 제외, 이 기기 전용).
 */

const PRE_ENTRY = [
  '4시간봉의 큰 방향이 분명한가? 횡보면 쉰다',
  '1시간봉 주요 지지·저항을 진입 전에 표시했는가?',
  '15분봉이 그 구간 밖에서 종가로 마감했는가? (꼬리 돌파 아님)',
  '되돌림에서 재지지 또는 재저항을 확인했는가?',
  '다음 지지·저항까지 목표 여유가 충분한가? (손익비 1:2 이상)',
  '거래비용 포함 최대 손실이 1회 한도 이내인가?',
  '최근 손절 이후 새 신호가 생겼고, 하루 거래 제한을 지켰는가?',
];

const PROTOCOL = [
  { tag: 'STOP',   title: '60분 대기',    body: '손절 직후는 신규 주문 중지. 시장 변동 관찰과 기록만 한다.' },
  { tag: 'MAP',    title: '1시간봉 구조', body: '기존 손절 근거가 무효화됐는지, 지지·저항이 바뀌었는지 확인한다.' },
  { tag: 'CLOSE',  title: '15분 종가',    body: '꼬리 돌파가 아니라 실제 마감 위치를 확인한다.' },
  { tag: 'RETEST', title: '되돌림 확인',  body: '돌파 저항의 재지지 / 깨진 지지의 재저항을 확인한다.' },
  { tag: 'RISK',   title: '주문 전 계산', body: '수수료 포함 최악의 손실, 목표가까지 여유, 손익비를 계산한다.' },
];

const STOP_KEY = 'kl-reentry-stop';
const WAIT_MS = 60 * 60_000;

export default function ReentryChecklistPage() {
  const [pre, setPre] = useState<boolean[]>(() => PRE_ENTRY.map(() => false));
  const [proto, setProto] = useState<boolean[]>(() => PROTOCOL.map(() => false));
  const [stopTs, setStopTs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try { const raw = localStorage.getItem(STOP_KEY); if (raw) setStopTs(Number(raw) || null); } catch {}
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const markStop = () => {
    const ts = Date.now();
    setStopTs(ts);
    try { localStorage.setItem(STOP_KEY, String(ts)); } catch {}
  };
  const clearStop = () => {
    setStopTs(null);
    try { localStorage.removeItem(STOP_KEY); } catch {}
  };

  const preLeft = pre.filter((x) => !x).length;
  const preOk = preLeft === 0;
  const elapsed = stopTs != null ? now - stopTs : 0;
  const remainMs = stopTs != null ? Math.max(0, WAIT_MS - elapsed) : 0;
  const waitDone = stopTs != null && remainMs === 0;
  const remainMin = Math.floor(remainMs / 60_000);
  const remainSec = Math.floor((remainMs % 60_000) / 1000);
  const protoOk = proto.every((x) => x);

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <Link href="/study" className="text-[12px] font-semibold text-[var(--accent-ink)]">← 코인 기초 공부법</Link>
      <h1 className="text-xl font-extrabold text-[var(--text)] mt-2 mb-1">진입·재진입 체크리스트</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">
        이건 <b className="text-[var(--text)]">방향을 맞히는 신호가 아니라</b>, 주문을 넣기 전에 조건을 스스로 확인하는 규율 도구입니다.
        잦은 진입·손절 후 즉시 재진입이 손실을 키운다는 점에서 출발합니다 — <b className="text-[var(--text)]">하나라도 미충족이면 관망</b>.
      </p>

      {/* A. 진입 전 7문항 */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-[var(--text)]">진입 전 7문항</h2>
          <button onClick={() => setPre(PRE_ENTRY.map(() => false))} className="text-[11px] text-[var(--text-muted)] hover:text-sky-400">초기화</button>
        </div>
        <ul className="space-y-2">
          {PRE_ENTRY.map((q, i) => (
            <li key={i}>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={pre[i]} onChange={(e) => setPre((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-sky-500" />
                <span className={`text-[13px] leading-snug ${pre[i] ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{q}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className={`mt-4 rounded-xl px-3 py-2.5 text-[12px] font-semibold ${preOk ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/5 text-amber-400 border border-amber-500/20'}`}>
          {preOk ? '✓ 7문항 모두 충족 — 진입 조건은 갖췄습니다(그래도 방향을 보장하지 않음, 손절·사이즈 먼저).' : `관망 — 미충족 ${preLeft}개. 하나라도 비면 들어가지 않습니다.`}
        </div>
      </section>

      {/* B. 손절 후 재진입 프로토콜 */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 mb-5">
        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">손절 후 재진입 프로토콜</h2>
        <p className="text-[12px] text-[var(--text-muted)] mb-4">재진입 허용 조건은 <b className="text-[var(--text)]">시간이 아니라 “새로운 근거”</b>입니다. 손절 직후 60분은 멈추고, 아래 4단계를 다시 확인합니다.</p>

        {/* STOP 타이머 */}
        <div className={`rounded-xl border p-3.5 mb-3 ${waitDone ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : stopTs != null ? 'border-sky-500/25 bg-sky-500/[0.06]' : 'border-[var(--border)] bg-white/3'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-[var(--text)]">STOP · 60분 대기</span>
            {stopTs == null
              ? <button onClick={markStop} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">지금 손절함</button>
              : <button onClick={clearStop} className="text-[11px] text-[var(--text-muted)] hover:text-sky-400">초기화</button>}
          </div>
          {stopTs != null && (
            <p className={`mt-1.5 text-[13px] font-bold tabular-nums ${waitDone ? 'text-emerald-400' : 'text-sky-400'}`}>
              {waitDone ? '대기 완료 — 새 근거가 생겼는지 아래 4단계를 확인하세요.' : `남은 대기 ${remainMin}분 ${String(remainSec).padStart(2, '0')}초 · 신규 주문 중지`}
            </p>
          )}
          {stopTs == null && <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">손절했다면 눌러서 60분 타이머를 시작하세요(이 기기에만 저장).</p>}
        </div>

        <ol className="space-y-2.5">
          {PROTOCOL.map((s, i) => (
            <li key={s.tag}>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={proto[i]} onChange={(e) => setProto((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="mt-1 w-4 h-4 shrink-0 accent-sky-500" />
                <div>
                  <p className="text-[13px] font-bold leading-snug">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[10px] font-extrabold text-[var(--accent-ink)] mr-1.5 align-middle">{s.tag}</span>
                    <span className={proto[i] ? 'text-[var(--text)]' : 'text-[var(--text)]'}>{s.title}</span>
                  </p>
                  <p className="text-[12px] text-[var(--text-muted)] leading-snug mt-0.5">{s.body}</p>
                </div>
              </label>
            </li>
          ))}
        </ol>
        <div className={`mt-4 rounded-xl px-3 py-2.5 text-[12px] font-semibold ${protoOk && waitDone ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/5 text-amber-400 border border-amber-500/20'}`}>
          {protoOk && waitDone ? '✓ 대기 완료 + 4단계 확인 — 새로운 근거가 있으면 RISK 계산 후 진입을 검토하세요.'
            : !waitDone && stopTs != null ? '아직 60분 대기 중입니다.'
            : '대기 완료 후 4단계를 모두 확인해야 재진입 검토 단계입니다.'}
        </div>
      </section>

      {/* 연결 도구 */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-5">
        <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">계산은 이 도구로</p>
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/simulate', label: '시뮬 — 리스크 역산·청산가·실손익' },
            { href: '/journal', label: '매매일지 — 복기·태그' },
            { href: '/', label: '홈 오늘의 리스크 — 손실 한도' },
            { href: '/study/chart', label: '차트 — 지지·저항·돌파' },
          ].map((t) => (
            <Link key={t.href + t.label} href={t.href}
              className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
              {t.label}
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        한 줄 원칙: “가격이 움직여서 들어가는 것이 아니라, 조건이 확인되어도 손익비가 맞을 때만 들어간다.” 이 체크리스트는 규율 보조 도구이며 투자 권유나 수익 보장이 아닙니다.
      </p>
    </div>
  );
}
