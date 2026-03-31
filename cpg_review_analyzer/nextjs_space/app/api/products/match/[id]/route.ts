export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

// PUT: approve or reject a match
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { action } = body; // 'approve' | 'reject'

    const match = await prisma.productMatch.findUnique({ where: { id: params?.id ?? '' } });
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await prisma.productMatch.update({
        where: { id: match.id },
        data: { approved: true, rejected: false },
      });

      // If it's a variant match, auto-link them in variant group
      if (match.matchType === 'variant') {
        const productA = await prisma.product.findUnique({ where: { id: match.productAId } });
        const productB = await prisma.product.findUnique({ where: { id: match.productBId } });
        
        const groupId = productA?.variantGroupId || productB?.variantGroupId || `vg_${match.productAId.substring(0, 8)}_${Date.now()}`;
        
        await prisma.product.updateMany({
          where: { id: { in: [match.productAId, match.productBId] } },
          data: { variantGroupId: groupId },
        });
      }
    } else if (action === 'reject') {
      await prisma.productMatch.update({
        where: { id: match.id },
        data: { rejected: true, approved: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// DELETE: remove a match
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.productMatch.delete({ where: { id: params?.id ?? '' } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
