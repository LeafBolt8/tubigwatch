import { describe, expect, test } from 'vitest';

import { OutageSchema } from '@/lib/schemas/outage';
import { computeStatus } from '@/lib/utils/outage-status';

const NOW = new Date('2026-10-25T12:00:00+08:00');

function build(overrides: Record<string, unknown> = {}) {
  return OutageSchema.parse({
    id: 'test-outage',
    concessionaire: 'maynilad',
    status: 'scheduled',
    reason: 'Mainline repair along Quirino Highway.',
    startsAt: '2026-10-25T10:00:00+08:00',
    endsAt: '2026-10-25T18:00:00+08:00',
    affectedAreas: [
      {
        barangays: [{ name: 'Kalusugan', city: 'Quezon City', province: 'Metro Manila' }],
      },
    ],
    source: {
      url: 'https://www.mayniladwater.com.ph/advisories/test',
      fetchedAt: '2026-10-25T09:00:00+08:00',
    },
    confidence: 'official',
    ...overrides,
  });
}

describe('computeStatus', () => {
  test('treats a row labelled scheduled whose window has started as active', () => {
    expect(computeStatus(build({ status: 'scheduled' }), NOW)).toBe('active');
  });

  test('treats a row labelled active whose window is still ahead as scheduled', () => {
    const outage = build({
      status: 'active',
      startsAt: '2026-10-26T08:00:00+08:00',
      endsAt: '2026-10-26T16:00:00+08:00',
    });
    expect(computeStatus(outage, NOW)).toBe('scheduled');
  });

  test('restores a row whose end time has passed, whatever the raw status says', () => {
    const outage = build({
      status: 'active',
      startsAt: '2026-10-24T08:00:00+08:00',
      endsAt: '2026-10-24T16:00:00+08:00',
    });
    expect(computeStatus(outage, NOW)).toBe('restored');
  });

  test('respects an explicit cancellation even after the window has passed', () => {
    const outage = build({
      status: 'cancelled',
      startsAt: '2026-10-24T08:00:00+08:00',
      endsAt: '2026-10-24T16:00:00+08:00',
    });
    expect(computeStatus(outage, NOW)).toBe('cancelled');
  });

  test('keeps a started outage without an end time active', () => {
    const outage = build({ endsAt: undefined });
    expect(computeStatus(outage, NOW)).toBe('active');
  });

  test('keeps a future outage without an end time scheduled', () => {
    const outage = build({ endsAt: undefined, startsAt: '2026-10-27T08:00:00+08:00' });
    expect(computeStatus(outage, NOW)).toBe('scheduled');
  });
});
