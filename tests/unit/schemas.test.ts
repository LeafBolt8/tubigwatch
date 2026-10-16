import { describe, expect, test } from 'vitest';

import { outageFixtures } from '@/lib/ingestion/__fixtures__/outages';
import { classifyFreshness, OutageSchema, type Outage } from '@/lib/schemas';

function firstFixture(): Outage {
  const [fixture] = outageFixtures;
  if (!fixture) throw new Error('fixture list is empty');
  return fixture;
}

describe('OutageSchema', () => {
  test('parses every fixture', () => {
    for (const fixture of outageFixtures) {
      const result = OutageSchema.safeParse(fixture);
      if (!result.success) {
        throw new Error(`${fixture.id} failed to parse: ${JSON.stringify(result.error.issues)}`);
      }
      expect(result.data.id).toBe(fixture.id);
    }
  });

  test('rejects a record missing required fields', () => {
    const missingStatus: Record<string, unknown> = { ...firstFixture() };
    delete missingStatus.status;
    expect(OutageSchema.safeParse(missingStatus).success).toBe(false);
  });

  test('rejects HTML in reason', () => {
    const withHtml = { ...firstFixture(), reason: '<script>alert(1)</script>' };
    expect(OutageSchema.safeParse(withHtml).success).toBe(false);
  });

  test('rejects an ISO date with no offset', () => {
    const noOffset = { ...firstFixture(), startsAt: '2026-10-16T06:00:00' };
    expect(OutageSchema.safeParse(noOffset).success).toBe(false);
  });

  test('rejects unknown keys', () => {
    const withExtra = { ...firstFixture(), surprise: true };
    expect(OutageSchema.safeParse(withExtra).success).toBe(false);
  });

  test('fixtures cover the required status mix, areas, and concessionaires', () => {
    const statusCounts = outageFixtures.reduce<Record<string, number>>((counts, outage) => {
      counts[outage.status] = (counts[outage.status] ?? 0) + 1;
      return counts;
    }, {});
    expect(statusCounts).toEqual({ active: 2, scheduled: 2, restored: 1, cancelled: 1 });

    const barangayNames = outageFixtures.flatMap((outage) =>
      outage.affectedAreas.flatMap((area) => area.barangays.map((barangay) => barangay.name)),
    );
    expect(barangayNames).toEqual(
      expect.arrayContaining(['Kalusugan', 'Poblacion', 'Ususan', 'Kapitolyo', 'Barangay 176']),
    );

    const concessionaires = new Set(outageFixtures.map((outage) => outage.concessionaire));
    expect(concessionaires).toEqual(new Set(['maynilad', 'manila-water']));
  });
});

describe('classifyFreshness', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const hoursBefore = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  test('1h is fresh', () => {
    expect(classifyFreshness(hoursBefore(1), now)).toBe('fresh');
  });

  test('3h is stale', () => {
    expect(classifyFreshness(hoursBefore(3), now)).toBe('stale');
  });

  test('25h is unavailable', () => {
    expect(classifyFreshness(hoursBefore(25), now)).toBe('unavailable');
  });

  test('boundaries: exactly 2h is stale, exactly 24h is unavailable', () => {
    expect(classifyFreshness(hoursBefore(2), now)).toBe('stale');
    expect(classifyFreshness(hoursBefore(24), now)).toBe('unavailable');
  });

  test('defaults now to the present', () => {
    expect(classifyFreshness(new Date())).toBe('fresh');
  });
});
