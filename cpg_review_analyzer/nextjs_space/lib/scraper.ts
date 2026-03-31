import * as cheerio from 'cheerio';

export interface ScrapedProduct {
  name: string;
  brand: string;
  price: number | null;
  size: string;
  imageUrl: string;
  upc: string;
  description: string;
  source: string;
}

export interface ScrapedReview {
  reviewText: string;
  rating: number | null;
  reviewDate: Date | null;
  reviewerName: string;
  source: string;
}

// Realistic browser user agents - rotated across retries
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Mobile user agents - Amazon is often less strict with mobile
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
];

function getUA(index: number): string {
  return USER_AGENTS[index % USER_AGENTS.length] ?? USER_AGENTS[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Detect source from URL - handles shortened URLs like a.co, amzn.to
export function detectSource(url: string): string {
  const u = (url ?? '').toLowerCase();
  if (u.includes('amazon') || u.includes('amzn.to') || u.includes('amzn.com') || u.includes('a.co')) return 'amazon';
  if (u.includes('walmart')) return 'walmart';
  if (u.includes('target.com')) return 'target';
  if (u.includes('google') && u.includes('shopping')) return 'google_shopping';
  return 'unknown';
}

// Resolve shortened/redirect URLs to get the final destination
export async function resolveUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': getUA(0),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': getUA(1) },
        signal: AbortSignal.timeout(10000),
      });
      return res.url || url;
    } catch {
      return url;
    }
  }
}

// Extract ASIN from Amazon URLs
export function extractAsin(url: string): string | null {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product-reviews\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})/i,
    /\/(B[A-Z0-9]{9})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Build Amazon reviews page URL from ASIN
export function getAmazonReviewsUrl(asin: string, page: number = 1): string {
  return `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews&pageNumber=${page}&sortBy=recent`;
}

// Build Amazon product URL from ASIN
export function getAmazonProductUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

// Detect if HTML is a CAPTCHA / robot check page
function isCaptchaPage(html: string): boolean {
  if (!html || html.length < 100) return false;
  const lower = html.toLowerCase();
  return (
    lower.includes('captcha') ||
    lower.includes('robot check') ||
    lower.includes('type the characters') ||
    lower.includes('sorry, we just need to make sure') ||
    lower.includes('enter the characters you see below') ||
    (lower.includes('automated access') && lower.includes('blocked'))
  );
}

// Fetch using ScraperAPI proxy (free tier: 5,000 requests/month)
async function fetchViaScraperApi(url: string, apiKey: string): Promise<{ html: string; finalUrl: string }> {
  const scraperUrl = `http://api.scraperapi.com?api_key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(url)}&render=false&country_code=us`;
  try {
    console.log('[ScraperAPI] Fetching:', url);
    const res = await fetch(scraperUrl, {
      signal: AbortSignal.timeout(60000), // ScraperAPI can be slow
    });
    if (!res.ok) {
      console.error('[ScraperAPI] HTTP', res.status);
      return { html: '', finalUrl: url };
    }
    const html = await res.text();
    console.log('[ScraperAPI] Got', html.length, 'bytes');
    return { html: html ?? '', finalUrl: url };
  } catch (err: any) {
    console.error('[ScraperAPI] Error:', err?.message);
    return { html: '', finalUrl: url };
  }
}

// Build full set of browser-like headers for a given user agent
function buildHeaders(ua: string): Record<string, string> {
  const isMobile = ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android');
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': isMobile ? '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"' : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': isMobile ? '"Android"' : '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
  };
}

