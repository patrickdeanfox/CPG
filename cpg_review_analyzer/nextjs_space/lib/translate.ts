// LLM-based language detection and translation

const LLM_API_URL = 'https://apps.abacus.ai/v1/chat/completions';

interface TranslationResult {
  translatedText: string;
  originalLanguage: string;
  isTranslated: boolean;
}

export async function detectAndTranslate(
  text: string,
  apiKey: string
): Promise<TranslationResult> {
  if (!text || text.trim().length < 5) {
    return { translatedText: text, originalLanguage: 'en', isTranslated: false };
  }

  try {
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You detect the language of text and translate non-English text to English. Return JSON only.',
          },
          {
            role: 'user',
            content: `Detect the language of this review text and translate it to English if it is not already in English.\n\nText: "${text.substring(0, 2000)}"\n\nRespond with raw JSON only, no code blocks:\n{\n  "isEnglish": true/false,\n  "originalLanguage": "language name (e.g., Spanish, French, English)",\n  "languageCode": "ISO 639-1 code (e.g., en, es, fr)",\n  "translatedText": "English translation if not English, or original text if already English"\n}`,
          },
        ],
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return { translatedText: text, originalLanguage: 'en', isTranslated: false };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);

    if (parsed?.isEnglish) {
      return { translatedText: text, originalLanguage: 'English', isTranslated: false };
    }

    return {
      translatedText: parsed?.translatedText ?? text,
      originalLanguage: parsed?.originalLanguage ?? 'Unknown',
      isTranslated: true,
    };
  } catch (err: any) {
    console.error('Translation error:', err?.message);
    return { translatedText: text, originalLanguage: 'en', isTranslated: false };
  }
}

// Batch translate multiple review texts
export async function batchDetectAndTranslate(
  reviews: { id: string; text: string }[],
  apiKey: string
): Promise<Map<string, TranslationResult>> {
  const results = new Map<string, TranslationResult>();
  if (!reviews.length) return results;

  // Process up to 10 reviews in a single LLM call for efficiency
  const chunks: { id: string; text: string }[][] = [];
  for (let i = 0; i < reviews.length; i += 10) {
    chunks.push(reviews.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    try {
      const reviewTexts = chunk
        .map((r, i) => `Review ${i + 1} (ID: ${r.id}): "${r.text.substring(0, 500)}"`)  
        .join('\n');

      const response = await fetch(LLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            {
              role: 'system',
              content: 'You detect languages and translate non-English text to English. Process multiple reviews. Return JSON only.',
            },
            {
              role: 'user',
              content: `For each review below, detect the language and translate to English if not already English.\n\n${reviewTexts}\n\nRespond with raw JSON only, no code blocks:\n{\n  "translations": [\n    {\n      "reviewId": "the review ID",\n      "isEnglish": true/false,\n      "originalLanguage": "language name",\n      "translatedText": "English translation or original if already English"\n    }\n  ]\n}`,
            },
          ],
          max_tokens: 6000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);

      for (const t of (parsed?.translations ?? [])) {
        results.set(t?.reviewId ?? '', {
          translatedText: t?.translatedText ?? '',
          originalLanguage: t?.originalLanguage ?? 'English',
          isTranslated: !t?.isEnglish,
        });
      }
    } catch (err: any) {
      console.error('Batch translation error:', err?.message);
    }
  }

  return results;
}
