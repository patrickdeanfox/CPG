export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { extractReviewsWithLlm } from '../../../../../lib/llm-extractor';
import { detectAndTranslate } from '../../../../../lib/translate';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DiagFn = (store: string, level: 'info' | 'warn' | 'error' | 'success', message: string, detail?: any) => void;
type SendFn = (data: any) => void;

interface StoreSearchResult {
  result: { source: string; productName: string | null; url: string | null; newReviews: number; error: string | null };
  newCount: number;
  finalStep: number;
}

/* ------------------------------------------------------------------ */
/*  LLM-powered search query variations                                */
/* ------------------------------------------------------------------ */

/**
 * Use LLM to generate multiple search query variations from a product name,
 * progressively simpler so at least one is likely to match.
 */
async function generateQueryVariations(
  brand: string,
  name: string,
  apiKey: string,
  diag: DiagFn
): Promise<string[]> {
  const rawQuery = `${brand} ${name}`.trim();
  const simplified = simplifySearchQuery(rawQuery);

  // Always include the simplified version as first attempt
  const variations = [simplified];

  try {
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You generate search query variations for finding products on retail sites. Return JSON only.',
          },
          {
            role: 'user',
            content: `Generate 3 search query variations for this product, from most specific to most generic.
The queries will be used on Walmart.com and Target.com search boxes.

Brand: ${brand}
Full name: ${name}

Rules:
- Each query should be shorter/simpler than the last
- Remove SKU numbers, pack sizes, quantity info
- The most generic query should be just the brand + core product type (2-4 words)
- Do NOT include packaging details like "value pack", "2 devices", "pack of 4"
- Focus on what a human would type to find this product

Respond with raw JSON:
{"queries": ["most specific", "medium", "most generic"]}`,
          },
        ],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);
      const llmQueries = parsed?.queries ?? [];
      if (Array.isArray(llmQueries)) {
        for (const q of llmQueries) {
          if (typeof q === 'string' && q.trim() && !variations.includes(q.trim())) {
            variations.push(q.trim());
          }
        }
      }
    }
  } catch (err: any) {
    diag('system', 'warn', `LLM query variation generation failed: ${err?.message}`);
  }

  // Always add a super-generic fallback: just brand + first 2 product words
  const brandWords = brand.split(/\s+/);
  const nameWords = name.replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
  const genericFallback = [...brandWords, ...nameWords.slice(0, 2)].join(' ').trim();
  if (genericFallback && !variations.includes(genericFallback)) {
    variations.push(genericFallback);
  }

  diag('system', 'info', `Generated ${variations.length} query variations`, { variations });
  return variations;
}

/* ------------------------------------------------------------------ */
/*  Search query simplification (regex-based, no LLM)                  */
/* ------------------------------------------------------------------ */

function simplifySearchQuery(raw: string): string {
  let q = raw;
  q = q.replace(/\([^)]*\)/g, '');
  q = q.replace(/\s*-\s*[A-Z0-9]{3,}[-A-Z0-9]*/gi, '');
  q = q.replace(/,?\s*\d+\s*(individually|count|pack|ct|oz|fl\s*oz|ml|g|kg|lb|lbs|sheets|wipes|bags|boxes|cans|bottles|rolls|capsules|tablets|pieces|pcs|units|devices|cartridges|refills|replacement)\b[^,]*/gi, '');
  q = q.replace(/,\s*\d+(\.[0-9]+)?\s*(oz|fl\s*oz|ml|g|kg|lb|lbs|l|gal)\b/gi, '');
  q = q.replace(/\b(value pack|variety pack|family pack|bulk pack|multi[- ]?pack|bonus pack)\b/gi, '');
  q = q.replace(/[,;]/g, ' ');
  const words = q.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(w);
    }
  }
  return deduped.slice(0, 8).join(' ').trim();
}

/* ------------------------------------------------------------------ */
/*  Store configuration                                                */
/* ------------------------------------------------------------------ */

