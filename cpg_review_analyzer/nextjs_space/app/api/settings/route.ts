export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.setting.findMany();
    const obj: Record<string, string> = {};
    (settings ?? [])?.forEach?.((s: any) => {
      obj[s?.key ?? ''] = s?.value ?? '';
    });
    return NextResponse.json(obj);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req?.json?.();
    const entries = Object.entries(body ?? {});
    for (const [key, value] of entries) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value ?? '') },
        create: { key, value: String(value ?? '') },
      });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
