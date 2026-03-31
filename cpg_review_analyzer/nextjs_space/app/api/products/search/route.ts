export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req?.url ?? 'http://localhost:3000');
    const q = url?.searchParams?.get?.('q') ?? '';

    if (!q) {
      return NextResponse.json([]);
    }

    // Use PostgreSQL full-text search via raw query
    const products = await prisma.$queryRaw`
      SELECT id, name, brand, source, "imageUrl", price, "createdAt"
      FROM "Product"
      WHERE
        name ILIKE ${'%' + q + '%'}
        OR brand ILIKE ${'%' + q + '%'}
        OR COALESCE(upc, '') ILIKE ${'%' + q + '%'}
      ORDER BY "createdAt" DESC
      LIMIT 20
    ` as any[];

    return NextResponse.json(products ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
