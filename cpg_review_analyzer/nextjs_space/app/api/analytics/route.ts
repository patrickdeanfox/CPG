export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req?.url ?? 'http://localhost:3000');
    const startDate = url?.searchParams?.get?.('startDate') ?? '';
    const endDate = url?.searchParams?.get?.('endDate') ?? '';

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const reviewWhere: any = {};
    if (startDate || endDate) reviewWhere.createdAt = dateFilter;

    // Total stats
    const totalProducts = await prisma.product.count();
    const totalReviews = await prisma.review.count({ where: reviewWhere });

    // Sentiment distribution
    const sentimentGroups = await prisma.review.groupBy({
      by: ['sentiment'],
      where: reviewWhere,
      _count: true,
    });

    // Average sentiment score
    const avgSentiment = await prisma.review.aggregate({
      where: { ...reviewWhere, analyzed: true },
      _avg: { sentimentScore: true },
    });

    // Products by brand
    const brandGroups = await prisma.product.groupBy({
      by: ['brand'],
      _count: true,
      orderBy: { _count: { brand: 'desc' } },
      take: 15,
    });

    // Reviews by source
    const sourceGroups = await prisma.review.groupBy({
      by: ['source'],
      where: reviewWhere,
      _count: true,
    });

    // Sentiment by brand (through products)
    const products = await prisma.product.findMany({
      select: {
        brand: true,
        reviews: {
          where: { ...reviewWhere, analyzed: true },
          select: { sentimentScore: true, sentiment: true },
        },
      },
    });

    const brandSentiment: Record<string, { total: number; sum: number }> = {};
    (products ?? [])?.forEach?.((p: any) => {
      const b = p?.brand ?? 'Unknown';
      if (!brandSentiment[b]) brandSentiment[b] = { total: 0, sum: 0 };
      (p?.reviews ?? [])?.forEach?.((r: any) => {
        brandSentiment[b].total++;
        brandSentiment[b].sum += (r?.sentimentScore ?? 0);
      });
    });

    const avgSentimentByBrand = Object.entries(brandSentiment ?? {})?.map?.(([brand, data]: [string, any]) => ({
      brand,
      avgSentiment: (data?.total ?? 0) > 0 ? (data?.sum ?? 0) / data.total : 0,
      reviewCount: data?.total ?? 0,
    })) ?? [];

    // Sentiment over time (by month)
    const reviewsWithDates = await prisma.review.findMany({
      where: { ...reviewWhere, analyzed: true },
      select: { createdAt: true, sentiment: true, sentimentScore: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlyData: Record<string, { positive: number; negative: number; neutral: number; total: number; sum: number }> = {};
    (reviewsWithDates ?? [])?.forEach?.((r: any) => {
      const d = r?.createdAt ? new Date(r.createdAt) : new Date();
      const key = `${d?.getFullYear?.()}-${String((d?.getMonth?.() ?? 0) + 1).padStart(2, '0')}`;
      if (!monthlyData[key]) monthlyData[key] = { positive: 0, negative: 0, neutral: 0, total: 0, sum: 0 };
      const s = r?.sentiment ?? 'neutral';
      if (s === 'positive') monthlyData[key].positive++;
      else if (s === 'negative') monthlyData[key].negative++;
      else monthlyData[key].neutral++;
      monthlyData[key].total++;
      monthlyData[key].sum += (r?.sentimentScore ?? 0);
    });

    const sentimentTrends = Object.entries(monthlyData ?? {})?.map?.(([month, data]: [string, any]) => ({
      month,
      positive: data?.positive ?? 0,
      negative: data?.negative ?? 0,
      neutral: data?.neutral ?? 0,
      avgScore: (data?.total ?? 0) > 0 ? (data?.sum ?? 0) / data.total : 0,
    }))?.sort?.((a: any, b: any) => (a?.month ?? '').localeCompare(b?.month ?? '')) ?? [];

    // Pending triage count
    const pendingTriage = await prisma.triageItem.count({ where: { status: 'pending' } });

    return NextResponse.json({
      totalProducts,
      totalReviews,
      avgSentimentScore: avgSentiment?._avg?.sentimentScore ?? 0,
      sentimentDistribution: (sentimentGroups ?? [])?.map?.((g: any) => ({
        sentiment: g?.sentiment ?? 'unknown',
        count: g?._count ?? 0,
      })) ?? [],
      productsByBrand: (brandGroups ?? [])?.map?.((g: any) => ({
        brand: g?.brand ?? 'Unknown',
        count: g?._count ?? 0,
      })) ?? [],
      reviewsBySource: (sourceGroups ?? [])?.map?.((g: any) => ({
        source: g?.source ?? 'unknown',
        count: g?._count ?? 0,
      })) ?? [],
      avgSentimentByBrand,
      sentimentTrends,
      pendingTriage,
    });
  } catch (err: any) {
    console.error('Analytics error:', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
