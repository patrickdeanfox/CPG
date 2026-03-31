export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { scrapeProductDetails, detectSource, resolveUrl, extractAsin, getAmazonProductUrl, fetchPage, extractRelevantHtml } from '../../../lib/scraper';
import { extractProductWithLlm } from '../../../lib/llm-extractor';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req?.url ?? 'http://localhost:3000');
    const brand = url?.searchParams?.get?.('brand') ?? '';
    const source = url?.searchParams?.get?.('source') ?? '';
    const sort = url?.searchParams?.get?.('sort') ?? 'createdAt';
    const order = url?.searchParams?.get?.('order') ?? 'desc';
    const page = parseInt(url?.searchParams?.get?.('page') ?? '1') || 1;
    const limit = parseInt(url?.searchParams?.get?.('limit') ?? '20') || 20;

    const where: any = {};
    if (brand) where.brand = { contains: brand, mode: 'insensitive' };
    if (source) where.source = source;

    const products = await prisma.product.findMany({
      where,
      include: {
        _count: { select: { reviews: true } },
        reviews: {
          select: { sentiment: true, source: true },
        },
      },
      orderBy: { [sort]: order },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.product.count({ where });

    const enriched = (products ?? []).map((p: any) => {
      const revs = p?.reviews ?? [];
      const sourceCounts: Record<string, number> = {};
      let posCount = 0, negCount = 0, neuCount = 0;
      revs.forEach((r: any) => {
        sourceCounts[r?.source ?? 'unknown'] = (sourceCounts[r?.source ?? 'unknown'] ?? 0) + 1;
        if (r?.sentiment === 'positive') posCount++;
        else if (r?.sentiment === 'negative') negCount++;
        else if (r?.sentiment === 'neutral') neuCount++;
      });
      const { reviews, ...rest } = p ?? {};
      return {
        ...(rest ?? {}),
        reviewCount: p?._count?.reviews ?? 0,
        sourceCounts,
        sentimentCounts: { positive: posCount, negative: negCount, neutral: neuCount },
      };
    });

    return NextResponse.json({ products: enriched, total, page, limit });
  } catch (err: any) {
    console.error('GET products error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req?.json?.();
    const { url, name, brand, upc, price, size, imageUrl } = body ?? {};

    let productData: any = {
      name: name ?? 'New Product',
      brand: brand ?? '',
      upc: upc ?? '',
      price: price ? parseFloat(price) : null,
      size: size ?? '',
      imageUrl: imageUrl ?? '',
      sourceUrl: url ?? '',
      source: detectSource(url ?? ''),
      description: '',
    };

    if (url) {
      try {
        // Get ScraperAPI key from settings (optional)
        let scraperApiKey = '';
        try {
          const setting = await prisma.setting.findUnique({ where: { key: 'scraper_api_key' } });
          scraperApiKey = setting?.value ?? '';
        } catch { /* no setting found */ }

        // Step 1: Resolve shortened URLs (a.co, amzn.to, etc.)
        let resolvedUrl = url;
        try {
          resolvedUrl = await resolveUrl(url);
        } catch {
          // Keep original
        }

        // Step 2: Try Cheerio-based scraping
        const scraped = await scrapeProductDetails(resolvedUrl, { scraperApiKey });
        const finalUrl = scraped.resolvedUrl || resolvedUrl;
        const finalSource = detectSource(finalUrl);

        productData = {
          name: scraped?.name || name || 'New Product',
          brand: scraped?.brand || brand || '',
          upc: scraped?.upc || upc || '',
          price: scraped?.price ?? (price ? parseFloat(price) : null),
          size: scraped?.size || size || '',
          imageUrl: scraped?.imageUrl || imageUrl || '',
          sourceUrl: finalUrl,
          source: finalSource,
          description: scraped?.description || '',
        };

        // Step 3: If Cheerio got very little, try LLM extraction
        if (!productData.name || productData.name === 'New Product' || productData.name === 'Unknown Product') {
          const apiKey = process.env.ABACUSAI_API_KEY ?? '';
          if (apiKey) {
            const { html } = await fetchPage(finalUrl, { scraperApiKey });
            if (html && html.length > 200) {
              const relevantHtml = extractRelevantHtml(html, finalSource);
              const llmProduct = await extractProductWithLlm(relevantHtml, finalUrl, finalSource, apiKey);
              productData = {
                name: llmProduct.name || productData.name || 'New Product',
                brand: llmProduct.brand || productData.brand || brand || '',
                upc: productData.upc || upc || '',
                price: llmProduct.price ?? productData.price,
                size: llmProduct.size || productData.size || size || '',
                imageUrl: llmProduct.imageUrl || productData.imageUrl || imageUrl || '',
                sourceUrl: finalUrl,
                source: finalSource,
                description: llmProduct.description || productData.description || '',
              };
            }
          }
        }
      } catch (scrapeErr: any) {
        console.error('Scrape failed, using manual data:', scrapeErr?.message);
      }
    }

    const product = await prisma.product.create({ data: productData });
    return NextResponse.json(product, { status: 201 });
  } catch (err: any) {
    console.error('POST product error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Failed to create product' }, { status: 500 });
  }
}
