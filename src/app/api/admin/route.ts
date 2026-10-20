import { NextRequest, NextResponse } from 'next/server';

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

function snapshotRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Array)) {
      out[key] = snapshotRecord(value as Record<string, unknown>);
      continue;
    }
    if (typeof value === 'string' && (value.startsWith('$2b$') || value.startsWith('sk_live_') || value.startsWith('sk_live-') || value.startsWith('pk_live_') || value.startsWith('pk_live-'))) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sanitizePayload(values: unknown): unknown {
  if (Array.isArray(values)) {
    return values.map(snapshotRecord);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return snapshotRecord(value as Record<string, unknown>);
  }

  return value;
}

function safeReadKV<T>(key: string): Promise<T | null> {
  try {
    return await kv.get<T>(key);
  } catch (err) {
    console.error(`KV read failed for key ${key}:`, err);
    return null;
  }
}

function safeWriteKV(key: string, value: unknown): Promise<void> {
  try {
    return kv.set(key, sanitizeBlurhash(value));
  } catch (err) {
    return Promise.reject(err);
  }
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
    const data = await safeReadKV<'manual-outages'>('manual-outages');
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
