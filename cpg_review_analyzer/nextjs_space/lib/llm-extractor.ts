// LLM-assisted extraction of product details and reviews from HTML

const LLM_API_URL = 'https://apps.abacus.ai/v1/chat/completions';

interface LlmReview {
  reviewText: string;
  rating: number | null;
  reviewerName: string;
  sentiment?: string;
}

interface LlmProductInfo {
  name: string;
  brand: string;
  price: number | null;
  size: string;
  description: string;
  imageUrl: string;
}

async function callLlm(messages: any[], apiKey: string, maxTokens: number = 4000): Promise<string> {
  const response = await fetch(LLM_API_URL, {
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
    throw new Error(`LLM API error: ${errText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// Use LLM to extract reviews from HTML content
export async function extractReviewsWithLlm(
  htmlContent: string,
  productName: string,
  source: string,
  apiKey: string
): Promise<LlmReview[]> {
  if (!htmlContent || htmlContent.length < 50) return [];

  // Truncate HTML to fit within LLM context
  const truncatedHtml = htmlContent.substring(0, 50000);

  const messages = [
    {
      role: 'system',
      content: `You are an expert at extracting product review data from web page content. You will be given raw HTML/text content from a product page. Extract as many individual customer reviews as you can find. If no reviews are present in the content, return an empty array. Be thorough - look in JSON-LD data, script tags, and HTML content for reviews.`,
    },
    {
      role: 'user',
      content: `Extract all customer reviews from this ${source} product page for "${productName}". Look carefully in all sections including JSON-LD data, script data, and HTML content.

PAGE CONTENT:
${truncatedHtml}

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting. Use this exact structure:
{
  "reviews": [
    {
      "reviewText": "The actual review text",
      "rating": 4.5,
      "reviewerName": "Reviewer name or Anonymous",
      "sentiment": "positive|negative|neutral"
    }
  ],
  "totalReviewsFound": 0,
  "note": "Any notes about the extraction"
}`,
    },
  ];

  try {
    const result = await callLlm(messages, apiKey, 4000);
    const parsed = JSON.parse(result);
    return (parsed?.reviews ?? []).filter((r: any) => r?.reviewText && r.reviewText.length > 5);
  } catch (err: any) {
    console.error('LLM review extraction error:', err?.message);
    return [];
  }
}

// Use LLM to extract product details from HTML content
export async function extractProductWithLlm(
  htmlContent: string,
  url: string,
  source: string,
  apiKey: string
): Promise<LlmProductInfo> {
  const emptyResult: LlmProductInfo = { name: '', brand: '', price: null, size: '', description: '', imageUrl: '' };
  if (!htmlContent || htmlContent.length < 50) return emptyResult;

  const truncatedHtml = htmlContent.substring(0, 30000);

  const messages = [
    {
      role: 'system',
      content: 'You are an expert at extracting product information from web page content. Extract product details accurately from the given HTML/text content.',
    },
    {
      role: 'user',
      content: `Extract product details from this ${source} page (${url}):

${truncatedHtml}

Respond with raw JSON only. Do not include code blocks, markdown, or any other formatting. Use this exact structure:
{
  "name": "Full product name",
  "brand": "Brand name",
  "price": 9.99,
  "size": "Size/weight info",
  "description": "Product description (max 500 chars)",
  "imageUrl": "Product image URL if found"
}`,
    },
  ];

  try {
    const result = await callLlm(messages, apiKey, 2000);
    const parsed = JSON.parse(result);
    return {
      name: parsed?.name ?? '',
      brand: parsed?.brand ?? '',
      price: parsed?.price ?? null,
      size: parsed?.size ?? '',
      description: (parsed?.description ?? '').substring(0, 500),
      imageUrl: parsed?.imageUrl ?? '',
    };
  } catch (err: any) {
    console.error('LLM product extraction error:', err?.message);
    return emptyResult;
  }
}