// Enhanced fetch with retry logic, rotating user agents, and delays
export async function fetchPage(
  url: string,
  options?: { scraperApiKey?: string; maxRetries?: number }
): Promise<{ html: string; finalUrl: string; method: string }> {
  const maxRetries = options?.maxRetries ?? 3;
  const scraperApiKey = options?.scraperApiKey ?? '';

  // Strategy 1: Direct fetch with retries and rotating user agents
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Add delay between retries (exponential backoff + jitter)
    if (attempt > 0) {
      const delay = (1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 1000);
      console.log(`[Fetch] Retry ${attempt}/${maxRetries}, waiting ${delay}ms...`);
      await sleep(delay);
    }

    const ua = getUA(attempt);
    const headers = buildHeaders(ua);
    const isMobile = ua.includes('Mobile');

    try {
      console.log(`[Fetch] Attempt ${attempt + 1}/${maxRetries} for ${url} (${isMobile ? 'mobile' : 'desktop'} UA)`);
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000), // 30s timeout for large pages
      });

      console.log(`[Fetch] Status: ${res.status}, URL: ${res.url}`);

      if (res.status === 503 || res.status === 429) {
        console.log(`[Fetch] Rate limited (${res.status}), will retry...`);
        continue;
      }

      const html = await res.text();
      console.log(`[Fetch] Got ${html.length} bytes`);

      // Check if we got a CAPTCHA page
      if (isCaptchaPage(html)) {
        console.log('[Fetch] CAPTCHA detected, will retry with different UA...');
        continue;
      }

      // Check if we got a meaningful page (not a redirect/error stub)
      if (html.length > 5000) {
        return { html, finalUrl: res.url || url, method: `direct_fetch_attempt_${attempt + 1}` };
      }

      console.log(`[Fetch] Response too small (${html.length} bytes), will retry...`);
    } catch (err: any) {
      console.error(`[Fetch] Attempt ${attempt + 1} error:`, err?.message);
    }
  }

  // Strategy 2: If ScraperAPI key is configured, use it as fallback
  if (scraperApiKey) {
    console.log('[Fetch] All direct attempts failed, trying ScraperAPI...');
    const result = await fetchViaScraperApi(url, scraperApiKey);
    if (result.html.length > 5000 && !isCaptchaPage(result.html)) {
      return { ...result, method: 'scraper_api' };
    }
  }

  console.error('[Fetch] All strategies failed for', url);
  return { html: '', finalUrl: url, method: 'failed' };
}

// Extract product details from HTML using Cheerio
export async function scrapeProductDetails(
  url: string,
  options?: { scraperApiKey?: string }
): Promise<ScrapedProduct & { resolvedUrl: string }> {
  const resolvedUrl = await resolveUrl(url);
  const source = detectSource(resolvedUrl);

  let product: ScrapedProduct & { resolvedUrl: string } = {
    name: '',
    brand: '',
    price: null,
    size: '',
    imageUrl: '',
    upc: '',
    description: '',
    source,
    resolvedUrl,
  };

  let fetchUrl = resolvedUrl;
  if (source === 'amazon') {
    const asin = extractAsin(resolvedUrl);
    if (asin) {
      fetchUrl = getAmazonProductUrl(asin);
      product.resolvedUrl = fetchUrl;
    }
  }

  const { html } = await fetchPage(fetchUrl, { scraperApiKey: options?.scraperApiKey });
  if (!html || html.length < 200) {
    return product;
  }

  const $ = cheerio.load(html);

  try {
    if (source === 'amazon') {
      product.name = $('#productTitle')?.text()?.trim() ?? $('h1 span')?.first()?.text()?.trim() ?? '';
      product.brand = $('a#bylineInfo')?.text()?.replace(/Visit the|Brand:|Store/gi, '')?.trim() ?? '';
      if (!product.brand) {
        product.brand = $('tr.po-brand td.po-break-word span')?.text()?.trim() ?? '';
      }
      const priceWhole = $('span.a-price-whole')?.first()?.text()?.trim()?.replace(/[^0-9]/g, '') ?? '';
      const priceFraction = $('span.a-price-fraction')?.first()?.text()?.trim() ?? '00';
      if (priceWhole) product.price = parseFloat(`${priceWhole}.${priceFraction}`) || null;
      product.imageUrl = $('#imgTagWrapperId img')?.attr('src') ?? $('#landingImage')?.attr('src') ?? $('#main-image')?.attr('src') ?? '';
      product.description = $('#feature-bullets ul')?.text()?.trim()?.substring(0, 500) ?? '';
      $('tr.po-size, tr.po-item_package_dimensions')?.each((_, el) => {
        if (!product.size) {
          product.size = $(el)?.find('td.po-break-word span')?.text()?.trim() ?? '';
        }
      });
    } else if (source === 'walmart') {
      product.name = $('h1[itemprop="name"]')?.text()?.trim() ?? $('h1')?.first()?.text()?.trim() ?? '';
      product.brand = $('a[itemprop="brand"] span')?.text()?.trim() ?? $('[data-testid="product-brand"] a')?.text()?.trim() ?? '';
      const wprice = $('span[itemprop="price"]')?.attr('content') ?? $('[data-testid="price-wrap"] span')?.first()?.text()?.replace(/[^0-9.]/g, '') ?? '';
      if (wprice) product.price = parseFloat(wprice) || null;
      product.imageUrl = $('img[data-testid="hero-image"]')?.attr('src') ?? $('meta[property="og:image"]')?.attr('content') ?? '';
    } else if (source === 'target') {
      product.name = $('h1[data-test="product-title"]')?.text()?.trim() ?? $('h1')?.first()?.text()?.trim() ?? '';
      product.brand = $('a[data-test="product-brand-link"]')?.text()?.trim() ?? '';
      const tprice = $('[data-test="product-price"]')?.text()?.replace(/[^0-9.]/g, '') ?? '';
      if (tprice) product.price = parseFloat(tprice) || null;
      product.imageUrl = $('meta[property="og:image"]')?.attr('content') ?? '';
    }

    // Fallback from meta tags
    if (!product.name) {
      product.name = $('meta[property="og:title"]')?.attr('content') ?? $('title')?.text()?.trim() ?? 'Unknown Product';
    }
    if (!product.imageUrl) {
      product.imageUrl = $('meta[property="og:image"]')?.attr('content') ?? '';
    }
    if (!product.brand && product.name) {
      const parts = product.name.split(' ');
      product.brand = parts[0] ?? '';
    }
    if (!product.description) {
      product.description = $('meta[name="description"]')?.attr('content') ?? $('meta[property="og:description"]')?.attr('content') ?? '';
    }
  } catch (err: any) {
    console.error('Scrape product error:', err?.message);
  }

  return product;
}

