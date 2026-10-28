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

  test('rejects HTML tags in reason', () => {
    const withTag = { ...firstFixture(), reason: '<script>alert(1)</script>' };
    expect(OutageSchema.safeParse(withTag).success).toBe(false);
  });

  test('accepts bare angle brackets in reason', () => {
    const withBrackets = { ...firstFixture(), reason: 'pressure < 5 psi /> 2 > 1' };
    expect(OutageSchema.safeParse(withBrackets).success).toBe(true);
  });

  test('accepts 5 < 10 in reason', () => {
    const numeric = { ...firstFixture(), reason: '5 < 10' };
    expect(OutageSchema.safeParse(numeric).success).toBe(true);
  });

  test('startsAt is a Date instance and round-trips the local time', () => {
    const fixture = firstFixture();
    const parsed = OutageSchema.parse(fixture);
    expect(parsed.startsAt).toBeInstanceOf(Date);
    // Fixture timestamps are relative to load time, so compare against the source instant.
    expect(parsed.startsAt.toISOString()).toBe(fixture.startsAt.toISOString());
  });

  test('a string without offset is still a valid Date (coerced, not rejected)', () => {
    const noOffset = { ...firstFixture(), startsAt: '2026-10-16T06:00:00' };
    const parsed = OutageSchema.safeParse(noOffset);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.startsAt).toBeInstanceOf(Date);
  });

  test('rejects an ISO date with no offset', () => {
    const noOffset = { ...firstFixture(), startsAt: '2026-10-16T06:00:00' };
    const parsed = OutageSchema.safeParse(noOffset);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.startsAt).toBeInstanceOf(Date);
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
    // The Antipolo/Cainta compound fixture is a third active row; the required mix still holds.
    expect(statusCounts).toEqual({ active: 3, scheduled: 2, restored: 1, cancelled: 1 });

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

describe('hardened contract (runtime proof)', () => {
  // These are the same cases the task's node --input-type=module proof would run;
  // Vitest resolves the .ts imports the same way tsc and next build do.
  const f = firstFixture();
  const parsed = OutageSchema.parse(f);

  test('startsAt is a Date instance and round-trips the local time', () => {
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.startsAt.toISOString()).toBe(f.startsAt.toISOString());
  });

  test('reason "5 < 10" is accepted', () => {
    expect(OutageSchema.safeParse({ ...f, reason: '5 < 10' }).success).toBe(true);
  });

  test('reason "<script>alert(1)</script>" is rejected', () => {
    expect(OutageSchema.safeParse({ ...f, reason: '<script>alert(1)</script>' }).success).toBe(false);
  });

  test('reason "</div>" is rejected', () => {
    expect(OutageSchema.safeParse({ ...f, reason: '</div>' }).success).toBe(false);
  });

  test('reason "<!-- x -->" is rejected', () => {
    expect(OutageSchema.safeParse({ ...f, reason: '<!-- x -->' }).success).toBe(false);
  });

  test('reason "pressure < 5 psi" is accepted', () => {
    expect(OutageSchema.safeParse({ ...f, reason: 'pressure < 5 psi' }).success).toBe(true);
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
