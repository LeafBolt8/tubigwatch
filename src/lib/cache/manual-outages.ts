import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { OutageSchema } from '@/lib/schemas/outage';
import type { Outage } from '@/lib/schemas/outage';

const MANUAL_PATH = join(process.cwd(), 'manual-outages.json');

export async function readManualOutages(): Promise<Outage[]> {
  if (!existsSync(MANUAL_PATH)) return [];

  const raw = await readFile(MANUAL_PATH, 'utf8');
  const parsed = JSON.parse(raw) as { servedAt: string; rows: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.rows)) return [];

  const result = OutageSchema.array().safeParse(parsed.rows);
  if (!result.success) return [];

  return result.data;
}
