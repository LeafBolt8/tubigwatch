import { GoogleGenAI } from '@google/genai';
import {
  GeminiOutagesJsonSchema,
  validateGeminiRawPayload,
  hydrateGeminiOutages,
} from './gemini-schema';
import type { Outage } from '@/lib/schemas/outage';

const GENAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiExtractResult = {
  outages: Outage[];
  error: string | null;
};

export async function extractOutagesFromUrl(
  url: string,
  concessionaire: 'maynilad' | 'manila-water' = 'maynilad',
): Promise<GeminiExtractResult> {
  const operator = concessionaire === 'manila-water' ? 'Manila Water' : 'Maynilad';

  const prompt = `Extract all water service interruptions from this page into the provided JSON schema. If no outages are present, return an empty array. The URL is: ${url}

IMPORTANT: This page belongs to ${operator}. Set the \`concessionaire\` field to "${concessionaire}" on every outage you extract.

IMPORTANT: The \`affectedAreas\` field must be an array. Each barangay must be a separate object in the \`barangays\` array. If the website says 'Brgys. 36, 162 and 164', split them into 3 separate barangay objects (e.g., name: '36', name: '162', name: '164'). If it says 'Brgys. 198 to 220', expand the range into individual barangay objects (e.g., '198', '199', '200'). Do not leave a comma-separated list inside a single object.

IMPORTANT: You must extract data from BOTH the 'Emergency Water Service Interruption Schedule' AND the 'Scheduled Water Service Interruptions' tables. Do not skip the Scheduled table. Ensure you capture every row from both tables.

IMPORTANT: Do not combine different cities into a single outage. Each distinct row in the table must be its own outage object. If two rows share the same reason and date/time window but are in different cities, keep them as separate outages.`;

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await GENAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: [prompt],
        config: {
          tools: [{ urlContext: {} }],
          responseMimeType: 'application/json',
          responseSchema: GeminiOutagesJsonSchema,
        },
      });

      const raw = response.text ?? '';
      const parsed = validateGeminiRawPayload(JSON.parse(raw));

      if (!parsed.success) {
        return { outages: [], error: `gemini parse failed: ${parsed.error.message}` };
      }

      const fetchedAt = new Date();
      const hydrated = hydrateGeminiOutages(parsed.data, url, fetchedAt);

      return {
        outages: hydrated.filter((o): o is Outage => o !== null),
        error: hydrated.some((o) => o === null)
          ? `gemini hydration skipped ${hydrated.filter((o) => o === null).length} row(s)`
          : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Gemini Extraction Failed] ${url}:`, message);

      if (
        attempt < 3 &&
        (message.includes('503') || message.includes('UNAVAILABLE'))
      ) {
        await delay(2000);
        continue;
      }

      return { outages: [], error: message };
    }
  }

  return { outages: [], error: 'gemini: exhausted retries after 503/UNAVAILABLE' };
}
