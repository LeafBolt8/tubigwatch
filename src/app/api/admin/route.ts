import { NextRequest, NextResponse } from 'next/server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { timingSafeEqual } from 'crypto';

import { OutageSchema } from '@/lib/schemas/outage';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

// Five attempts per minute per address is enough for an operator who mistypes a password and
// too few for a scripted brute-force run. GET shares the bucket because reading overrides is
// part of the same admin surface.
const limiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  prefix: 'tubigwatch:admin',
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

/**
 * The first X-Forwarded-For entry is the client address Vercel prepends. Keeping only that entry
 * stops a caller from getting a fresh bucket by appending extra hops; x-real-ip covers proxies
 * that set only that header.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

async function rateLimitError(request: NextRequest): Promise<NextResponse | null> {
  const { success } = await limiter.limit(clientIp(request));
  if (success) return null;

  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * The panel sends its password URI-encoded, so decode before comparing; a password containing
 * a space, "+" or "%" would otherwise never match. A malformed escape falls back to the raw
 * value rather than throwing.
 */
function decodeToken(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Gates the admin routes on ADMIN_PASSWORD. Kept separate from GEMINI_API_KEY on purpose: the
 * admin password grants write access to manual overrides, and reusing the provider key for that
 * forced one credential to serve two very different trust boundaries.
 */
function adminAuthError(request: NextRequest): NextResponse | null {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return serverError('ADMIN_PASSWORD is not configured');
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? decodeToken(header.slice(7)) : null;

  const isValid = token && token.length === adminPassword.length && timingSafeEqual(Buffer.from(token), Buffer.from(adminPassword));
  if (!isValid) {
    return unauthorized({ error: 'Unauthorized. Check the admin password.' });
  }

  return null;
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
  const rateLimited = await rateLimitError(request);
  if (rateLimited) return rateLimited;

  const authError = adminAuthError(request);
  if (authError) return authError;

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
      revalidateTag('gemini-outages-redis-v3');
    } catch (revalidateErr) {
      const message = revalidateErr instanceof Error ? revalidateErr.message : String(revalidateErr);
      console.warn('admin: failed to revalidate gemini-outages-redis-v3 tag after manual override:', message);
    }

    try {
      revalidatePath('/');
    } catch (revalidatePathErr) {
      const message = revalidatePathErr instanceof Error ? revalidatePathErr.message : String(revalidatePathErr);
      console.warn('admin: failed to revalidate / after manual override:', message);
    }
  } catch (writeErr) {
    const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
    return serverError(`Could not save manual overrides to KV: ${message}`);
  }

  return ok({ ok: true, servedAt });
}

export async function GET(request: NextRequest) {
  const rateLimited = await rateLimitError(request);
  if (rateLimited) return rateLimited;

  const authError = adminAuthError(request);
  if (authError) return authError;

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


