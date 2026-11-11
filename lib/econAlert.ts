/**
 * 경제지표 발표 알림 — FRED 가 새 수치를 올리면(= 발표됨) 텔레그램으로 결과를 보낸다.
 * 서버는 인베스팅 접근 불가(403)라 결과값은 FRED에서. 결과·이전·변화를 보내고,
 * 시장 예상치는 경제 캘린더(Nowflation 중계, 경제 캘린더 화면과 같은 자료)에 그 발표가 있으면 '예상 대비'를 덧붙인다(없으면 생략). "발표 직후 자동 알림, 매매 신호 아님"(앱 원칙).
 * 상태 저장 없이 FRED series 의 last_updated 가 최근(window)인지로 '방금 발표'를 판정한다(중복 방지는 1일 1회 크론).
 */

export interface Obs { date: string; value: number }
export interface HeadlineLine {
  label: string; cur: string; prev: string | null; chg: string | null;
  /** 발표값(표시 단위 — 전월대비 % 소수 1자리, 건수는 천 건). 예상 대비 계산용 */
  num?: number;
  /** 시장 예상치와 그 차이(있을 때만) */
  est?: string; vsEst?: string;
}
export interface Headline { refDate: string; lines: HeadlineLine[] }

export interface EconCfg {
  id: string; name: string; fred: string;
  kind: 'index' | 'level';        // index=지수에서 MoM/YoY 계산 · level=수준값(건수 등)
  show: ('yoy' | 'mom')[];        // index 일 때 보여줄 지표
  releasesId: string;             // /releases 딥링크용
}

// ⚠️ FRED 계산이 인베스팅(수집 데이터)과 일치하는 것만 포함(전부 대조 완료):
//  - MoM(전월대비)=SA 지수에서 계산 → 일치. YoY(NSA)는 인베스팅과 어긋나 제외.
//  - 근원 PPI는 PPIFES(일치), 실업청구는 건수(일치), 소매 control group은 FRED 시리즈 불일치라 제외.
export const TRACKED: EconCfg[] = [
  { id: 'cpi',        name: '미국 소비자물가 (CPI)',        fred: 'CPIAUCSL', kind: 'index', show: ['mom'], releasesId: 'cpi-69' },
  { id: 'core-cpi',   name: '미국 근원 소비자물가 (CPI)',    fred: 'CPILFESL', kind: 'index', show: ['mom'], releasesId: 'core-cpi-56' },
  { id: 'ppi',        name: '미국 근원 생산자물가 (PPI)',    fred: 'PPIFES',   kind: 'index', show: ['mom'], releasesId: 'core-ppi-62' },
  { id: 'indpro',     name: '미국 산업생산',               fred: 'INDPRO',   kind: 'index', show: ['mom'], releasesId: 'industrial-production-161' },
  { id: 'import',     name: '미국 수입물가',               fred: 'IR',       kind: 'index', show: ['mom'], releasesId: 'import-price-index-153' },
  { id: 'initial',    name: '미국 신규 실업수당청구',        fred: 'ICSA',     kind: 'level', show: [],      releasesId: 'initial-jobless-claims-294' },
  { id: 'continuing', name: '미국 연속 실업수당청구',        fred: 'CCSA',     kind: 'level', show: [],      releasesId: 'continuing-jobless-claims-522' },
];

