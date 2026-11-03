/**
 * 단일 파일 zip 해제(Binance 아카이브용) — 의존성 없이 node:zlib 만 쓴다.
 * 중앙 디렉터리의 크기·오프셋을 읽는다(로컬 헤더는 data descriptor 로 크기가 0일 수 있음).
 */
import { inflateRawSync } from 'node:zlib';

export function unzipFirst(buf: Buffer): { name: string; data: Buffer } {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: 끝 레코드(EOCD) 없음');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('zip: 중앙 디렉터리 서명 불일치');
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const nameLen = buf.readUInt16LE(cd + 28);
  const local = buf.readUInt32LE(cd + 42);
  const name = buf.toString('utf8', cd + 46, cd + 46 + nameLen);
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('zip: 로컬 헤더 서명 불일치');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const raw = buf.subarray(start, start + compSize);
  if (method === 0) return { name, data: Buffer.from(raw) };
  if (method === 8) return { name, data: inflateRawSync(raw) };
  throw new Error(`zip: 지원하지 않는 압축 방식 ${method}`);
}
