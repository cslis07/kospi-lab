import { NextRequest, NextResponse } from 'next/server';
import { searchOverseasList } from '@/lib/overseasList';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  return NextResponse.json(searchOverseasList(q));
}
