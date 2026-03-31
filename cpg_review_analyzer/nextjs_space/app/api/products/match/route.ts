export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '../../../../lib/prisma';

// PUT: manual match — create a match between two specific products
export async function PUT(req: NextRequest) {
  try {
    const { productAId, productBId, matchType } = await req.json();
    if (!productAId || !productBId) {
      return new Response(JSON.stringify({ error: 'Both product IDs required' }), { status: 400 });
    }
    const existing = await prisma.productMatch.findUnique({
      where: { productAId_productBId: { productAId, productBId } },
    });
    if (existing) {
      return new Response(JSON.stringify({ error: 'Match already exists', id: existing.id }), { status: 409 });
    }
    const match = await prisma.productMatch.create({
      data: {
        productAId,
        productBId,
        matchType: matchType ?? 'exact',
        confidence: 1.0,
        matchReason: 'Manually linked by user',
        approved: true,
      },
    });
    return new Response(JSON.stringify({ success: true, id: match.id }), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ABACUSAI_API_KEY ?? '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    const products = await prisma.product.findMany({
      select: { id: true, name: true, brand: true, upc: true, price: true, size: true, source: true },
    });

    if ((products?.length ?? 0) < 2) {
      return new Response(JSON.stringify({ error: 'Need at least 2 products for matching' }), { status: 400 });
    }

    const productList = (products ?? []).map((p: any) =>
      `ID: ${p?.id}, Name: ${p?.name}, Brand: ${p?.brand}, UPC: ${p?.upc ?? 'N/A'}, Price: $${p?.price ?? 'N/A'}, Size: ${p?.size ?? 'N/A'}, Source: ${p?.source}`
    ).join('\n');

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* skip */ }
        };

        try {
          send({ status: 'progress', step: 1, totalSteps: 2, message: 'AI is analyzing products for matches...', percentage: 25 });

          const messages = [
            {
              role: 'system',
              content: 'You are a CPG product matching expert. Match products that are the same item across different retailers or variants (different sizes/quantities of the same product). Return JSON only.',
            },
            {
              role: 'user',
              content: `Find matching products (same product across different retailers or different sizes/variants of the same product):\n\n${productList}\n\nRespond with raw JSON only. Do not include code blocks, markdown, or any other formatting.\nUse this structure:\n{\n  "matches": [\n    {\n      "productAId": "id1",\n      "productBId": "id2",\n      "matchType": "exact|variant|similar",\n      "confidence": 0.95,\n      "reason": "Why these match",\n      "isVariant": false\n    }\n  ]\n}\n\nMatch types:\n- exact: Same product, same size, different retailer\n- variant: Same product, different size/quantity (e.g., 30-pack vs 100-pack)\n- similar: Similar products that might be matches\n\nSet isVariant=true when products are the same base product in different sizes/quantities.`,
            },
          ];

          const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4.1-mini',
              messages,
              max_tokens: 3000,
              response_format: { type: 'json_object' },
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            send({ status: 'error', message: `AI API error: ${errText}` });
            controller.close();
            return;
          }

          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(content);
          const matches = parsed?.matches ?? [];

          send({ status: 'progress', step: 2, totalSteps: 2, message: `Found ${matches.length} potential matches. Saving...`, percentage: 75 });

          // Save ALL matches — DO NOT auto-approve. All go to pending state for user review.
          let saved = 0;
          const savedMatches: any[] = [];
          for (const m of matches) {
            try {
              // Check if match already exists
              const existing = await prisma.productMatch.findUnique({
                where: {
                  productAId_productBId: {
                    productAId: m?.productAId ?? '',
                    productBId: m?.productBId ?? '',
                  },
                },
              });

              if (!existing) {
                const created = await prisma.productMatch.create({
                  data: {
                    productAId: m?.productAId ?? '',
                    productBId: m?.productBId ?? '',
                    matchType: m?.matchType ?? 'unknown',
                    confidence: m?.confidence ?? 0,
                    matchReason: m?.reason ?? '',
                    approved: false, // Never auto-approve, let user decide
                  },
                });
                saved++;
                savedMatches.push({ ...m, id: created.id });
              } else {
                savedMatches.push({ ...m, id: existing.id, existing: true });
              }
            } catch (e: any) { /* skip */ }
          }

          // Also enrich with product details for the UI
          const enrichedMatches = await Promise.all(
            savedMatches.map(async (m: any) => {
              try {
                const [productA, productB] = await Promise.all([
                  prisma.product.findUnique({
                    where: { id: m.productAId },
                    select: { id: true, name: true, brand: true, size: true, price: true, source: true, imageUrl: true },
                  }),
                  prisma.product.findUnique({
                    where: { id: m.productBId },
                    select: { id: true, name: true, brand: true, size: true, price: true, source: true, imageUrl: true },
                  }),
                ]);
                return { ...m, productA, productB };
              } catch {
                return m;
              }
            })
          );

          send({
            status: 'completed',
            result: {
              matches: enrichedMatches,
              savedCount: saved,
              totalMatches: matches.length,
            },
          });
        } catch (err: any) {
          send({ status: 'error', message: err?.message ?? 'Matching failed' });
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
