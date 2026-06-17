import { NextResponse } from 'next/server';
import { getKisToken } from '@/lib/kis';

export async function GET() {
  try {
    const token = await getKisToken();
    return NextResponse.json({ access_token: token });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
