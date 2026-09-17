/**
 * 히어로용 부드러운 스파크라인 — 의존성 0 순수 SVG.
 * Catmull-Rom → 베지어로 곡선화, 흰 선 + 반투명 영역 채움, 고점 말풍선 + 현재점 링.
 * 데이터가 없으면 같은 높이의 빈칸만 남겨 레이아웃이 튀지 않게 한다.
 */
const W = 320;

function smooth(p: [number, number][]) {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export default function Sparkline({ points, height = 90 }: { points?: number[]; height?: number }) {
  if (!points || points.length < 2) return <div style={{ aspectRatio: `${W} / ${height}` }} aria-hidden />;

  // padX 는 현재점 바깥 링(r=8)이 뷰박스 밖으로 잘리지 않을 만큼 확보
  const padT = 30, padB = 8, padX = 10;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const X = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const Y = (v: number) => padT + (1 - (v - min) / span) * (height - padT - padB);
  const pts = points.map((v, i) => [X(i), Y(v)] as [number, number]);

  const line = smooth(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;

  const iMax = points.indexOf(max);
  const [mx, my] = pts[iMax];
  const label = `고점 ${Math.round(max).toLocaleString('en-US')}`;
  const bw = Math.max(64, label.length * 7.2 + 10);
  const bh = 19;
  const bx = Math.min(Math.max(mx - bw / 2, 2), W - bw - 2);
  const by = Math.max(my - bh - 7, 2);

  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full h-auto" role="img" aria-label={`최근 1개월 추이, ${label}`}>
      <defs>
        <linearGradient id="finSparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#finSparkFill)" />
      <path d={line} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      {/* 고점 말풍선 */}
      <line x1={mx} y1={by + bh} x2={mx} y2={my - 4} stroke="#fff" strokeOpacity=".6" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx={mx} cy={my} r="4" fill="#fff" stroke="#2f4ad8" strokeWidth="2" />
      <rect x={bx} y={by} width={bw} height={bh} rx="9.5" fill="#fff" />
      <text x={bx + bw / 2} y={by + 13} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#1e3399">{label}</text>

      {/* 현재점 */}
      <circle cx={lx} cy={ly} r="8" fill="#fff" fillOpacity=".22" />
      <circle cx={lx} cy={ly} r="3.6" fill="#fff" />
    </svg>
  );
}
