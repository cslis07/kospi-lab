/**
 * 공용 TTL + LRU 인메모리 캐시.
 *
 * 왜 필요한가: lib/* 여러 모듈이 각자 `new Map()` 으로 캐시를 두는데,
 * 종목코드·티커를 키로 쓰는 캐시는 **상한도 만료 삭제도 없어** 웜 인스턴스가
 * 오래 살면 키가 무한히 쌓인다(누수 소지). 이 헬퍼로 통일한다.
 *
 * 특징:
 * - 항목마다 TTL. `get` 은 만료된 항목을 자동 삭제하고 miss 처리한다.
 * - 용량 상한(max). 초과 시 **가장 오래 접근되지 않은 키**(LRU)를 버린다.
 *   (Map 의 삽입 순서를 이용 — get/set 때 키를 뒤로 옮겨 최근 사용 표시)
 * - null·빈 배열 같은 "부정 결과"도 캐시할 수 있어야 하므로(재조회 폭주 방지)
 *   miss 와 "캐시된 null" 을 구분한다. get 은 hit 시 `{ v }`, miss 시 `undefined`.
 *
 * 서버리스 주의: Vercel 함수는 인스턴스마다 메모리가 분리되므로 전역 공유 캐시가
 * 아니다. 단일 웜 인스턴스의 반복 호출을 줄이는 용도로만 신뢰할 것.
 */
export class TtlCache<T> {
  private map = new Map<string, { v: T; exp: number }>();

  /**
   * @param ttlMs 항목 유효기간(ms)
   * @param max   최대 보관 키 수(초과 시 LRU 축출). 기본 500.
   */
  constructor(private readonly ttlMs: number, private readonly max = 500) {}

  /** hit 이면 `{ v }`(v 가 null 이어도 hit), miss·만료면 undefined. */
  get(key: string): { v: T } | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.map.delete(key);
      return undefined;
    }
    // LRU 표시: 최근 접근 키를 맨 뒤로
    this.map.delete(key);
    this.map.set(key, e);
    return { v: e.v };
  }

  set(key: string, v: T): T {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return v;
  }

  /** TTL 은 무시하고 값만 조회(테스트·디버그용). */
  peek(key: string): T | undefined {
    return this.map.get(key)?.v;
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
