import { GoogleGenAI, type ToolUnion } from '@google/genai';
import { GeminiOutagesJsonSchema, validateGeminiOutagesPayload } from './gemini-schema';
import type { Outage } from '@/lib/schemas/outage';

const GENAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type GeminiExtractResult = {
  outages: Outage[];
  error: string | null;
};

export async function extractOutagesFromUrl(url: string): Promise<GeminiExtractResult> {
  const prompt =
    'Extract all water service interruptions from this page into the provided JSON schema. If no outages are present, return an empty array.';

  const model = 'gemini-3.5-flash';

  const tools: ToolUnion[] = [
    {
      urlContext: {
        urls: [url],
      },
    },
  ];

  const response = await GENAI.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { text: `Page URL: ${url}` },
        ],
      },
    ],
    config: {
      tools,
      responseMimeType: 'application/json',
      responseSchema: GeminiOutagesJsonSchema,
    },
  });

  const raw = response.text ?? '';
  const parsed = validateGeminiOutagesPayload(JSON.parse(raw));

  if (!parsed.success) {
    return {
      outages: [],
      error: `gemini parse failed: ${parsed.error.message}`,
    };
  }

  return {
    outages: parsed.data.outages,
    error: null,
  };
}