const STORE_LABELS: Record<string, string> = {
  amazon: 'Amazon', walmart: 'Walmart', target: 'Target',
};

const STORE_BASE_URLS: Record<string, string> = {
  amazon: 'https://www.amazon.com',
  walmart: 'https://www.walmart.com',
  target: 'https://www.target.com',
};

const SCRAPER_API_BASE = 'https://api.scraperapi.com';

/* ------------------------------------------------------------------ */
/*  Google search fallback — find product URL via Google                */
/* ------------------------------------------------------------------ */

/**
 * Use ScraperAPI's Google search to find a product URL on a specific store.
 * This is much more reliable than searching on the store directly because
 * Google handles fuzzy matching much better.
 */
async function findProductUrlViaGoogle(
  scraperKey: string,
  query: string,
  store: string,
  diag: DiagFn
): Promise<{ url: string; title: string } | null> {
  const siteDomain = STORE_BASE_URLS[store]?.replace('https://', '') ?? '';
  const googleQuery = `${query} site:${siteDomain}`;

  diag(store, 'info', `Google fallback: searching "${googleQuery}"`);

  const params = new URLSearchParams({
    api_key: scraperKey,
    url: `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`,
    render: 'false',
    output_format: 'markdown',
  });

  try {
    const res = await fetch(`${SCRAPER_API_BASE}/?${params.toString()}`, {
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      diag(store, 'warn', `Google search failed: ${res.status}`);
      return null;
    }

    const markdown = await res.text();
    diag(store, 'info', `Google results received`, { contentLength: markdown.length });

    // Extract URLs from markdown links matching the store domain
    const urlPatterns: Record<string, RegExp> = {
      amazon: /https?:\/\/(?:www\.)?amazon\.com\/[^\s)"]+\/(?:dp|gp\/product)\/[A-Z0-9]{10}/gi,
      walmart: /https?:\/\/(?:www\.)?walmart\.com\/ip\/[^\s)"]+/gi,
      target: /https?:\/\/(?:www\.)?target\.com\/p\/[^\s)"]+/gi,
    };

    const pattern = urlPatterns[store];
    if (!pattern) return null;

    pattern.lastIndex = 0;
    const match = pattern.exec(markdown);
    if (match?.[0]) {
      // Clean the URL — remove trailing markdown characters
      let url = match[0].replace(/[)"\]>]+$/, '');
      diag(store, 'success', `Google found product URL: ${url.substring(0, 100)}`);

      // Try to extract a title from nearby markdown
      const idx = markdown.indexOf(url);
      let title = '';
      if (idx > 0) {
        const before = markdown.substring(Math.max(0, idx - 200), idx);
        const titleMatch = before.match(/\[([^\]]+)\]\s*$/);
        title = titleMatch?.[1] ?? '';
      }

      return { url, title };
    }

    diag(store, 'warn', 'Google search returned no matching product URLs');
    return null;
  } catch (err: any) {
    diag(store, 'warn', `Google search error: ${err?.message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await prisma.product.findUnique({ where: { id: params?.id ?? '' } });
    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), { status: 404 });
    }

    let scraperApiKey = '';
    try {
      const setting = await prisma.setting.findUnique({ where: { key: 'scraper_api_key' } });
      scraperApiKey = setting?.value ?? '';
    } catch { /* skip */ }

    if (!scraperApiKey) {
      return new Response(JSON.stringify({ error: 'ScraperAPI key not configured. Please add it in Settings.' }), { status: 400 });
    }

    const apiKey = process.env.ABACUSAI_API_KEY ?? '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LLM API key not configured' }), { status: 500 });
    }

    const currentSource = product.source ?? '';
    const storesToSearch = Object.keys(STORE_LABELS).filter(s => s !== currentSource);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const results: any[] = [];
        const diagnostics: any[] = [];
        let totalNewReviews = 0;
        const totalSteps = storesToSearch.length * 3;
        let currentStep = 0;

        const send: SendFn = (data) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
        };

        const diag: DiagFn = (store, level, message, detail?) => {
          const entry = { ts: new Date().toISOString(), store, level, message, ...(detail ? { detail } : {}) };
          diagnostics.push(entry);
          send({ status: 'diagnostic', entry });
        };

        try {
          // Generate query variations using LLM
          const queryVariations = await generateQueryVariations(
            product.brand ?? '',
            product.name,
            apiKey,
            diag
          );

          send({
            status: 'progress',
            step: 0,
            totalSteps,
            message: `Searching ${storesToSearch.length} stores with ${queryVariations.length} query variations...`,
            storeProgress: storesToSearch.map(s => ({ store: s, label: STORE_LABELS[s] ?? s, status: 'pending' })),
          });

          for (const store of storesToSearch) {
            const storeLabel = STORE_LABELS[store] ?? store;
            try {
              let stepResult: StoreSearchResult | null = null;

              if (store === 'amazon') {
                stepResult = await searchAmazonWithRetry(scraperApiKey, apiKey, queryVariations, product, storeLabel, diag, send, () => ++currentStep, totalSteps);
              } else if (store === 'walmart') {
                stepResult = await searchWalmartWithRetry(scraperApiKey, apiKey, queryVariations, product, storeLabel, diag, send, () => ++currentStep, totalSteps);
              } else if (store === 'target') {
                stepResult = await searchTargetWithRetry(scraperApiKey, apiKey, queryVariations, product, storeLabel, diag, send, () => ++currentStep, totalSteps);
              }

              if (stepResult) {
                results.push(stepResult.result);
                totalNewReviews += stepResult.newCount;
                currentStep = Math.max(currentStep, stepResult.finalStep);
              } else {
                currentStep += 3;
                results.push({ source: store, productName: null, url: null, newReviews: 0, error: 'Unsupported store' });
              }

              // Log to scrape log
              const lastRes = results[results.length - 1];
              await prisma.scrapeLog.create({
                data: {
                  productId: product.id,
                  source: store,
                  status: lastRes.newReviews > 0 ? 'success' : lastRes.error ? 'error' : 'no_reviews_found',
                  reviewCount: lastRes.newReviews ?? 0,
                  error: lastRes.error ?? `Cross-store search`,
                },
              });
            } catch (err: any) {
              console.error(`Cross-search ${store} error:`, err?.message);
              diag(store, 'error', `Unhandled error: ${err?.message}`);
              results.push({ source: store, productName: null, url: null, newReviews: 0, error: err?.message ?? 'Unknown error' });
              send({ status: 'progress', step: currentStep, totalSteps, message: `${storeLabel}: ${err?.message ?? 'Error'}`, currentStore: store, storeStatus: 'error' });
            }
          }

          diag('system', 'success', `Search complete. Total new reviews: ${totalNewReviews}`, { results });
          send({ status: 'completed', results, totalNewReviews, diagnostics });
        } catch (err: any) {
          console.error('Cross-search error:', err?.message);
          diag('system', 'error', `Fatal error: ${err?.message}`);
          send({ status: 'error', message: err?.message ?? 'Cross-store search failed', diagnostics });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  } catch (err: any) {
    console.error('Cross-search error:', err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? 'Cross-store search failed' }), { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  Amazon: Structured API with multi-query retry + Google fallback    */
/* ------------------------------------------------------------------ */

async function searchAmazonWithRetry(
  scraperKey: string,
  llmKey: string,
  queries: string[],
  product: any,
  storeLabel: string,
  diag: DiagFn,
  send: SendFn,
  nextStep: () => number,
  totalSteps: number
): Promise<StoreSearchResult> {
  let step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Searching ${storeLabel}...`, currentStore: 'amazon', storeStatus: 'searching' });

  // Try each query variation with the structured Amazon Search API
  let topResult: any = null;
  let asin: string | null = null;

  for (const query of queries) {
    diag('amazon', 'info', `Trying query: "${query}"`);
    try {
      const searchEndpoint = `${SCRAPER_API_BASE}/structured/amazon/search?api_key=${scraperKey}&query=${encodeURIComponent(query)}&country_code=us`;
      const res = await fetch(searchEndpoint, { signal: AbortSignal.timeout(60000) });
      diag('amazon', 'info', `Search response: ${res.status}`);

      if (res.ok) {
        const searchData = await res.json();
        const results = searchData?.results ?? searchData?.organic_results ?? [];
        diag('amazon', 'info', `Results for "${query}": ${results.length} items`);

        if (results.length > 0) {
          topResult = results[0];
          asin = topResult?.asin ?? extractAsinFromUrl(topResult?.url ?? '');
          if (asin) {
            diag('amazon', 'success', `Found product: ${topResult?.name?.substring(0, 80)}`, { asin, query });
            break;
          }
        }
      }
    } catch (err: any) {
      diag('amazon', 'warn', `Query "${query}" failed: ${err?.message}`);
    }
  }

  // Google fallback if structured API found nothing
  if (!asin) {
    diag('amazon', 'info', 'Structured API returned no results. Trying Google fallback...');
    const googleResult = await findProductUrlViaGoogle(scraperKey, queries[queries.length - 1] ?? queries[0], 'amazon', diag);
    if (googleResult?.url) {
      asin = extractAsinFromUrl(googleResult.url);
      if (asin) {
        topResult = { name: googleResult.title, url: googleResult.url, asin };
        diag('amazon', 'success', `Google found ASIN: ${asin}`);
      }
    }
  }

  if (!asin) {
    diag('amazon', 'warn', 'Product not found on Amazon after all attempts');
    step = nextStep(); step = nextStep();
    send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Product not found`, currentStore: 'amazon', storeStatus: 'not_found' });
    return { result: { source: 'amazon', productName: null, url: null, newReviews: 0, error: 'Product not found after trying multiple queries + Google' }, newCount: 0, finalStep: step };
  }

  // Step 2: Fetch product + reviews via structured endpoint
  step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Fetching ${storeLabel} reviews (ASIN: ${asin})...`, currentStore: 'amazon', storeStatus: 'extracting' });

  const productEndpoint = `${SCRAPER_API_BASE}/structured/amazon/product?api_key=${scraperKey}&asin=${asin}&country_code=us`;
  diag('amazon', 'info', 'Calling Amazon Product API', { asin });

  let productData: any;
  try {
    const res = await fetch(productEndpoint, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      const errText = await res.text();
      diag('amazon', 'error', `Product API failed: ${res.status}`, { body: errText.substring(0, 300) });
      step = nextStep();
      send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Product API failed`, currentStore: 'amazon', storeStatus: 'error' });
      return { result: { source: 'amazon', productName: topResult?.name, url: topResult?.url, newReviews: 0, error: `Product API returned ${res.status}` }, newCount: 0, finalStep: step };
    }
    productData = await res.json();
    const reviewCount = productData?.reviews?.length ?? productData?.top_reviews?.length ?? 0;
    diag('amazon', 'info', `Product data received`, { name: productData?.name?.substring(0, 80), reviewCount });
  } catch (err: any) {
    diag('amazon', 'error', `Product request failed: ${err.message}`);
    step = nextStep();
    return { result: { source: 'amazon', productName: topResult?.name, url: topResult?.url, newReviews: 0, error: err.message }, newCount: 0, finalStep: step };
  }

  // Step 3: Save reviews
  step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Saving ${storeLabel} reviews...`, currentStore: 'amazon', storeStatus: 'scraping' });

  const rawReviews = productData?.reviews ?? productData?.top_reviews ?? [];
  const newCount = await saveReviews(rawReviews, product, 'amazon', llmKey, diag);

  const productUrl = topResult?.url ? (topResult.url.startsWith('http') ? topResult.url : `https://www.amazon.com${topResult.url}`) : `https://www.amazon.com/dp/${asin}`;

  diag('amazon', 'success', `Saved ${newCount} new reviews`);
  send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Found ${newCount} new reviews`, currentStore: 'amazon', storeStatus: newCount > 0 ? 'success' : 'no_reviews' });

  return { result: { source: 'amazon', productName: productData?.name ?? topResult?.name, url: productUrl, newReviews: newCount, error: null }, newCount, finalStep: step };
}

function extractAsinFromUrl(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
  return match?.[1] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Walmart: Structured API with multi-query retry + Google fallback   */
/* ------------------------------------------------------------------ */

async function searchWalmartWithRetry(
  scraperKey: string,
  llmKey: string,
  queries: string[],
  product: any,
  storeLabel: string,
  diag: DiagFn,
  send: SendFn,
  nextStep: () => number,
  totalSteps: number
): Promise<StoreSearchResult> {
  let step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Searching ${storeLabel}...`, currentStore: 'walmart', storeStatus: 'searching' });

  let topResult: any = null;
  let walmartProductId: string | null = null;
  let productUrl: string | null = null;

  // Try each query variation with structured Walmart Search API
  for (const query of queries) {
    diag('walmart', 'info', `Trying query: "${query}"`);
    try {
      const searchEndpoint = `${SCRAPER_API_BASE}/structured/walmart/search?api_key=${scraperKey}&query=${encodeURIComponent(query)}`;
      const res = await fetch(searchEndpoint, { signal: AbortSignal.timeout(60000) });
      diag('walmart', 'info', `Search response: ${res.status}`);

      if (res.ok) {
        const searchData = await res.json();
        const results = searchData?.results ?? searchData?.organic_results ?? [];
        diag('walmart', 'info', `Results for "${query}": ${results.length} items`);

        if (results.length > 0) {
          topResult = results[0];
          walmartProductId = topResult?.product_id ?? topResult?.id ?? extractWalmartIdFromUrl(topResult?.url ?? topResult?.link ?? '');
          productUrl = topResult?.url ?? topResult?.link ?? (walmartProductId ? `https://www.walmart.com/ip/${walmartProductId}` : null);
          if (walmartProductId) {
            diag('walmart', 'success', `Found product: ${(topResult?.title ?? topResult?.name)?.substring(0, 80)}`, { productId: walmartProductId, query });
            break;
          }
        }
      }
    } catch (err: any) {
      diag('walmart', 'warn', `Query "${query}" failed: ${err?.message}`);
    }
  }

  // Google fallback
  if (!walmartProductId) {
    diag('walmart', 'info', 'Structured API returned no results. Trying Google fallback...');
    const googleResult = await findProductUrlViaGoogle(scraperKey, queries[queries.length - 1] ?? queries[0], 'walmart', diag);
    if (googleResult?.url) {
      walmartProductId = extractWalmartIdFromUrl(googleResult.url);
      productUrl = googleResult.url;
      if (walmartProductId) {
        topResult = { title: googleResult.title, url: googleResult.url };
        diag('walmart', 'success', `Google found Walmart ID: ${walmartProductId}`);
      }
    }
  }

  if (!walmartProductId) {
    diag('walmart', 'warn', 'Product not found on Walmart after all attempts');
    step = nextStep(); step = nextStep();
    send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Product not found`, currentStore: 'walmart', storeStatus: 'not_found' });
    return { result: { source: 'walmart', productName: null, url: null, newReviews: 0, error: 'Product not found after trying multiple queries + Google' }, newCount: 0, finalStep: step };
  }

  // Step 2: Fetch reviews via structured endpoint
  step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Fetching ${storeLabel} reviews (ID: ${walmartProductId})...`, currentStore: 'walmart', storeStatus: 'extracting' });

  const reviewEndpoint = `${SCRAPER_API_BASE}/structured/walmart/review?api_key=${scraperKey}&product_id=${walmartProductId}`;
  diag('walmart', 'info', 'Calling Walmart Review API', { productId: walmartProductId });

  let reviewData: any;
  try {
    const res = await fetch(reviewEndpoint, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      const errText = await res.text();
      diag('walmart', 'error', `Review API failed: ${res.status}`, { body: errText.substring(0, 300) });
      // Fallback: try scraping the product page for reviews
      diag('walmart', 'info', 'Falling back to page scraping for reviews...');
      const scrapedResult = await scrapeProductPageForReviews(scraperKey, llmKey, productUrl ?? '', product, 'walmart', diag);
      step = nextStep();
      send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Found ${scrapedResult} new reviews (scraped)`, currentStore: 'walmart', storeStatus: scrapedResult > 0 ? 'success' : 'no_reviews' });
      return { result: { source: 'walmart', productName: topResult?.title ?? topResult?.name, url: productUrl, newReviews: scrapedResult, error: null }, newCount: scrapedResult, finalStep: step };
    }
    reviewData = await res.json();
    diag('walmart', 'info', `Review data received`, { reviewCount: reviewData?.reviews?.length ?? 0 });
  } catch (err: any) {
    diag('walmart', 'error', `Review request failed: ${err.message}`);
    step = nextStep();
    return { result: { source: 'walmart', productName: topResult?.title, url: productUrl, newReviews: 0, error: err.message }, newCount: 0, finalStep: step };
  }

  // Step 3: Save reviews
  step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Saving ${storeLabel} reviews...`, currentStore: 'walmart', storeStatus: 'scraping' });

  const rawReviews = reviewData?.reviews ?? [];
  const newCount = await saveReviews(rawReviews, product, 'walmart', llmKey, diag);

  diag('walmart', 'success', `Saved ${newCount} new reviews`);
  send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Found ${newCount} new reviews`, currentStore: 'walmart', storeStatus: newCount > 0 ? 'success' : 'no_reviews' });

  return { result: { source: 'walmart', productName: topResult?.title ?? topResult?.name, url: productUrl, newReviews: newCount, error: null }, newCount, finalStep: step };
}

function extractWalmartIdFromUrl(url: string): string | null {
  const match = url.match(/\/ip\/(?:[^/]*\/)?(\d+)/);
  return match?.[1] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Target: Google fallback + generic scraping (no structured API)     */
/* ------------------------------------------------------------------ */

async function searchTargetWithRetry(
  scraperKey: string,
  llmKey: string,
  queries: string[],
  product: any,
  storeLabel: string,
  diag: DiagFn,
  send: SendFn,
  nextStep: () => number,
  totalSteps: number
): Promise<StoreSearchResult> {
  let step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Searching ${storeLabel}...`, currentStore: 'target', storeStatus: 'searching' });

  let productUrl: string | null = null;

  // Strategy 1: Try Target's own search with each query variation
  for (const query of queries) {
    diag('target', 'info', `Trying Target search: "${query}"`);
    try {
      const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`;
      const searchContent = await fetchWithScraperApi(scraperKey, searchUrl);

      if (searchContent && searchContent.length > 200) {
        diag('target', 'info', `Search page received (${searchContent.length} chars)`);
        const TARGET_PATTERN = /\(\s*((?:https?:\/\/[^)]*target\.com)?\/p\/[^)\s]+)\s*\)/gi;
        TARGET_PATTERN.lastIndex = 0;
        const match = TARGET_PATTERN.exec(searchContent);
        if (match?.[1]) {
          productUrl = match[1].trim();
          if (!productUrl.startsWith('http')) {
            productUrl = `https://www.target.com${productUrl.startsWith('/') ? '' : '/'}${productUrl}`;
          }
          diag('target', 'success', `Found product URL via Target search: ${productUrl.substring(0, 100)}`);
          break;
        }

        // Try LLM extraction
        const llmUrl = await extractProductUrlWithLlm(llmKey, searchContent, product.name, product.brand ?? '', 'target');
        if (llmUrl) {
          productUrl = llmUrl.startsWith('http') ? llmUrl : `https://www.target.com${llmUrl.startsWith('/') ? '' : '/'}${llmUrl}`;
          diag('target', 'success', `Found product URL via LLM: ${productUrl.substring(0, 100)}`);
          break;
        }
      }
    } catch (err: any) {
      diag('target', 'warn', `Target search failed for "${query}": ${err?.message}`);
    }
  }

  // Strategy 2: Google fallback
  if (!productUrl) {
    diag('target', 'info', 'Target search failed for all queries. Trying Google fallback...');
    const googleResult = await findProductUrlViaGoogle(scraperKey, queries[queries.length - 1] ?? queries[0], 'target', diag);
    if (googleResult?.url) {
      productUrl = googleResult.url;
      diag('target', 'success', `Google found Target URL: ${productUrl.substring(0, 100)}`);
    }
  }

  if (!productUrl) {
    diag('target', 'warn', 'Product not found on Target after all attempts');
    step = nextStep(); step = nextStep();
    send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Product not found`, currentStore: 'target', storeStatus: 'not_found' });
    return { result: { source: 'target', productName: null, url: null, newReviews: 0, error: 'Product not found after trying multiple queries + Google' }, newCount: 0, finalStep: step };
  }

  // Step 2 & 3: Fetch product page and extract reviews via LLM
  step = nextStep();
  send({ status: 'progress', step, totalSteps, message: `Extracting reviews from ${storeLabel}...`, currentStore: 'target', storeStatus: 'scraping' });

  const newCount = await scrapeProductPageForReviews(scraperKey, llmKey, productUrl, product, 'target', diag);

  step = nextStep();
  diag('target', 'success', `Saved ${newCount} new reviews`);
  send({ status: 'progress', step, totalSteps, message: `${storeLabel}: Found ${newCount} new reviews`, currentStore: 'target', storeStatus: newCount > 0 ? 'success' : 'no_reviews' });

  return { result: { source: 'target', productName: product.name, url: productUrl, newReviews: newCount, error: null }, newCount, finalStep: step };
}

/* ------------------------------------------------------------------ */
/*  Shared: scrape a product page + LLM extract reviews                */
/* ------------------------------------------------------------------ */

async function scrapeProductPageForReviews(
  scraperKey: string,
  llmKey: string,
  url: string,
  product: any,
  source: string,
  diag: DiagFn
): Promise<number> {
  if (!url) return 0;

  diag(source, 'info', `Scraping product page: ${url.substring(0, 100)}`);

  let productHtml: string;
  try {
    productHtml = await fetchWithScraperApi(scraperKey, url);
    diag(source, 'info', `Product page received (${productHtml.length} chars)`);
  } catch (err: any) {
    diag(source, 'error', `Product page fetch failed: ${err.message}`);
    return 0;
  }

  if (!productHtml || productHtml.length < 200) {
    diag(source, 'warn', 'Product page too short');
    return 0;
  }

  diag(source, 'info', 'Calling LLM to extract reviews...');
  const llmReviews = await extractReviewsWithLlm(productHtml.substring(0, 50000), product.name, source, llmKey);
  diag(source, 'info', `LLM extracted ${llmReviews.length} reviews`);

  let newCount = 0;
  for (const rev of llmReviews) {
    try {
      const existing = await prisma.review.findFirst({
        where: { productId: product.id, reviewText: { startsWith: rev.reviewText.substring(0, 100) } },
      });
      if (!existing) {
        const translation = await detectAndTranslate(rev.reviewText, llmKey);
        await prisma.review.create({
          data: {
            productId: product.id,
            reviewText: translation.isTranslated ? translation.translatedText : rev.reviewText,
            originalText: translation.isTranslated ? rev.reviewText : '',
            originalLanguage: translation.originalLanguage,
            isTranslated: translation.isTranslated,
            rating: rev.rating ?? null,
            source,
            reviewerName: rev.reviewerName ?? 'Anonymous',
            sentiment: rev.sentiment ?? null,
            analyzed: !!rev.sentiment,
          },
        });
        newCount++;
      }
    } catch (e: any) {
      diag(source, 'warn', `Failed to save review: ${e?.message}`);
    }
  }

  return newCount;
}

/* ------------------------------------------------------------------ */
/*  Shared: save structured reviews (Amazon/Walmart JSON)              */
/* ------------------------------------------------------------------ */

async function saveReviews(
  rawReviews: any[],
  product: any,
  source: string,
  llmKey: string,
  diag: DiagFn
): Promise<number> {
  diag(source, 'info', `Processing ${rawReviews.length} reviews from structured data`);

  let newCount = 0;
  for (const rev of rawReviews) {
    try {
      const reviewText = rev?.review ?? rev?.body ?? rev?.text ?? '';
      if (!reviewText || reviewText.length < 5) continue;

      const existing = await prisma.review.findFirst({
        where: { productId: product.id, reviewText: { startsWith: reviewText.substring(0, 100) } },
      });
      if (!existing) {
        const rating = rev?.rating != null ? parseFloat(String(rev.rating)) : null;
        const translation = await detectAndTranslate(reviewText, llmKey);
        await prisma.review.create({
          data: {
            productId: product.id,
            reviewText: translation.isTranslated ? translation.translatedText : reviewText,
            originalText: translation.isTranslated ? reviewText : '',
            originalLanguage: translation.originalLanguage,
            isTranslated: translation.isTranslated,
            rating,
            source,
            reviewerName: rev?.author ?? rev?.reviewer ?? rev?.userNickname ?? 'Anonymous',
            sentiment: null,
            analyzed: false,
          },
        });
        newCount++;
      }
    } catch (e: any) {
      diag(source, 'warn', `Failed to save review: ${e?.message}`);
    }
  }

  return newCount;
}

/* ------------------------------------------------------------------ */
/*  Generic ScraperAPI fetch (markdown output)                         */
/* ------------------------------------------------------------------ */

async function fetchWithScraperApi(apiKey: string, url: string): Promise<string> {
  const params = new URLSearchParams({
    api_key: apiKey,
    url,
    render: 'true',
    output_format: 'markdown',
  });

  const scraperUrl = `https://api.scraperapi.com/?${params.toString()}`;
  const res = await fetch(scraperUrl, { signal: AbortSignal.timeout(90000) });

  if (!res.ok) {
    throw new Error(`ScraperAPI returned ${res.status}`);
  }

  return await res.text();
}

/* ------------------------------------------------------------------ */
/*  LLM fallback for Target URL extraction                             */
/* ------------------------------------------------------------------ */

async function extractProductUrlWithLlm(
  apiKey: string,
  searchContent: string,
  productName: string,
  brand: string,
  store: string
): Promise<string | null> {
  const trimmed = searchContent.substring(0, 30000);
  const baseUrl = STORE_BASE_URLS[store] ?? '';

  const messages = [
    { role: 'system', content: 'You extract product URLs from search result pages. Return JSON only.' },
    {
      role: 'user',
      content: `From this ${store} search results page (markdown format), find the URL for "${brand} ${productName}".

- URLs may be relative paths like /p/product-name/-/A-12345
- Return the URL exactly as found — relative or absolute.
- Pick the CLOSEST matching product.

Base domain: ${baseUrl}

Page content (truncated):
${trimmed}

Respond with raw JSON:
{"url": "the product URL or null", "productName": "matched product name"}`,
    },
  ];

  try {
    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4.1-mini', messages, max_tokens: 500, response_format: { type: 'json_object' } }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const url = parsed?.url ?? null;
    if (url && typeof url === 'string' && url !== 'null') return url;
    return null;
  } catch {
    return null;
  }
}
