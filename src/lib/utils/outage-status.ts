import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

/**
 * Effective status for an outage row, derived from its timestamps.
 *
 * The upstream APIs mislabel rows — a month-long maintenance job can stay `scheduled` after it
 * starts, and a future window can arrive labelled `active` — so the clock decides, not the raw
 * status. Cancellation is the one exception: withdrawing a job is a decision the clock cannot see.
 * Shared by the dashboard, the map page and the map pins so they cannot disagree.
 *
 * Open-ended rows (a start time but no end time) would otherwise stay active forever. Missing an
 * end time is an upstream gap, not a promise of indefinite interruption, so anything left open for
 * `OPEN_ENDED_STALENESS_DAYS` is treated as restored and drops off the board.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_ENDED_STALENESS_DAYS = 14;

export function computeStatus(outage: Outage, now: Date): OutageStatus {
  if (outage.status === 'cancelled') return 'cancelled';

  const currentTime = now.getTime();
  const startsAt = outage.startsAt ? new Date(outage.startsAt).getTime() : null;
  const endsAt = outage.endsAt ? new Date(outage.endsAt).getTime() : null;

  if (endsAt !== null && endsAt <= currentTime) {
    return 'restored';
  }

  if (startsAt !== null && startsAt <= currentTime) {
    if (endsAt === null) {
      return startsAt < currentTime - OPEN_ENDED_STALENESS_DAYS * DAY_MS ? 'restored' : 'active';
    }
    if (endsAt > currentTime) {
      return 'active';
    }
  }

  if (startsAt !== null && startsAt > currentTime) {
    return 'scheduled';
  }

  // Only reachable when a timestamp is missing or unparseable; trust the source as a last resort.
  if (outage.status) return outage.status;
  if (outage.scheduled) return 'scheduled';

  return 'unknown';
}
