export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { batchDetectAndTranslate } from '../../../../../lib/translate';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params?.id ?? '' },
      include: { reviews: true },
    });

    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY ?? '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    // Find reviews that haven't been checked for translation yet
    const untranslatedReviews = product.reviews.filter(r => !r.isTranslated && (!r.originalLanguage || r.originalLanguage === ''));

    if (untranslatedReviews.length === 0) {
      return new Response(JSON.stringify({ message: 'All reviews already processed for translation', translated: 0 }));
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* skip */ }
        };

        try {
          send({ status: 'progress', message: `Checking ${untranslatedReviews.length} reviews for translation...`, step: 0, totalSteps: 2 });

          const reviewInputs = untranslatedReviews.map(r => ({ id: r.id, text: r.reviewText }));
          const translations = await batchDetectAndTranslate(reviewInputs, apiKey);

          send({ status: 'progress', message: 'Saving translations...', step: 1, totalSteps: 2 });

          let translatedCount = 0;
          for (const [reviewId, result] of translations) {
            try {
              if (result.isTranslated) {
                const original = untranslatedReviews.find(r => r.id === reviewId);
                await prisma.review.update({
                  where: { id: reviewId },
                  data: {
                    reviewText: result.translatedText,
                    originalText: original?.reviewText ?? '',
                    originalLanguage: result.originalLanguage,
                    isTranslated: true,
                  },
                });
                translatedCount++;
              } else {
                await prisma.review.update({
                  where: { id: reviewId },
                  data: {
                    originalLanguage: 'English',
                    isTranslated: false,
                  },
                });
              }
            } catch { /* skip */ }
          }

          send({
            status: 'completed',
            message: `Translation complete! ${translatedCount} review${translatedCount !== 1 ? 's' : ''} translated to English.`,
            translated: translatedCount,
            checked: untranslatedReviews.length,
          });
        } catch (err: any) {
          console.error('Translation error:', err?.message);
          send({ status: 'error', message: err?.message ?? 'Translation failed' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
