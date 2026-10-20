import { NextRequest, NextResponse } from 'next/server';

import { revalidateTag } from 'next/cache';

import { OutageSchema } from '@/lib/schemas/outage';
import { kv } from '@vercel/kv';

function redactSecret(raw: object): object {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'string' && (value.startsWith('$2b$') || value.startsWith('sk_live_') || value.startsWith('sk_live-') || value.startsWith('pk_live_') || value.startsWith('pk_live-'))) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = value;
  }
  return out;
}




export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (process.env.GEMINI_API_KEY) {
    if (bearer !== `Bearer ${process.env.GEMINI_API_KEY}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  } else {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on this project.' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = OutageSchema.array().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'body must be a JSON array of outage objects matching the schema.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Backdate servedAt so the stale Gemini cache entry is always older than manual rows.
  // on dedup, so manual rows win even while the Gemini cache entry is still valid.
  const servedAt = new Date(Date.now() - 60_000).toISOString();
  const rows = parsed.data.map((o) => redactSecret(o));

  try {
    await kv.set('manual-outages', { servedAt, rows });

    try {
      revalidateTag('gemini-outages');
    } catch (revalidateErr) {
      const message = revalidateErr instanceof Error ? revalidateErr.message : String(revalidateErr);
      console.warn('admin: failed to revalidate gemini-outages tag after manual override:', message);
    }
  } catch (writeErr) {
    const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
    return NextResponse.json(
      { error: `Could not save manual overrides to KV: ${message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, servedAt });
}

export async function GET(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (process.env.GEMINI_API_KEY) {
    if (bearer !== `Bearer ${process.env.GEMINI_API_KEY}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  try {
    const data = await kv.get<{ servedAt: string; rows: unknown[] }>('manual-outages');
    return NextResponse.json(
      data ?? { servedAt: new Date().toISOString(), rows: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (readErr) {
    const message = readErr instanceof Error ? readErr.message : String(readErr);
    return NextResponse.json(
      { error: `Could not read manual overrides from KV: ${message}` },
      { status: 500 },
    );
  }
}