const pp = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%p`;
const fmtK = (v: number) => `${Math.round(v / 1000).toLocaleString('en-US')}K`;
const fmtKdiff = (d: number) => `${d >= 0 ? '+' : ''}${Math.round(d / 1000).toLocaleString('en-US')}K`;

/** 오름차순 관측치에서 헤드라인(결과·이전·변화) 계산. 부족하면 null. */
export function computeHeadline(ascObs: Obs[], cfg: EconCfg): Headline | null {
  const o = ascObs.filter((x) => Number.isFinite(x.value));
  const n = o.length;
  if (n < 2) return null;
  const refDate = o[n - 1].date;
  const lines: HeadlineLine[] = [];

  if (cfg.kind === 'level') {
    lines.push({ label: '결과', cur: fmtK(o[n - 1].value), prev: fmtK(o[n - 2].value), chg: fmtKdiff(o[n - 1].value - o[n - 2].value), num: Math.round(o[n - 1].value / 1000) });
    return { refDate, lines };
  }

  const momAt = (i: number) => (i >= 1 ? (o[i].value / o[i - 1].value - 1) * 100 : null);
  const yoyAt = (i: number) => (i >= 12 ? (o[i].value / o[i - 12].value - 1) * 100 : null);
  for (const s of cfg.show) {
    const [label, c, p] = s === 'yoy'
      ? ['전년대비', yoyAt(n - 1), yoyAt(n - 2)] as const
      : ['전월대비', momAt(n - 1), momAt(n - 2)] as const;
    if (c == null) continue;
    lines.push({ label, cur: `${c.toFixed(1)}%`, prev: p != null ? `${p.toFixed(1)}%` : null, chg: p != null ? pp(c - p) : null, ...(s === 'mom' ? { num: Number(c.toFixed(1)) } : {}) });
  }
  return lines.length ? { refDate, lines } : null;
}

/* ── 시장 예상치 대조(경제 캘린더) ─────────────────────────── */
export interface CalEst { date: string; country: string; event: string; estimate: number | null }
/** 지표 id → 경제 캘린더 이벤트 이름(괄호 앞 부분). 월간은 "(Oct)", 주간 실업청구는 "(Nov/07)" 꼴이 뒤에 붙는다 */
const CAL_NAME: Record<string, string> = {
  cpi: 'Inflation Rate MoM', 'core-cpi': 'Core Inflation Rate MoM', ppi: 'Core PPI MoM',
  indpro: 'Industrial Production MoM', import: 'Import Prices MoM',
  initial: 'Initial Jobless Claims', continuing: 'Continuing Jobless Claims',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 이 발표(refDate 기준 월·주)의 시장 예상치 — 캘린더에 없거나 예상치가 비면 null */
export function consensusFor(events: CalEst[] | undefined, cfg: EconCfg, refDate: string): number | null {
  const name = CAL_NAME[cfg.id];
  if (!name || !/^\d{4}-\d{2}-\d{2}/.test(refDate)) return null;
  const mon = MON[Number(refDate.slice(5, 7)) - 1];
  const tag = cfg.kind === 'level' ? `(${mon}/${refDate.slice(8, 10)})` : `(${mon})`;
  const e = (events ?? []).find((x) => x.country === 'US' && x.event === `${name} ${tag}`);
  return e && typeof e.estimate === 'number' && Number.isFinite(e.estimate) ? e.estimate : null;
}

/** 헤드라인 첫 줄(전월대비·결과)에 예상치와 '예상 대비'를 붙인다. 예상치가 없으면 그대로 */
export function withConsensus(h: Headline, cfg: EconCfg, events: CalEst[] | undefined): Headline {
  const est = consensusFor(events, cfg, h.refDate);
  if (est == null) return h;
  const level = cfg.kind === 'level';
  return {
    ...h,
    lines: h.lines.map((l) => {
      if (l.num == null) return l;
      const d = l.num - est;
      return level
        ? { ...l, est: `${Math.round(est).toLocaleString('en-US')}K`, vsEst: `${d >= 0 ? '+' : ''}${Math.round(d).toLocaleString('en-US')}K` }
        : { ...l, est: `${est.toFixed(1)}%`, vsEst: pp(d) };
    }),
  };
}

/** 여러 지표 헤드라인을 하나의 텔레그램 메시지(HTML)로. */
export function formatAlert(items: { cfg: EconCfg; h: Headline }[], base: string): string {
  const head = `🔔 <b>미국 경제지표 발표</b>`;
  const blocks = items.map(({ cfg, h }) => {
    const body = h.lines.map((l) => {
      const tail = l.prev ? ` <i>(이전 ${l.prev}${l.chg ? `, ${l.chg}` : ''})</i>` : '';
      const cons = l.est ? `\n   예상 ${l.est} → <b>예상 대비 ${l.vsEst}</b>` : '';
      return `• ${l.label} <b>${l.cur}</b>${tail}${cons}`;
    }).join('\n');
    return `📊 <b>${cfg.name}</b> <i>(${h.refDate} 기준)</i>\n${body}\n🔗 ${base}/releases?id=${cfg.releasesId}`;
  });
  const hasEst = items.some(({ h }) => h.lines.some((l) => l.est));
  const foot = `출처 FRED${hasEst ? ' · 예상치 Nowflation 경제 캘린더' : ''} · 발표 직후 자동 · <b>맥락 참고용, 매매 신호 아님</b>`;
  return [head, ...blocks, foot].join('\n\n');
}

/** last_updated(예: "2026-10-14 08:37:49-05") 가 지금으로부터 window 시간 이내인지 */
export function isFresh(lastUpdated: string, windowHours: number, now = Date.now()): boolean {
  // FRED 형식 "2026-10-14 08:37:49-05" → ISO ("T", 오프셋에 분 보강 "-05"→"-05:00")
  const iso = lastUpdated.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now - t <= windowHours * 3600_000 && now - t >= -3600_000;
}

/** 텔레그램 발송(dry 면 텍스트만). */
export async function sendTelegram(text: string, token?: string, chat?: string, dry = false): Promise<{ ok: boolean; status: number; skipped?: string; dryText?: string }> {
  if (dry) return { ok: true, status: 0, dryText: text };
  if (!token || !chat) return { ok: false, status: 0, skipped: '토큰/채팅 미설정' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: !!(body as { ok?: boolean }).ok, status: r.status };
}
