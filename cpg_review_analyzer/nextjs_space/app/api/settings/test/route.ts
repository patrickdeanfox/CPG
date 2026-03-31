export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ABACUSAI_API_KEY ?? '';
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API key not configured in environment' }, { status: 400 });
    }

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: 'Say "API connection successful" in exactly those words.' }],
        max_tokens: 50,
      }),
    });

    if (response?.ok) {
      const data = await response?.json?.();
      const msg = data?.choices?.[0]?.message?.content ?? 'Connected';
      return NextResponse.json({ success: true, message: msg });
    } else {
      const errText = await response?.text?.() ?? 'Unknown error';
      return NextResponse.json({ success: false, error: `API returned ${response?.status}: ${errText}` });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? 'Connection failed' });
  }
}
