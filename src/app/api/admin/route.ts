import { NextRequest, NextResponse } from 'next/server';

import { revalidateTag } from 'next/cache';

import { OutageSchema } from '@/lib/schemas/outage';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

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

function unauthorized(body: { error: string }) {
  return NextResponse.json(body, { status: 401 });
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

function badRequest(errorMessage: string, issues?: Array<{ path: (string | number)[]; message: string }>) {
  return NextResponse.json(
    { error: errorMessage, issues },
    { status: 400 },
  );
}

function ok(body: { ok: true; servedAt: string }) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (process.env.GEMINI_API_KEY) {
    if (bearer !== `Bearer ${process.env.GEMINI_API_KEY}`) {
      return unauthorized({ error: 'Unauthorized. Please check your GEMINI_API_KEY.' });
    }
  } else {
    return serverError('GEMINI_API_KEY is not configured on this project.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const parsed = OutageSchema.array().safeParse(body);
  if (!parsed.success) {
    console.error('Admin Override Validation Failed:', JSON.stringify(parsed.error.issues, null, 2));

    return badRequest('body must be a JSON array of outage objects matching the schema.', parsed.error.issues);
  }

  // Backdate servedAt so the stale Gemini cache entry is always older than manual rows.
  // on dedup, so manual rows win even while the Gemini cache entry is still valid.
  const servedAt = new Date(Date.now() - 60_000).toISOString();
  const rows = parsed.data.map((o) => redactSecret(o));

  try {
    await redis.set('manual-outages', { servedAt, rows });

    try {
      revalidateTag('gemini-outages');
    } catch (revalidateErr) {
      const message = revalidateErr instanceof Error ? revalidateErr.message : String(revalidateErr);
      console.warn('admin: failed to revalidate gemini-outages tag after manual override:', message);
    }
  } catch (writeErr) {
    const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
    return serverError(`Could not save manual overrides to KV: ${message}`);
  }

  return ok({ ok: true, servedAt });
}

export async function GET(request: NextRequest) {
  const bearer = request.headers.get('authorization');
  if (process.env.GEMINI_API_KEY) {
    if (bearer !== `Bearer ${process.env.GEMINI_API_KEY}`) {
      return unauthorized({ error: 'Unauthorized. Please check your GEMINI_API_KEY.' });
    }
  } else {
    return serverError('GEMINI_API_KEY is not configured on this project.');
  }

  try {
    const data = await redis.get<{ servedAt: string; rows: unknown[] }>('manual-outages');
    return NextResponse.json(
      data ?? { servedAt: new Date().toISOString(), rows: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (readErr) {
    const message = readErr instanceof Error ? readErr.message : String(readErr);
    return serverError(`Could not read manual overrides from KV: ${message}`);
  }
}


