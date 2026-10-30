/**
 * 트리맵 배치(이분할) — 무게(시가총액) 비율대로 직사각형을 나눈다. 업종 히트맵(Finviz 방식)용.
 * 무게 순으로 정렬한 목록을 합이 반반이 되는 지점에서 둘로 쪼개고, 긴 변 쪽으로 자르기를 반복한다.
 * 정사각형에 가까운 칸이 나오고, 같은 입력이면 늘 같은 배치(결정적). 좌표는 0~W, 0~H.
 */
export interface Rect { x: number; y: number; w: number; h: number }
export interface Tile<T> extends Rect { item: T }

export function treemap<T>(items: T[], weight: (t: T) => number, W: number, H: number): Tile<T>[] {
  const list = items.map((item) => ({ item, w: Math.max(0, weight(item)) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  const out: Tile<T>[] = [];
  const place = (xs: typeof list, r: Rect) => {
    if (!xs.length) return;
    if (xs.length === 1) { out.push({ ...r, item: xs[0].item }); return; }
    const total = xs.reduce((a, x) => a + x.w, 0);
    // 반이 넘는 첫 지점에서 자른다(최소 1개씩)
    let acc = 0, k = 0;
    while (k < xs.length - 1 && acc + xs[k].w <= total / 2) { acc += xs[k].w; k++; }
    if (k === 0) { acc = xs[0].w; k = 1; }
    const f = acc / total;
    const a = xs.slice(0, k), b = xs.slice(k);
    if (r.w >= r.h) {
      const w1 = r.w * f;
      place(a, { x: r.x, y: r.y, w: w1, h: r.h });
      place(b, { x: r.x + w1, y: r.y, w: r.w - w1, h: r.h });
    } else {
      const h1 = r.h * f;
      place(a, { x: r.x, y: r.y, w: r.w, h: h1 });
      place(b, { x: r.x, y: r.y + h1, w: r.w, h: r.h - h1 });
    }
  };
  place(list, { x: 0, y: 0, w: W, h: H });
  return out;
}
