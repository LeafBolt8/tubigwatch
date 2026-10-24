import type { Outage } from '@/lib/schemas/outage';
import type { OutageStatus } from '@/lib/schemas/outage-status';

/**
 * Effective status for an outage row.
 *
 * A past `endsAt` always means restored, regardless of the raw status. Otherwise the raw status
 * wins; only rows without one fall back to the schedule. Shared by the map page and its pins so a
 * city's marker colour cannot disagree with the rows it represents.
 */
export function computeStatus(outage: Outage, now: Date): OutageStatus {
  const endsAt = outage.endsAt ? new Date(outage.endsAt) : null;
  if (endsAt && endsAt <= now) {
    return 'restored';
  }

  if (outage.status) return outage.status;

  const startsAt = outage.startsAt ? new Date(outage.startsAt) : null;
  if (!startsAt && !endsAt) return 'unknown';

  const started = startsAt !== null && startsAt <= now;
  if (outage.scheduled) return 'scheduled';
  if (started) return 'active';
  return 'unknown';
}
