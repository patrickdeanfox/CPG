export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req?.url ?? 'http://localhost:3000');
    const status = url?.searchParams?.get?.('status') ?? 'pending';

    const items = await prisma.triageItem.findMany({
      where: status === 'all' ? {} : { status },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with suggested match product info
    const enriched = await Promise.all(
      (items ?? [])?.map?.(async (item: any) => {
        let suggestedProduct = null;
        if (item?.suggestedMatchId) {
          suggestedProduct = await prisma.product.findUnique({
            where: { id: item.suggestedMatchId },
            select: { id: true, name: true, brand: true, source: true, imageUrl: true, price: true },
          });
        }
        return { ...(item ?? {}), suggestedProduct };
      }) ?? []
    );

    return NextResponse.json(enriched ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
