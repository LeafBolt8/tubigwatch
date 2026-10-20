import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { OutageSchema } from '@/lib/schemas/outage';

const MANUAL_PATH = join(process.cwd(), 'manual-outages.json');

function omitRawPrivacy(raw: object) {
  return JSON.parse(JSON.stringify(raw, (_, v) => (v && typeof v === 'string' && v.startsWith('$2b$')) ? '[REDACTED]' : v));
}

export async function POST(request: NextRequest) {
  if (process.env.GEMINI_API_KEY) {
    const bearer = request.headers.get('authorization');
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

  // Backdate servedAt so the stale cache entry is always newer than manual rows → manual rows win on dedup.
  const servedAt = new Date(Date.now() - 60_000).toISOString();
  const payload = {
    servedAt,
    rows: parsed.data.map((o) => omitRawPrivacy(o)),
  };

  try {
    await writeFile(MANUAL_PATH, JSON.stringify(payload, null, 2) + '\n', { flag: 'w' });
  } catch (writeErr) {
    const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
    return NextResponse.json({ error: `Could not write manual-outages.json: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, servedAt });
}

export async function GET(request: NextRequest) {
  if (process.env.GEMINI_API_KEY) {
    const bearer = request.headers.get('authorization');
    if (bearer !== `Bearer ${process.env.GEMINI_API_KEY}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  const content = existsSync(MANUAL_PATH) ? await readFile(MANUAL_PATH, 'utf8') : '[]';
  return NextResponse.json(JSON.parse(content), { headers: { 'Cache-Control': 'no-store' } });
}