// Extract reviews from HTML using Cheerio selectors
function extractReviewsFromHtml(html: string, source: string): ScrapedReview[] {
  const reviews: ScrapedReview[] = [];
  if (!html || html.length < 200) return reviews;

  const $ = cheerio.load(html);

  try {
    if (source === 'amazon') {
      // Strategy A: standard review hooks
      $('[data-hook="review"]').each((_, el) => {
        const text = $(el).find('[data-hook="review-body"] span')?.text()?.trim() ?? $(el).find('[data-hook="review-body"]')?.text()?.trim() ?? '';
        const ratingText = $(el).find('[data-hook="review-star-rating"] span, .a-icon-alt')?.first()?.text() ?? '';
        const rating = parseFloat(ratingText?.split(' ')?.[0] ?? '0') || null;
        const name = $(el).find('.a-profile-name')?.text()?.trim() ?? 'Anonymous';
        const dateStr = $(el).find('[data-hook="review-date"]')?.text()?.trim() ?? '';
        if (text && text.length > 5) {
          reviews.push({
            reviewText: text.substring(0, 2000),
            rating,
            reviewDate: dateStr ? new Date(dateStr.replace(/.*on /, '')) : null,
            reviewerName: name,
            source: 'amazon',
          });
        }
      });

      // Strategy B: reviews list format
      if (reviews.length === 0) {
        $('.review').each((_, el) => {
          const text = $(el).find('.review-text, .review-text-content')?.text()?.trim() ?? '';
          const ratingText = $(el).find('.review-rating .a-icon-alt, .a-icon-star .a-icon-alt')?.text() ?? '';
          const rating = parseFloat(ratingText?.split(' ')?.[0] ?? '0') || null;
          const name = $(el).find('.a-profile-name, .review-byline a')?.text()?.trim() ?? 'Anonymous';
          if (text && text.length > 5) {
            reviews.push({
              reviewText: text.substring(0, 2000),
              rating,
              reviewDate: null,
              reviewerName: name,
              source: 'amazon',
            });
          }
        });
      }

      // Strategy C: Try extracting from JSON-LD or embedded data
      if (reviews.length === 0) {
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const json = JSON.parse($(el).html() ?? '{}');
            const revs = json?.review ?? json?.reviews ?? [];
            const items = Array.isArray(revs) ? revs : [revs];
            for (const r of items) {
              const text = r?.reviewBody ?? r?.description ?? r?.text ?? '';
              if (text && text.length > 5) {
                reviews.push({
                  reviewText: String(text).substring(0, 2000),
                  rating: parseFloat(r?.reviewRating?.ratingValue ?? r?.rating ?? '0') || null,
                  reviewDate: r?.datePublished ? new Date(r.datePublished) : null,
                  reviewerName: r?.author?.name ?? r?.author ?? 'Anonymous',
                  source: 'amazon',
                });
              }
            }
          } catch { /* skip malformed JSON */ }
        });
      }
    } else if (source === 'walmart') {
      $('[itemprop="review"], [data-testid="review-card"]').each((_, el) => {
        const text = $(el).find('[itemprop="reviewBody"], [data-testid="review-text"]')?.text()?.trim() ?? '';
        const ratingVal = $(el).find('[itemprop="ratingValue"]')?.attr('content') ?? '';
        const name = $(el).find('[itemprop="author"], [data-testid="review-author"]')?.text()?.trim() ?? 'Anonymous';
        if (text && text.length > 5) {
          reviews.push({
            reviewText: text.substring(0, 2000),
            rating: parseFloat(ratingVal) || null,
            reviewDate: null,
            reviewerName: name,
            source: 'walmart',
          });
        }
      });
    } else if (source === 'target') {
      $('[data-test="review-card"], .review-card').each((_, el) => {
        const text = $(el).find('[data-test="review-text"], .review-text')?.text()?.trim() ?? '';
        if (text && text.length > 5) {
          reviews.push({
            reviewText: text.substring(0, 2000),
            rating: null,
            reviewDate: null,
            reviewerName: 'Anonymous',
            source: 'target',
          });
        }
      });
    }
  } catch (err: any) {
    console.error('HTML review extraction error:', err?.message);
  }

  return reviews;
}

