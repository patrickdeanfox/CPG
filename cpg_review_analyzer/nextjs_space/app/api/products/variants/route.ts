export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// GET: list all variant groups
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { variantGroupId: { not: '' } },
      select: { id: true, name: true, brand: true, size: true, price: true, source: true, imageUrl: true, variantGroupId: true },
      orderBy: { variantGroupId: 'asc' },
    });

    // Group by variantGroupId
    const groups: Record<string, any[]> = {};
    for (const p of products) {
      const gid = p.variantGroupId ?? '';
      if (!gid) continue;
      if (!groups[gid]) groups[gid] = [];
      groups[gid].push(p);
    }

    return NextResponse.json({ groups });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// POST: link products as variants
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productIds, groupId } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 product IDs' }, { status: 400 });
    }

    // Use provided groupId or generate from first product's ID
    const variantGroupId = groupId || `vg_${productIds[0].substring(0, 8)}_${Date.now()}`;

    await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { variantGroupId },
    });

    return NextResponse.json({ success: true, variantGroupId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

// DELETE: unlink a product from its variant group
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get('productId') ?? '';

    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 });
    }

    await prisma.product.update({
      where: { id: productId },
      data: { variantGroupId: '' },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
