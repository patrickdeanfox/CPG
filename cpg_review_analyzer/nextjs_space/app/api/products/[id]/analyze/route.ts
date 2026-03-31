export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: params?.id ?? '' },
      include: { reviews: true },
    });

    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    const allReviews = product?.reviews ?? [];
    if (allReviews.length === 0) {
      return new Response(JSON.stringify({ error: 'No reviews found' }), { status: 400 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY ?? '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    const unanalyzedReviews = allReviews.filter(r => !r.analyzed);
    const hasUnanalyzed = unanalyzedReviews.length > 0;
    const totalSteps = hasUnanalyzed ? 3 : 2; // translate check + per-review + product-level

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* skip */ }
        };

        try {
          let step = 1;

          // Step 1: Per-review sentiment analysis (only for unanalyzed reviews)
          let updatedCount = 0;
          if (hasUnanalyzed) {
            send({
              status: 'progress',
              step,
              totalSteps,
              message: `Step ${step}/${totalSteps}: Analyzing sentiment for ${unanalyzedReviews.length} reviews...`,
              percentage: Math.round((step / totalSteps) * 100 * 0.5),
            });

            const reviewTexts = unanalyzedReviews.map((r, i) =>
              `Review ${i + 1} (ID: ${r.id}): "${(r.reviewText ?? '').substring(0, 500)}"`
            ).join('\n');

            const sentimentMessages = [
              {
                role: 'system',
                content: 'You are a CPG product review analyst. Analyze each review and determine sentiment (positive, negative, or neutral) with a confidence score between 0 and 1. Return JSON only.',
              },
              {
                role: 'user',
                content: `Analyze the sentiment of these product reviews for "${product.name}" by ${product.brand || 'Unknown Brand'}:\n\n${reviewTexts}\n\nRespond with raw JSON only. No code blocks or markdown.\nStructure:\n{\n  "analyses": [\n    {\n      "reviewId": "the review ID",\n      "sentiment": "positive|negative|neutral",\n      "confidence": 0.95,\n      "summary": "Brief summary of key points"\n    }\n  ]\n}`,
              },
            ];

            try {
              const sentResult = await callLlmNonStreaming(apiKey, sentimentMessages, 4000);
              const parsed = JSON.parse(sentResult);
              const analyses = parsed?.analyses ?? [];
              for (const a of analyses) {
                try {
                  await prisma.review.update({
                    where: { id: a?.reviewId ?? '' },
                    data: {
                      sentiment: a?.sentiment ?? 'neutral',
                      sentimentScore: a?.confidence ?? 0,
                      aiAnalysis: a?.summary ?? '',
                      analyzed: true,
                    },
                  });
                  updatedCount++;
                } catch { /* skip */ }
              }
            } catch (err: any) {
              console.error('Per-review analysis error:', err?.message);
              send({ status: 'progress', step, totalSteps, message: 'Per-review analysis had issues, continuing...' });
            }
            step++;
          }

          // Step 2: Product-level analysis (all reviews)
          send({
            status: 'progress',
            step,
            totalSteps,
            message: `Step ${step}/${totalSteps}: Generating product-level insights...`,
            percentage: Math.round((step / totalSteps) * 100 * 0.8),
          });

          const freshReviews = await prisma.review.findMany({
            where: { productId: product.id },
            orderBy: { createdAt: 'desc' },
          });

          const allReviewTexts = freshReviews.map((r, i) => {
            const parts = [`Review ${i + 1}`];
            if (r.rating != null) parts.push(`Rating: ${r.rating}/5`);
            parts.push(`Source: ${r.source}`);
            if (r.sentiment) parts.push(`Sentiment: ${r.sentiment}`);
            parts.push(`Text: "${(r.reviewText ?? '').substring(0, 300)}"`);
            return parts.join(' | ');
          }).join('\n');

          const productAnalysisMessages = [
            {
              role: 'system',
              content: `You are a senior CPG (Consumer Packaged Goods) product analyst. Analyze ALL the reviews holistically and provide actionable business insights.`,
            },
            {
              role: 'user',
              content: `Perform a comprehensive analysis of ALL ${freshReviews.length} reviews for "${product.name}" by ${product.brand || 'Unknown Brand'} (${product.source}).\n\n${allReviewTexts}\n\nProvide a comprehensive product analysis as raw JSON (no code blocks or markdown). Use this exact structure:\n{\n  "overallSentiment": "positive|negative|neutral|mixed",\n  "sentimentScore": 0.75,\n  "totalReviews": ${freshReviews.length},\n  "sentimentBreakdown": { "positive": 0, "negative": 0, "neutral": 0 },\n  "summary": "2-3 sentence executive summary",\n  "themes": [\n    {\n      "theme": "Theme name",\n      "count": 5,\n      "sentiment": "positive|negative|mixed",\n      "examples": ["quote"]\n    }\n  ],\n  "actionableInsights": [\n    {\n      "category": "Category",\n      "priority": "high|medium|low",\n      "insight": "Clear recommendation",\n      "evidence": ["supporting quote"]\n    }\n  ]\n}\n\nInclude at least 3-5 actionable insights.`,
            },
          ];

          let productAnalysis: any = null;
          try {
            const result = await callLlmNonStreaming(apiKey, productAnalysisMessages, 6000);
            productAnalysis = JSON.parse(result);

            await prisma.product.update({
              where: { id: product.id },
              data: { aiProductAnalysis: JSON.stringify(productAnalysis) },
            });
          } catch (err: any) {
            console.error('Product analysis error:', err?.message);
            send({ status: 'error', message: 'Failed to generate product analysis: ' + (err?.message ?? 'Unknown error') });
            controller.close();
            return;
          }

          // Final
          send({
            status: 'completed',
            result: {
              updatedCount,
              totalReviews: freshReviews.length,
              productAnalysis,
            },
          });
        } catch (err: any) {
          console.error('Analysis stream error:', err?.message);
          send({ status: 'error', message: err?.message ?? 'Analysis failed' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Analyze error:', err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? 'Analysis failed' }), { status: 500 });
  }
}

async function callLlmNonStreaming(apiKey: string, messages: any[], maxTokens: number): Promise<string> {
  const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '{}';
}