// Extract relevant HTML portions for LLM analysis
export function extractRelevantHtml(html: string, source: string): string {
  if (!html || html.length < 100) return '';

  const $ = cheerio.load(html);
  const parts: string[] = [];

  // 1. JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html() ?? '';
    if (content && (content.includes('review') || content.includes('Review') || content.includes('rating') || content.includes('Rating') || content.includes('Product'))) {
      parts.push('JSON-LD DATA:\n' + content.substring(0, 10000));
    }
  });

  // 2. Inline JSON data with reviews
  $('script:not([src])').each((_, el) => {
    const content = $(el).html() ?? '';
    if (content.length > 50 && content.length < 50000) {
      if (content.includes('review') || content.includes('Review')) {
        const jsonMatches = content.match(/\{[^{}]*"review[^{}]*\}/gi);
        if (jsonMatches) {
          parts.push('SCRIPT DATA (review-related):\n' + jsonMatches.join('\n').substring(0, 15000));
        }
      }
    }
  });

  // 3. Meta tags
  const metaInfo: string[] = [];
  $('meta[property], meta[name]').each((_, el) => {
    const prop = $(el).attr('property') ?? $(el).attr('name') ?? '';
    const content = $(el).attr('content') ?? '';
    if (content && (prop.includes('title') || prop.includes('description') || prop.includes('product') || prop.includes('price') || prop.includes('brand'))) {
      metaInfo.push(`${prop}: ${content}`);
    }
  });
  if (metaInfo.length > 0) {
    parts.push('META TAGS:\n' + metaInfo.join('\n'));
  }

  // 4. Review-specific HTML sections
  const reviewSelectors = [
    '[data-hook="review"]', '.review', '#customer_review_list',
    '#cm_cr-review_list', '.reviews-content', '[data-testid="review-card"]',
    '[itemprop="review"]', '.review-card', '#reviews',
    '.cr-widget-FocalReviews', '#reviewsMedley',
  ];

  for (const sel of reviewSelectors) {
    const elements = $(sel);
    if (elements.length > 0) {
      const reviewHtml = elements.map((_, el) => $(el).text().trim()).get().join('\n---\n');
      if (reviewHtml.length > 10) {
        parts.push(`REVIEW SECTION (${sel}):\n${reviewHtml.substring(0, 20000)}`);
      }
    }
  }

  // 5. Title and key product info
  const title = $('title').text().trim();
  const h1 = $('h1').first().text().trim();
  if (title) parts.unshift(`PAGE TITLE: ${title}`);
  if (h1 && h1 !== title) parts.unshift(`H1: ${h1}`);

  const result = parts.join('\n\n');
  return result.substring(0, 60000);
}

// Main review scraping function - tries multiple strategies
export async function scrapeReviews(
  url: string,
  source: string,
  options?: { scraperApiKey?: string }
): Promise<{ reviews: ScrapedReview[]; htmlForLlm: string; strategy: string; logs: string[] }> {
  let reviews: ScrapedReview[] = [];
  let htmlForLlm = '';
  let strategy = 'none';
  const logs: string[] = [];

  const fetchOpts = { scraperApiKey: options?.scraperApiKey };

  // Strategy 1: Direct product page
  logs.push(`Fetching product page: ${url}`);
  const { html: directHtml, method: fetchMethod } = await fetchPage(url, fetchOpts);
  logs.push(`Fetch result: ${directHtml.length} bytes via ${fetchMethod}`);

  if (isCaptchaPage(directHtml)) {
    logs.push('CAPTCHA detected on product page');
  }

  reviews = extractReviewsFromHtml(directHtml, source);
  if (reviews.length > 0) {
    strategy = `direct_html (${fetchMethod})`;
    logs.push(`Found ${reviews.length} reviews from product page`);
    return { reviews, htmlForLlm: '', strategy, logs };
  }

  // Save HTML for potential LLM extraction
  htmlForLlm = extractRelevantHtml(directHtml, source);
  logs.push(`Extracted ${htmlForLlm.length} chars of relevant HTML for LLM`);

  // Strategy 2: For Amazon, try the dedicated reviews page
  if (source === 'amazon') {
    const asin = extractAsin(url);
    if (asin) {
      const reviewsUrl = getAmazonReviewsUrl(asin);
      logs.push(`Fetching Amazon reviews page: ${reviewsUrl}`);

      // Add a small delay before second request to avoid rate limiting
      await sleep(1500 + Math.floor(Math.random() * 1000));

      const { html: reviewsHtml, method: revMethod } = await fetchPage(reviewsUrl, fetchOpts);
      logs.push(`Reviews page: ${reviewsHtml.length} bytes via ${revMethod}`);

      if (isCaptchaPage(reviewsHtml)) {
        logs.push('CAPTCHA detected on reviews page');
      }

      reviews = extractReviewsFromHtml(reviewsHtml, source);
      if (reviews.length > 0) {
        strategy = `amazon_reviews_page (${revMethod})`;
        logs.push(`Found ${reviews.length} reviews from reviews page`);
        return { reviews, htmlForLlm: '', strategy, logs };
      }

      // Combine HTML for LLM
      const reviewsRelevant = extractRelevantHtml(reviewsHtml, source);
      if (reviewsRelevant.length > htmlForLlm.length) {
        htmlForLlm = reviewsRelevant;
      } else if (reviewsRelevant.length > 100) {
        htmlForLlm += '\n\nAMAZON REVIEWS PAGE:\n' + reviewsRelevant;
      }
      logs.push(`Combined HTML for LLM: ${htmlForLlm.length} chars`);
    }
  }

  // Strategy 3: Return HTML for LLM processing
  strategy = 'needs_llm';
  logs.push('All HTML strategies exhausted, falling back to LLM extraction');
  return { reviews, htmlForLlm: htmlForLlm.substring(0, 60000), strategy, logs };
}