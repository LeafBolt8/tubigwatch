import { NextRequest, NextResponse } from 'next/server';

import { Redis } from '@upstash/redis';
import { z } from 'zod';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '',
});

const FavoriteSchema = z.object({
  type: z.enum(['city', 'barangay']),
  name: z.string().min(1).max(200),
});

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  }),
  favorites: z.array(FavoriteSchema).max(200).default([]),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid push subscription payload.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { subscription, favorites } = parsed.data;

  try {
    await redis.set(`push-sub:${subscription.endpoint}`, { subscription, favorites });
  } catch (error) {
    console.error('Failed to save push subscription:', error);
    return NextResponse.json({ error: 'Could not save subscription.' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
