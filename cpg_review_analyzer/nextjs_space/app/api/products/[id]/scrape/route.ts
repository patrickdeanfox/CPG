export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { scrapeReviews, detectSource, resolveUrl, extractAsin, getAmazonReviewsUrl } from '../../../../../lib/scraper';
import { extractReviewsWithLlm } from '../../../../../lib/llm-extractor';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({ where: { id: params?.id ?? '' } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const sourceUrl = product?.sourceUrl ?? '';
    if (!sourceUrl) {
      return NextResponse.json({ error: 'Product has no source URL' }, { status: 400 });
    }

    // Get ScraperAPI key from settings (optional)
    let scraperApiKey = '';
    try {
      const setting = await prisma.setting.findUnique({ where: { key: 'scraper_api_key' } });
      scraperApiKey = setting?.value ?? '';
    } catch { /* no setting found */ }

    // Resolve shortened URLs
    let resolvedUrl = sourceUrl;
    try {
      resolvedUrl = await resolveUrl(sourceUrl);
    } catch {
      // Keep original URL
    }

    const source = product?.source ?? detectSource(resolvedUrl);

    // Update the product's source URL if it was resolved to a different one
    if (resolvedUrl !== sourceUrl) {
      await prisma.product.update({
        where: { id: product.id },
        data: { sourceUrl: resolvedUrl, source: detectSource(resolvedUrl) },
      });
    }

    let totalNew = 0;
    let errors: string[] = [];
    let method = '';
    let scrapeLogs: string[] = [];

    // Step 1: Try HTML-based scraping (multiple strategies with retry)
    const { reviews: htmlReviews, htmlForLlm, strategy, logs } = await scrapeReviews(
      resolvedUrl,
      source,
      { scraperApiKey }
    );
    method = strategy;
    scrapeLogs = logs;

    let finalReviews = htmlReviews;

    // Step 2: If HTML scraping found nothing, try LLM extraction
    if (finalReviews.length === 0 && htmlForLlm && htmlForLlm.length > 100) {
      const apiKey = process.env.ABACUSAI_API_KEY ?? '';
      if (apiKey) {
        try {
          scrapeLogs.push('Attempting LLM-assisted review extraction...');
          const llmReviews = await extractReviewsWithLlm(
            htmlForLlm,
            product?.name ?? 'Unknown Product',
            source,
            apiKey
          );
          scrapeLogs.push(`LLM extraction found ${llmReviews.length} reviews`);
          if (llmReviews.length > 0) {
            finalReviews = llmReviews.map(r => ({
              reviewText: r.reviewText,
              rating: r.rating ?? null,
              reviewDate: null,
              reviewerName: r.reviewerName ?? 'Anonymous',
              source: source,
            }));
            method = 'llm_extraction';
          }
        } catch (llmErr: any) {
          console.error('LLM extraction failed:', llmErr?.message);
          errors.push('LLM extraction failed: ' + (llmErr?.message ?? 'Unknown error'));
          scrapeLogs.push('LLM extraction failed: ' + (llmErr?.message ?? ''));
        }
      } else {
        scrapeLogs.push('No API key available for LLM extraction');
      }
    }

    // Step 3: Save reviews to database
    for (const rev of finalReviews) {
      try {
        const existing = await prisma.review.findFirst({
          where: {
            productId: product.id,
            reviewText: { startsWith: rev.reviewText.substring(0, 100) },
          },
        });
        if (!existing) {
          await prisma.review.create({
            data: {
              productId: product.id,
              reviewText: rev.reviewText,
              rating: rev.rating,
              reviewDate: rev.reviewDate,
              source: rev.source || source,
              reviewerName: rev.reviewerName || 'Anonymous',
              sentiment: (rev as any).sentiment || null,
              analyzed: !!(rev as any).sentiment,
            },
          });
          totalNew++;
        }
      } catch (dupErr: any) {
        // skip duplicates
      }
    }

    scrapeLogs.push(`Saved ${totalNew} new reviews to database`);

    // Log the scrape attempt
    await prisma.scrapeLog.create({
      data: {
        productId: product.id,
        source,
        status: totalNew > 0 ? 'success' : 'no_reviews_found',
        reviewCount: totalNew,
        error: errors.length > 0 ? errors.join('; ') : (scrapeLogs.join(' | ')).substring(0, 500),
      },
    });

    // Build response message
    let message = '';
    if (totalNew > 0) {
      message = `Successfully scraped ${totalNew} new reviews using ${method === 'llm_extraction' ? 'AI-assisted extraction' : 'direct HTML parsing'}.`;
    } else {
      const tips: string[] = [];
      tips.push('Retailers use anti-bot protections that can block automated scraping.');
      if (!scraperApiKey) {
        tips.push('💡 Tip: Add a ScraperAPI key in Settings for more reliable scraping (free tier: 5,000 requests/month).');
      }
      tips.push('You can try again later or manually add reviews.');
      if (source === 'amazon') {
        const asin = extractAsin(resolvedUrl);
        if (asin) {
          tips.push(`ASIN: ${asin}`);
        }
      }
      message = `No new reviews could be extracted. ${tips.join(' ')}`;
    }

    return NextResponse.json({
      success: true,
      newReviews: totalNew,
      method,
      resolvedUrl,
      errors: errors.length > 0 ? errors : undefined,
      message,
      logs: scrapeLogs,
    });
  } catch (err: any) {
    console.error('Scrape error:', err?.message);
    return NextResponse.json({ error: err?.message ?? 'Scraping failed' }, { status: 500 });
  }
}