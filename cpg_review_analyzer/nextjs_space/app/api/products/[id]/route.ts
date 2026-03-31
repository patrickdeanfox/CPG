export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params?.id ?? '' },
      include: {
        reviews: { orderBy: { createdAt: 'desc' } },
        scrapeLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
        matchesA: {
          include: { productB: true },
        },
        matchesB: {
          include: { productA: true },
        },
      },
    });
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(product);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req?.json?.();
    const { name, brand, upc, price, size, imageUrl, category, description } = body ?? {};
    const product = await prisma.product.update({
      where: { id: params?.id ?? '' },
      data: {
        ...(name !== undefined && { name }),
        ...(brand !== undefined && { brand }),
        ...(upc !== undefined && { upc }),
        ...(price !== undefined && { price: price ? parseFloat(price) : null }),
        ...(size !== undefined && { size }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(category !== undefined && { category }),
        ...(description !== undefined && { description }),
      },
    });
    return NextResponse.json(product);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.product.delete({ where: { id: params?.id ?? '' } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to delete' }, { status: 500 });
  }
}
