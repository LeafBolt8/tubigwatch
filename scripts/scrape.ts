import { Redis } from '@upstash/redis';

import { fetchMayniladOutages } from '../src/lib/ingestion/maynilad';
import { fetchManilaWaterOutages } from '../src/lib/ingestion/manila-water';
import { normalizeOutages } from '../src/lib/utils/normalize-outages';
import type { Outage } from '../src/lib/schemas/outage';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

async function main() {
  console.log('Starting GitHub Action scrape...');

  let mayniladOutages: Outage[] = [];
  try {
    const res = await fetchMayniladOutages({ timeoutMs: 500000 }); // Allow 8 minutes
    mayniladOutages = res.outages;
    console.log(`Maynilad: ${mayniladOutages.length} outages`);
  } catch (e) {
    console.error('Maynilad scrape failed', e);
  }

  let manilaWaterOutages: Outage[] = [];
  try {
    const res = await fetchManilaWaterOutages();
    manilaWaterOutages = res.outages;
    console.log(`Manila Water: ${manilaWaterOutages.length} outages`);
  } catch (e) {
    console.error('Manila Water scrape failed', e);
  }

  const merged = [...mayniladOutages, ...manilaWaterOutages];
  const normalized = normalizeOutages(merged);

  if (normalized.length > 0) {
    await redis.set('last-known-good-outages', {
      outages: normalized,
      timestamp: Date.now(),
    });
    console.log(`SUCCESS: Saved ${normalized.length} outages to Redis.`);
  } else {
    console.error('FAILED: No outages found. Cache not updated.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
