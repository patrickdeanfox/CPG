export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req?.json?.();
    const { action } = body ?? {};

    const item = await prisma.triageItem.findUnique({ where: { id: params?.id ?? '' } });
    if (!item) return NextResponse.json({ error: 'Triage item not found' }, { status: 404 });

    if (action === 'approve') {
      // Approve the match
      if (item?.suggestedMatchId) {
        await prisma.productMatch.updateMany({
          where: {
            OR: [
              { productAId: item.productId, productBId: item.suggestedMatchId },
              { productAId: item.suggestedMatchId, productBId: item.productId },
            ],
          },
          data: { approved: true, rejected: false },
        });
      }
      await prisma.triageItem.update({
        where: { id: params?.id ?? '' },
        data: { status: 'approved', resolvedAt: new Date() },
      });
    } else if (action === 'reject') {
      if (item?.suggestedMatchId) {
        await prisma.productMatch.updateMany({
          where: {
            OR: [
              { productAId: item.productId, productBId: item.suggestedMatchId },
              { productAId: item.suggestedMatchId, productBId: item.productId },
            ],
          },
          data: { rejected: true, approved: false },
        });
      }
      await prisma.triageItem.update({
        where: { id: params?.id ?? '' },
        data: { status: 'rejected', resolvedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
