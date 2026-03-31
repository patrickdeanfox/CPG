export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const reviews = await prisma.review.findMany({
      where: { productId: params?.id ?? '' },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(reviews ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req?.json?.();
    const review = await prisma.review.create({
      data: {
        productId: params?.id ?? '',
        reviewText: body?.reviewText ?? '',
        rating: body?.rating ? parseFloat(body.rating) : null,
        reviewDate: body?.reviewDate ? new Date(body.reviewDate) : null,
        source: body?.source ?? 'manual',
        reviewerName: body?.reviewerName ?? 'Manual Entry',
      },
    });
    return NextResponse.json(review, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
