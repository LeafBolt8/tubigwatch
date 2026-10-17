import { GoogleGenAI } from '@google/genai';
import {
  GeminiOutagesJsonSchema,
  validateGeminiRawPayload,
  hydrateGeminiOutages,
} from './gemini-schema';
import type { Outage } from '@/lib/schemas/outage';

const GENAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type GeminiExtractResult = {
  outages: Outage[];
  error: string | null;
};

export async function extractOutagesFromUrl(url: string): Promise<GeminiExtractResult> {
  const prompt = `Extract all water service interruptions from this page into the provided JSON schema. If no outages are present, return an empty array. The URL is: ${url}`;
  const model = 'gemini-3.5-flash';

  try {
    const response = await GENAI.models.generateContent({
      model,
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
    return { outages: [], error: error instanceof Error ? error.message : String(error) };
  }
}
