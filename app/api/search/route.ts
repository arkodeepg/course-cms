import { NextRequest, NextResponse } from 'next/server';
import { parseLimit, searchLibrary } from '@/lib/search';

export type { SearchResult } from '@/lib/search';

// GET /api/search?q=<query>&limit=<n>. Returns a ranked array (default 20,
// at most 100). The nav dropdown shows the first eight.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
  const { results } = searchLibrary(q, limit);
  return NextResponse.json(results);
}
