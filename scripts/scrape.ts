import { Redis } from '@upstash/redis';
import webpush from 'web-push';

import { fetchMayniladOutages } from '../src/lib/ingestion/maynilad';
import { fetchManilaWaterOutages } from '../src/lib/ingestion/manila-water';
import { normalizeOutages } from '../src/lib/utils/normalize-outages';
import { cleanBarangayName } from '../src/lib/utils/barangay-name';
import type { Outage } from '../src/lib/schemas/outage';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const PUSH_KEY_PREFIX = 'push-sub:';

type Favorite = { type: 'city' | 'barangay'; name: string };

type PushSubscriptionRecord = {
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
  favorites: Favorite[];
};

type StoredSnapshot = { outages: Outage[]; timestamp: number };

/** Returns the display location that matched, or null when this outage is outside the pins. */
function matchOutage(outage: Outage, favorites: Favorite[]): string | null {
  for (const favorite of favorites) {
    if (favorite.type === 'city') {
      const matchesCity =
        outage.city === favorite.name ||
        outage.affectedAreas.some((area) =>
          area.barangays.some((barangay) => barangay.city === favorite.name),
        );
      if (matchesCity) return favorite.name;
      continue;
    }

    for (const area of outage.affectedAreas) {
      for (const barangay of area.barangays) {
        if (cleanBarangayName(barangay.name) === favorite.name) {
          return barangay.name;
        }
      }
    }
  }

  return null;
}

/**
 * Sends one notification per subscription that has at least one favorite matching a newly seen
 * outage. Runs after the snapshot is saved so a push failure can never roll back ingestion.
 */
async function notifyNewOutages(newOutages: Outage[]): Promise<void> {
  if (newOutages.length === 0) return;

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    console.warn('Push: VAPID credentials are not configured; skipping notifications.');
    return;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (error) {
    console.error('Push: invalid VAPID configuration; skipping notifications.', error);
    return;
  }

  let keys: string[];
  try {
    keys = await redis.keys(`${PUSH_KEY_PREFIX}*`);
  } catch (error) {
    console.error('Push: could not list subscriptions.', error);
    return;
  }

  let sent = 0;
  let skipped = 0;
  let removed = 0;

  for (const key of keys) {
    try {
      const record = await redis.get<PushSubscriptionRecord>(key);
      if (!record || !Array.isArray(record.favorites)) {
        await redis.del(key);
        removed += 1;
        continue;
      }

      let matchedLocation: string | null = null;
      for (const outage of newOutages) {
        matchedLocation = matchOutage(outage, record.favorites);
        if (matchedLocation) break;
      }

      if (!matchedLocation) {
        skipped += 1;
        continue;
      }

      await webpush.sendNotification(
        record.subscription,
        JSON.stringify({
          title: 'TubigWatch Alert',
          body: `New outage in ${matchedLocation}`,
          url: '/',
        }),
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        try {
          await redis.del(key);
          removed += 1;
        } catch (deleteError) {
          console.error('Push: could not remove a dead subscription.', deleteError);
        }
      } else {
        console.error('Push: could not send a notification.', error);
      }
    }
  }

  console.warn(
    `Push: sent ${sent}, skipped ${skipped}, removed ${removed} dead subscription(s).`,
  );
}

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

  // Diff against the snapshot we are about to replace. A missing previous snapshot means this is
  // the first observation, not a page of new outages, so subscriptions stay quiet on a cold start.
  let newOutages: Outage[] = [];
  try {
    const previous = await redis.get<StoredSnapshot>('last-known-good-outages');
    if (previous && Array.isArray(previous.outages) && previous.outages.length > 0) {
      const previousIds = new Set(previous.outages.map((outage) => outage.id));
      newOutages = normalized.filter((outage) => !previousIds.has(outage.id));
    }
  } catch (error) {
    console.error('Could not read the previous snapshot for push matching.', error);
  }

  if (normalized.length > 0) {
    await redis.set('last-known-good-outages', {
      outages: normalized,
      timestamp: Date.now(),
    });
    console.log(`SUCCESS: Saved ${normalized.length} outages to Redis.`);

    try {
      await notifyNewOutages(newOutages);
    } catch (error) {
      console.error('Push notification pass failed; the snapshot was still saved.', error);
    }
  } else {
    console.error('FAILED: No outages found. Cache not updated.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
